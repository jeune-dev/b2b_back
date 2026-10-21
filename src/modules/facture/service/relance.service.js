'use strict';

const { QueryTypes } = require('sequelize');
const sequelize = require('../../../config/db.js');
const { Invoice, InvoiceReminder, Company } = require('../../../models/index.js');
const { P } = require('../../../config/permissions.js');
const { DEFAUTS_ENTREPRISE } = require('../../../config/parametres.js');
const { ConflictError } = require('../../../errors/AppError.js');
const { chargerPartage } = require('../../../utils/acces.js');
const { aujourdhui, formatFr } = require('../../../utils/dates.js');
const { formatFcfa } = require('../../../utils/montants.js');
const logger = require('../../../utils/logger.js');
const email = require('../../../infrastructure/email.service.js');
const { journaliser } = require('../../audit/service/audit.service.js');
const { notifierEntreprise } = require('../../notification/service/notification.service.js');

/**
 * Relances des factures impayées (§ 17 « échéance ou montant dû »).
 *
 *   - AUTOMATIQUES et GRADUÉES : aux paliers de jours après l'échéance
 *     choisis par le fournisseur (par défaut J+3, J+7, J+15), le client
 *     débiteur reçoit un e-mail et une notification ; chaque palier n'est
 *     envoyé qu'UNE fois (index unique) — après une interruption de la
 *     tâche, seul le palier le plus élevé atteint part ;
 *   - MANUELLES : le fournisseur relance une facture ouverte, au plus une
 *     fois par 24 heures.
 * Une facture bloquée par un écart de rapprochement n'est jamais relancée :
 * elle n'est pas payable.
 */

const NIVEAUX = Object.freeze(['Rappel', 'Deuxième rappel', 'Dernier rappel']);
const libelleNiveau = (n) => (n === 0 ? 'Rappel' : NIVEAUX[Math.min(n, NIVEAUX.length) - 1]);

function message(niveau, f) {
  const reste = formatFcfa(Number(f.total) - Number(f.amount_paid));
  const base = `La facture ${f.number} de ${f.fournisseur}, échue le ${formatFr(f.due_date)}, présente un solde de ${reste}.`;
  if (niveau >= NIVEAUX.length) return `${base} Sans règlement de votre part, ${f.fournisseur} pourrait suspendre ses livraisons. Merci de régulariser au plus vite ou de contacter votre fournisseur.`;
  if (niveau === 2) return `${base} Merci de procéder à son règlement dans les meilleurs délais.`;
  return `${base} Si le règlement a déjà été effectué, déclarez-le dans Pro2Link pour que votre fournisseur le confirme.`;
}

/** E-mail et notification au client ; trace de la relance. */
async function envoyer(t, f, { niveau, canal, joursRetard, envoyePar = null }) {
  const reste = Number(f.total) - Number(f.amount_paid);
  const titre = `${libelleNiveau(niveau)} — facture ${f.number}`;
  const corps = message(niveau, f);
  await InvoiceReminder.create({
    invoice_id: f.id, level: niveau, channel: canal, days_overdue: joursRetard, amount_due: reste, emailed: Boolean(f.email_client), sent_by: envoyePar,
  }, { transaction: t });
  await sequelize.query(
    'UPDATE invoices SET reminders_count = reminders_count + 1, last_reminder_at = now() WHERE id = :id',
    { replacements: { id: f.id }, transaction: t }
  );
  await notifierEntreprise(t, f.buyer_company_id, P.FACTURES_LIRE, {
    type: 'relance_facture', titre, corps, donnees: { invoice_id: f.id, level: niveau },
  });
  if (f.email_client) {
    t.afterCommit(() => email.envoyerAvis({ email: f.email_client, titre, texte: corps, lien: `/factures/${f.id}` })
      .catch((err) => logger.warn('[relance] E-mail impossible', { invoice_id: f.id, error: err.message })));
  }
}

const REQUETE_ECHUES = `
  SELECT i.id, i.number, i.total, i.amount_paid, i.due_date::text AS due_date, i.buyer_company_id, i.supplier_company_id,
         (CAST(:jour AS date) - i.due_date) AS jours_retard,
         fou.name AS fournisseur, fou.settings AS reglages, ach.email AS email_client,
         (SELECT max(r.level) FROM invoice_reminders r WHERE r.invoice_id = i.id AND r.channel = 'auto') AS dernier_niveau
    FROM invoices i
    JOIN companies fou ON fou.id = i.supplier_company_id
    JOIN companies ach ON ach.id = i.buyer_company_id
   WHERE i.status IN ('emise', 'partiellement_payee', 'en_retard') AND i.due_date < :jour
     AND i.match_status NOT IN ('ecart', 'conteste')`;

