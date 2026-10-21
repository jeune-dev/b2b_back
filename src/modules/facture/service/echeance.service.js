'use strict';

const sequelize = require('../../../config/db.js');
const { P } = require('../../../config/permissions.js');
const { DEFAUTS_ENTREPRISE } = require('../../../config/parametres.js');
const { aujourdhui, formatFr } = require('../../../utils/dates.js');
const { formatFcfa } = require('../../../utils/montants.js');
const cache = require('../../../utils/cache.js');
const logger = require('../../../utils/logger.js');
const { notifierEntreprise } = require('../../notification/service/notification.service.js');
const relances = require('./relance.service.js');

/**
 * Échéances des factures (§ 17 « échéance ou montant dû », tâche quotidienne).
 *
 *   1. RAPPEL avant échéance : N jours avant (réglage du fournisseur,
 *      `invoice_reminder_days_before`), l'acheteur est prévenu — une fois.
 *   2. RETARD : une facture non soldée dont l'échéance est passée devient
 *      « en retard » ; l'acheteur et le fournisseur sont prévenus — une fois.
 *
 *   3. RELANCES graduées des factures échues (relance.service.js).
 * Chaque passage est idempotent (horodatages `due_soon_notified_at`,
 * `overdue_notified_at`) : relancer la tâche ne renvoie aucun doublon.
 */

async function rappelsAvantEcheance(jour = aujourdhui()) {
  return sequelize.transaction(async (t) => {
    const [lignes] = await sequelize.query(
      `UPDATE invoices i SET due_soon_notified_at = now()
         FROM companies c
        WHERE c.id = i.supplier_company_id
          AND i.status IN ('emise', 'partiellement_payee') AND i.due_soon_notified_at IS NULL
          AND i.due_date >= :jour
          AND i.due_date <= CAST(:jour AS date) + coalesce((c.settings->>'invoice_reminder_days_before')::int, :defaut)
        RETURNING i.id, i.number, i.total, i.amount_paid, i.due_date::text AS due_date, i.buyer_company_id, i.supplier_company_id, c.name AS fournisseur`,
      { replacements: { jour, defaut: DEFAUTS_ENTREPRISE.invoice_reminder_days_before }, transaction: t }
    );
    for (const f of lignes) {
      await notifierEntreprise(t, f.buyer_company_id, P.FACTURES_LIRE, {
        type: 'echeance',
        titre: `Échéance proche — facture ${f.number}`,
        corps: `La facture ${f.number} de ${f.fournisseur} (reste ${formatFcfa(Number(f.total) - Number(f.amount_paid))}) arrive à échéance le ${formatFr(f.due_date)}.`,
        donnees: { invoice_id: f.id },
      });
    }
    return lignes.length;
  });
}

async function marquerEnRetard(jour = aujourdhui()) {
  const entreprises = new Set();
  const nombre = await sequelize.transaction(async (t) => {
    const [lignes] = await sequelize.query(
      `UPDATE invoices i SET status = 'en_retard', overdue_notified_at = coalesce(i.overdue_notified_at, now()), updated_at = now()
         FROM companies fou, companies ach
        WHERE fou.id = i.supplier_company_id AND ach.id = i.buyer_company_id
          AND i.status IN ('emise', 'partiellement_payee') AND i.due_date < :jour
        RETURNING i.id, i.number, i.total, i.amount_paid, i.due_date::text AS due_date, i.buyer_company_id, i.supplier_company_id,
                  fou.name AS fournisseur, ach.name AS client`,
      { replacements: { jour }, transaction: t }
    );
    for (const f of lignes) {
      const reste = formatFcfa(Number(f.total) - Number(f.amount_paid));
      entreprises.add(f.buyer_company_id);
      entreprises.add(f.supplier_company_id);
      await notifierEntreprise(t, f.buyer_company_id, P.FACTURES_LIRE, {
        type: 'echeance',
        titre: `Facture en retard — ${f.number}`,
        corps: `La facture ${f.number} de ${f.fournisseur} est échue depuis le ${formatFr(f.due_date)} : ${reste} restent dus.`,
        donnees: { invoice_id: f.id },
      });
      await notifierEntreprise(t, f.supplier_company_id, P.FACTURES_LIRE, {
        type: 'echeance',
        titre: `Facture impayée — ${f.number}`,
        corps: `${f.client} n'a pas soldé la facture ${f.number} échue le ${formatFr(f.due_date)} : ${reste} restent dus.`,
        donnees: { invoice_id: f.id },
      });
    }
    if (lignes.length) {
      await sequelize.query(
        `INSERT INTO audit_logs (actor_role, action, entity_type, entity_id, company_id, details)
         SELECT 'systeme', 'facture.changement_statut', 'invoice', x.id::text, x.supplier_company_id, jsonb_build_object('a', 'en_retard')
           FROM unnest(ARRAY[:ids]::uuid[], ARRAY[:fournisseurs]::uuid[]) AS x(id, supplier_company_id)`,
        { replacements: { ids: lignes.map((l) => l.id), fournisseurs: lignes.map((l) => l.supplier_company_id) }, transaction: t }
      );
    }
    return lignes.length;
  });
  await Promise.all([...entreprises].map((id) => cache.invalider(`dashboard:*:${id}`)));
  if (nombre) logger.info(`[factures] ${nombre} facture(s) passée(s) en retard`);
  return nombre;
}

async function traiterEcheances() {
  return {
    rappels: await rappelsAvantEcheance(),
    en_retard: await marquerEnRetard(),
    relances: await relances.relancesAutomatiques(),
  };
}

module.exports = { rappelsAvantEcheance, marquerEnRetard, traiterEcheances };
