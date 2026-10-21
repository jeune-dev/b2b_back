'use strict';

const { Op } = require('sequelize');
const sequelize = require('../../../config/db.js');
const { Partnership, Company } = require('../../../models/index.js');
const { P } = require('../../../config/permissions.js');
const { parametresEntreprise } = require('../../../config/parametres.js');
const { ConflictError, ForbiddenError, ValidationError } = require('../../../errors/AppError.js');
const { chargerPartage } = require('../../../utils/acces.js');
const escapeLike = require('../../../utils/escapeLike.js');
const droits = require('../../abonnement/service/droits.service.js');
const { journaliser, difference } = require('../../audit/service/audit.service.js');
const { notifierEntreprise, synchroniser } = require('../../notification/service/notification.service.js');

/**
 * Relations fournisseurs / clients (§ 7).
 *
 * Un partenariat lie un ACHETEUR et un FOURNISSEUR de la plateforme. Il est
 * demandé par l'un, accepté (ou refusé) par l'autre — sauf si le fournisseur a
 * choisi l'acceptation automatique. Tant qu'il n'est pas ACTIF :
 *   - l'acheteur ne voit pas le catalogue du fournisseur (§ 8) ;
 *   - aucun bon de commande ne peut être envoyé (§ 9).
 * Suspendu par l'une des parties : plus de nouvelle commande ; les commandes
 * en cours, les factures et les paiements continuent (les dettes demeurent).
 *
 * Vu de l'entreprise connectée, `relation` désigne ce qu'est la
 * CONTREPARTIE : « fournisseur » (je lui achète) ou « client » (je lui vends).
 */

const ATTRIBUTS_PARTENAIRE = ['id', 'name', 'type', 'sector', 'city', 'country', 'phone', 'email', 'logo_document_id', 'status', 'ninea'];
const INCLUDES = [
  { model: Company, as: 'buyer', attributes: ATTRIBUTS_PARTENAIRE, paranoid: false },
  { model: Company, as: 'supplier', attributes: ATTRIBUTS_PARTENAIRE, paranoid: false },
];

/**
 * Indicateurs financiers d'un partenariat, calculés dans la requête (sous-
 * requêtes corrélées indexées) : jamais une requête par ligne de liste.
 * Solde = factures en vigueur − paiements confirmés (§ 16).
 */
const STATS = [
  [sequelize.literal(`(SELECT count(*)::int FROM orders o WHERE o.partnership_id = "Partnership"."id"
     AND o.status NOT IN ('brouillon', 'terminee', 'refusee', 'annulee'))`), 'orders_in_progress'],
  [sequelize.literal(`(SELECT coalesce(sum(i.total), 0) FROM invoices i WHERE i.partnership_id = "Partnership"."id" AND i.status <> 'annulee')`), 'invoiced_total'],
  [sequelize.literal(`(SELECT coalesce(sum(p.amount), 0) FROM payments p WHERE p.partnership_id = "Partnership"."id" AND p.status = 'confirme')`), 'paid_total'],
  [sequelize.literal(`(SELECT coalesce(sum(i.total - i.amount_paid), 0) FROM invoices i WHERE i.partnership_id = "Partnership"."id"
     AND i.status IN ('emise', 'partiellement_payee', 'en_retard') AND i.due_date < CURRENT_DATE)`), 'overdue_total'],
];