/**
 * Tâche quotidienne : relances automatiques dues aujourd'hui.
 * @returns {Promise<number>} relances envoyées
 */
async function relancesAutomatiques(jour = aujourdhui()) {
  const echues = await sequelize.query(REQUETE_ECHUES, { replacements: { jour }, type: QueryTypes.SELECT });
  let envoyees = 0;
  for (const f of echues) {
    const reglages = { ...DEFAUTS_ENTREPRISE, ...(f.reglages || {}) };
    if (!reglages.dunning_enabled) continue;
    const paliers = [...reglages.dunning_days_after_due].sort((a, b) => a - b);
    const atteint = paliers.filter((j) => f.jours_retard >= j).length;
    if (!atteint || atteint <= (f.dernier_niveau || 0)) continue;
    try {
      await sequelize.transaction((t) => envoyer(t, f, { niveau: atteint, canal: 'auto', joursRetard: f.jours_retard }));
      envoyees += 1;
    } catch (err) {
      // Index unique : une autre exécution vient d'envoyer ce palier.
      if (err.name !== 'SequelizeUniqueConstraintError') throw err;
    }
  }
  if (envoyees) logger.info(`[factures] ${envoyees} relance(s) de facture(s) impayée(s) envoyée(s)`);
  return envoyees;
}

const DELAI_MANUEL_MS = 24 * 3600 * 1000;

/** Relance manuelle d'une facture ouverte par le fournisseur. */
async function relancer(id, companyId, user) {
  await sequelize.transaction(async (t) => {
    const { ressource: facture } = await chargerPartage(Invoice, id, companyId, { transaction: t, lock: t.LOCK.UPDATE }, 'Facture', { cote: 'fournisseur' });
    if (!['emise', 'partiellement_payee', 'en_retard'].includes(facture.status)) {
      throw new ConflictError('Seule une facture non soldée peut être relancée.', 'FACTURE_NON_RELANCABLE', { statut: facture.status });
    }
    if (['ecart', 'conteste'].includes(facture.match_status)) {
      throw new ConflictError('Cette facture est bloquée par un écart de rapprochement : réglez d’abord l’écart avec votre client.', 'FACTURE_BLOQUEE');
    }
    if (facture.last_reminder_at && Date.now() - new Date(facture.last_reminder_at).getTime() < DELAI_MANUEL_MS) {
      throw new ConflictError('Cette facture a déjà été relancée il y a moins de 24 heures.', 'RELANCE_RECENTE', { last_reminder_at: facture.last_reminder_at });
    }
    const [fournisseur, client] = await Promise.all([
      Company.findByPk(companyId, { attributes: ['name'], transaction: t }),
      Company.findByPk(facture.buyer_company_id, { attributes: ['email'], transaction: t }),
    ]);
    const jour = aujourdhui();
    const joursRetard = Math.max(0, Math.round((new Date(`${jour}T00:00:00Z`) - new Date(`${facture.due_date}T00:00:00Z`)) / 86400000));
    await envoyer(t, {
      ...facture.get({ plain: true }), fournisseur: fournisseur.name, email_client: client.email,
    }, { niveau: 0, canal: 'manuel', joursRetard, envoyePar: user.id });
    await journaliser({ action: 'facture.relance', entityType: 'invoice', entityId: id, companyId, details: { number: facture.number, jours_retard: joursRetard } }, t);
  });
  return historique(id, companyId);
}

/** Relances d'une facture (des deux côtés). */
async function historique(id, companyId) {
  const { ressource: facture } = await chargerPartage(Invoice, id, companyId, { attributes: ['id', 'buyer_company_id', 'supplier_company_id', 'reminders_count', 'last_reminder_at'] }, 'Facture');
  const relances = await InvoiceReminder.findAll({ where: { invoice_id: id }, order: [['created_at', 'DESC'], ['id', 'DESC']] });
  return { reminders_count: facture.reminders_count, last_reminder_at: facture.last_reminder_at, reminders: relances };
}

module.exports = {
  relancesAutomatiques, relancer, historique,
};