/** Représentation vue par `companyId` : la contrepartie, la relation, SES notes seulement. */
function versApi(partenariat, companyId) {
  const p = partenariat.toJSON();
  const acheteur = p.buyer_company_id === companyId;
  const contrepartie = acheteur ? p.supplier : p.buyer;
  const resultat = {
    id: p.id,
    status: p.status,
    relation: acheteur ? 'fournisseur' : 'client',
    partner: contrepartie ? {
      ...contrepartie,
      logo_url: contrepartie.logo_document_id ? `/api/v1/documents/${contrepartie.logo_document_id}/fichier` : null,
    } : null,
    buyer_company_id: p.buyer_company_id,
    supplier_company_id: p.supplier_company_id,
    requested_by_me: p.requested_by_company_id === companyId,
    request_message: p.request_message,
    responded_at: p.responded_at,
    payment_terms_days: p.payment_terms_days,
    supplier_customer_code: p.supplier_customer_code,
    my_notes: acheteur ? p.buyer_notes : p.supplier_notes,
    suspended_by_me: p.suspended_by_company_id ? p.suspended_by_company_id === companyId : null,
    suspended_reason: p.suspended_reason,
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
  if ('invoiced_total' in p) {
    const invoiced = Number(p.invoiced_total);
    const paid = Number(p.paid_total);
    resultat.stats = {
      orders_in_progress: p.orders_in_progress,
      invoiced_total: invoiced,
      paid_total: paid,
      // Positif : l'acheteur doit cette somme au fournisseur ; négatif : avoir.
      balance: invoiced - paid,
      overdue_total: Number(p.overdue_total),
    };
  }
  return resultat;
}

async function lister(companyId, filtres, { limit, offset }) {
  const conditions = [];
  if (filtres.relation === 'fournisseur') conditions.push({ buyer_company_id: companyId });
  else if (filtres.relation === 'client') conditions.push({ supplier_company_id: companyId });
  else conditions.push({ [Op.or]: [{ buyer_company_id: companyId }, { supplier_company_id: companyId }] });
  if (filtres.status) conditions.push({ status: filtres.status });
  if (filtres.q) {
    // Recherche sur le nom de la CONTREPARTIE (trigramme sur companies.name).
    conditions.push(sequelize.literal(`EXISTS (SELECT 1 FROM companies c WHERE c.name ILIKE :motif
      AND c.id = CASE WHEN "Partnership"."buyer_company_id" = :moi THEN "Partnership"."supplier_company_id" ELSE "Partnership"."buyer_company_id" END)`));
  }
  const { rows, count } = await Partnership.findAndCountAll({
    where: { [Op.and]: conditions },
    attributes: { include: STATS },
    include: INCLUDES,
    replacements: { motif: `%${escapeLike(filtres.q || '')}%`, moi: companyId },
    order: [['updated_at', 'DESC'], ['id', 'ASC']],
    limit,
    offset,
  });
  return { rows: rows.map((p) => versApi(p, companyId)), count };
}

async function charger(id, companyId, options = {}) {
  return chargerPartage(Partnership, id, companyId, options, 'Partenariat');
}

async function detail(id, companyId) {
  const { ressource } = await charger(id, companyId, { attributes: { include: STATS }, include: INCLUDES });
  return versApi(ressource, companyId);
}

/**
 * Partenariat ACTIF exigé entre un acheteur et un fournisseur (catalogue,
 * envoi d'une commande). 403 explicite sinon.
 */
async function exigerActif(buyerId, supplierId, transaction) {
  const p = await Partnership.findOne({
    where: { buyer_company_id: buyerId, supplier_company_id: supplierId },
    transaction,
  });
  if (!p || p.status !== 'actif') {
    throw new ForbiddenError(
      p?.status === 'suspendu'
        ? 'Ce partenariat est suspendu : aucune nouvelle commande ne peut être passée.'
        : 'Aucun partenariat actif avec ce fournisseur : ajoutez-le d’abord à vos fournisseurs.',
      'PARTENARIAT_INACTIF',
      { status: p?.status || null }
    );
  }
  return p;
}

/** § 5 — une entreprise acheteuse ne peut pas être fournisseur, et réciproquement. */
function verifierProfils(acheteur, fournisseur) {
  if (!['acheteur', 'mixte'].includes(acheteur.type)) {
    throw new ValidationError('Données invalides', [`${acheteur.name} n'est pas une entreprise acheteuse`], 'PROFIL_ENTREPRISE_INCOMPATIBLE');
  }
  if (!['fournisseur', 'mixte'].includes(fournisseur.type)) {
    throw new ValidationError('Données invalides', [`${fournisseur.name} n'est pas une entreprise fournisseur`], 'PROFIL_ENTREPRISE_INCOMPATIBLE');
  }
}

/**
 * Demande de partenariat (§ 7 « ajouter un fournisseur », « gérer ses
 * clients »). `relation` : ce que la cible sera pour moi.
 */
async function demander(acteur, companyId, { company_id: cibleId, relation, message = null }) {
  if (cibleId === companyId) throw new ValidationError('Données invalides', ['Vous ne pouvez pas être votre propre partenaire'], 'PARTENAIRE_INVALIDE');
  return sequelize.transaction(async (t) => {
    const [moi, cible] = await Promise.all([
      Company.findByPk(companyId, { transaction: t }),
      Company.findByPk(cibleId, { transaction: t }),
    ]);
    if (!cible || cible.status !== 'actif') throw new ValidationError('Données invalides', ['Entreprise introuvable ou inactive'], 'PARTENAIRE_INVALIDE');
    const acheteur = relation === 'fournisseur' ? moi : cible;
    const fournisseur = relation === 'fournisseur' ? cible : moi;
    verifierProfils(acheteur, fournisseur);
    await droits.verifierLimite(companyId, 'partners', t);

    const reglagesFournisseur = parametresEntreprise(fournisseur);
    const automatique = fournisseur.id === cibleId && reglagesFournisseur.auto_accept_partnerships;
    const champs = {
      status: automatique ? 'actif' : 'en_attente',
      requested_by_company_id: companyId,
      requested_by: acteur.id,
      request_message: message,
      responded_at: automatique ? new Date() : null,
      responded_by: null,
      suspended_by_company_id: null,
      suspended_reason: null,
    };

    let partenariat = await Partnership.findOne({
      where: { buyer_company_id: acheteur.id, supplier_company_id: fournisseur.id },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (partenariat) {
      if (partenariat.status === 'actif') throw new ConflictError('Vous êtes déjà partenaires.', 'DEJA_PARTENAIRES');
      if (partenariat.status === 'en_attente') throw new ConflictError('Une demande de partenariat est déjà en attente.', 'DEMANDE_EN_COURS');
      if (partenariat.status === 'suspendu') throw new ConflictError('Ce partenariat est suspendu : réactivez-le plutôt.', 'PARTENARIAT_SUSPENDU');
      // Demande refusée par le passé : une nouvelle demande est permise.
      await partenariat.update(champs, { transaction: t });
    } else {
      partenariat = await Partnership.create({
        buyer_company_id: acheteur.id,
        supplier_company_id: fournisseur.id,
        payment_terms_days: reglagesFournisseur.default_payment_terms_days,
        ...champs,
      }, { transaction: t });
    }

    await journaliser({
      action: 'partenariat.demande', entityType: 'partnership', entityId: partenariat.id, companyId,
      details: { cible: cibleId, relation, automatique },
    }, t);
    await notifierEntreprise(t, cibleId, P.PARTENAIRES_LIRE, {
      type: 'partenariat',
      titre: automatique ? 'Nouveau client' : 'Demande de partenariat',
      corps: automatique
        ? `${moi.name} vous a ajouté comme fournisseur.`
        : `${moi.name} souhaite vous ajouter comme ${relation === 'fournisseur' ? 'fournisseur' : 'client'}.`,
      donnees: { partnership_id: partenariat.id },
    });
    await synchroniser(t, [companyId, cibleId], 'partenariat', { partnership_id: partenariat.id, status: partenariat.status });
    return partenariat.id;
  }).then((id) => detail(id, companyId));
}

/** Transition d'un partenariat, verrouillée, journalisée, notifiée à l'autre partie. */
async function transition(acteur, id, companyId, {
  depuis, vers, controle, champs = {}, motif = null, action, titre, corps,
}) {
  await sequelize.transaction(async (t) => {
    const { ressource: p } = await charger(id, companyId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!depuis.includes(p.status)) {
      throw new ConflictError(`Transition impossible : le partenariat est « ${p.status} ».`, 'TRANSITION_INVALIDE', { statutActuel: p.status });
    }
    if (controle) await controle(p, t);
    const avant = p.status;
    await p.update({ ...champs, status: vers }, { transaction: t });
    const autre = p.buyer_company_id === companyId ? p.supplier_company_id : p.buyer_company_id;
    const moi = await Company.findByPk(companyId, { attributes: ['name'], transaction: t });
    await journaliser({ action: `partenariat.${action}`, entityType: 'partnership', entityId: id, companyId, details: { de: avant, a: vers, motif: motif ?? champs.suspended_reason ?? null } }, t);
    await notifierEntreprise(t, autre, P.PARTENAIRES_LIRE, {
      type: 'partenariat', titre, corps: corps(moi.name), donnees: { partnership_id: id },
    });
    await synchroniser(t, [companyId, autre], 'partenariat', { partnership_id: id, status: vers });
  });
  return detail(id, companyId);
}

/** Seule la partie qui n'a PAS fait la demande l'accepte ou la refuse. */
const reponseAttendue = (companyId) => (p) => {
  if (p.requested_by_company_id === companyId) {
    throw new ForbiddenError("C'est à votre partenaire de répondre à cette demande.", 'ACTION_RESERVEE_AUTRE_PARTIE');
  }
};

function accepter(acteur, id, companyId) {
  return transition(acteur, id, companyId, {
    depuis: ['en_attente'],
    vers: 'actif',
    controle: async (p, t) => {
      reponseAttendue(companyId)(p);
      await droits.verifierLimite(companyId, 'partners', t);
    },
    champs: { responded_at: new Date(), responded_by: acteur.id },
    action: 'acceptation',
    titre: 'Partenariat accepté',
    corps: (nom) => `${nom} a accepté votre demande de partenariat.`,
  });
}

function refuser(acteur, id, companyId, { reason = null } = {}) {
  return transition(acteur, id, companyId, {
    depuis: ['en_attente'],
    vers: 'refuse',
    controle: reponseAttendue(companyId),
    champs: { responded_at: new Date(), responded_by: acteur.id },
    motif: reason,
    action: 'refus',
    titre: 'Partenariat refusé',
    corps: (nom) => `${nom} a décliné votre demande de partenariat.`,
  });
}

function suspendre(acteur, id, companyId, { reason }) {
  return transition(acteur, id, companyId, {
    depuis: ['actif'],
    vers: 'suspendu',
    champs: { suspended_by_company_id: companyId, suspended_reason: reason },
    action: 'suspension',
    titre: 'Partenariat suspendu',
    corps: (nom) => `${nom} a suspendu votre partenariat : aucune nouvelle commande ne peut être passée.`,
  });
}

/** Seule la partie qui a suspendu lève la suspension. */
function reactiver(acteur, id, companyId) {
  return transition(acteur, id, companyId, {
    depuis: ['suspendu'],
    vers: 'actif',
    controle: (p) => {
      if (p.suspended_by_company_id !== companyId) {
        throw new ForbiddenError('Seule l’entreprise qui a suspendu le partenariat peut le réactiver.', 'ACTION_RESERVEE_AUTRE_PARTIE');
      }
    },
    champs: { suspended_by_company_id: null, suspended_reason: null },
    action: 'reactivation',
    titre: 'Partenariat réactivé',
    corps: (nom) => `${nom} a réactivé votre partenariat.`,
  });
}

const CHAMPS_FOURNISSEUR = ['payment_terms_days', 'supplier_customer_code'];

/**
 * Conditions et notes. Le fournisseur fixe le délai de paiement (§ 16) et le
 * code client ; chacun tient ses propres notes, invisibles de l'autre.
 */
async function modifier(id, companyId, donnees) {
  await sequelize.transaction(async (t) => {
    const { ressource: p, cote } = await charger(id, companyId, { transaction: t, lock: t.LOCK.UPDATE });
    const champs = {};
    if ('notes' in donnees) champs[cote === 'acheteur' ? 'buyer_notes' : 'supplier_notes'] = donnees.notes;
    for (const c of CHAMPS_FOURNISSEUR) {
      if (!(c in donnees)) continue;
      if (cote !== 'fournisseur') {
        throw new ForbiddenError('Les conditions commerciales sont fixées par le fournisseur.', 'CHAMP_RESERVE_FOURNISSEUR', { champ: c });
      }
      champs[c] = donnees[c];
    }
    const avant = p.toJSON();
    await p.update(champs, { transaction: t });
    const visibles = difference(avant, champs, CHAMPS_FOURNISSEUR);
    await journaliser({ action: 'partenariat.modification', entityType: 'partnership', entityId: id, companyId, details: { ...visibles, notes_modifiees: 'notes' in donnees } }, t);
  });
  return detail(id, companyId);
}

module.exports = {
  lister, detail, charger, exigerActif, demander, accepter, refuser, suspendre, reactiver, modifier,
  verifierProfils, versApi, STATS, INCLUDES,
};
