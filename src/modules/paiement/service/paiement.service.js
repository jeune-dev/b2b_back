'use strict';

const { Op } = require('sequelize');
const sequelize = require('../../../config/db.js');
const {
  Payment, PaymentAllocation, Invoice, Partnership, Company, Order,
} = require('../../../models/index.js');
const { P } = require('../../../config/permissions.js');
const {
  ConflictError, ForbiddenError, ValidationError,
} = require('../../../errors/AppError.js');
const { chargerPartage } = require('../../../utils/acces.js');
const { prochainNumero, pad } = require('../../../utils/compteur.js');
const { aujourdhui, formatFr } = require('../../../utils/dates.js');
const { ordre, periode, rechercheTexte } = require('../../../utils/liste.js');
const { formatFcfa } = require('../../../utils/montants.js');
const { transactionAvecFichiers } = require('../../../database/transaction.js');
const C = require('../../commande/service/commun.js');
const factures = require('../../facture/service/facture.service.js');
const documents = require('../../document/service/document.service.js');
const { journaliser } = require('../../audit/service/audit.service.js');
const { notifierEntreprise, synchroniser } = require('../../notification/service/notification.service.js');

/**
 * Paiements entre partenaires (§ 16) — « le paiement est enregistré, le solde
 * dû est automatiquement mis à jour » (§ 28).
 *
 *   - Le FOURNISSEUR enregistre un paiement reçu : confirmé d'emblée, imputé
 *     sur les factures (désignées, ou les plus anciennes d'abord).
 *   - L'ACHETEUR peut DÉCLARER un paiement effectué (virement, Wave…) : il
 *     n'entre dans le solde qu'une fois CONFIRMÉ par le fournisseur — le
 *     solde d'un acheteur ne baisse jamais sur sa seule parole.
 *   - Un paiement plus élevé que les factures ouvertes laisse un CRÉDIT
 *     (acompte) imputé automatiquement sur les factures suivantes.
 *   - Rien n'est supprimé : un paiement erroné est ANNULÉ, ses imputations
 *     sont levées et les factures repassent à « due ».
 */

const INCLUDES = [
  { model: Company, as: 'supplier', attributes: ['id', 'name', 'logo_document_id'], paranoid: false },
  { model: Company, as: 'buyer', attributes: ['id', 'name', 'logo_document_id'], paranoid: false },
];

function versApi(paiement, companyId) {
  const p = paiement.toJSON();
  return {
    ...p,
    direction: p.supplier_company_id === companyId ? 'recu' : 'effectue',
    unallocated_amount: Number(p.amount) - Number(p.allocated_amount),
    proof_url: p.proof_document_id ? `/api/v1/documents/${p.proof_document_id}/fichier` : null,
  };
}

async function lister(companyId, f, { limit, offset }) {
  const conditions = [];
  if (f.sens === 'recus') conditions.push({ supplier_company_id: companyId });
  else if (f.sens === 'effectues') conditions.push({ buyer_company_id: companyId });
  else conditions.push({ [Op.or]: [{ supplier_company_id: companyId }, { buyer_company_id: companyId }] });
  if (f.status) conditions.push({ status: f.status });
  if (f.method) conditions.push({ method: f.method });
  if (f.partner_id) conditions.push({ [Op.or]: [{ supplier_company_id: f.partner_id }, { buyer_company_id: f.partner_id }] });
  if (f.partnership_id) conditions.push({ partnership_id: f.partnership_id });
  const texte = rechercheTexte(f.q, ['reference', 'external_reference']);
  if (texte) conditions.push(texte);
  const dates = periode(f.du, f.au);
  if (dates) conditions.push({ paid_on: dates });
  if (f.modifie_depuis) conditions.push({ updated_at: { [Op.gt]: f.modifie_depuis } });
  const { rows, count } = await Payment.findAndCountAll({
    where: { [Op.and]: conditions },
    include: INCLUDES,
    order: ordre(f.tri, '-paid_on'),
    limit,
    offset,
  });
  return { rows: rows.map((p) => versApi(p, companyId)), count };
}

async function charger(id, companyId, options = {}, cote = null) {
  return chargerPartage(Payment, id, companyId, options, 'Paiement', { cote });
}

async function detail(id, companyId) {
  const { ressource } = await charger(id, companyId, {
    include: [...INCLUDES, {
      model: PaymentAllocation, as: 'allocations', required: false, where: { cancelled_at: null },
      include: [{ model: Invoice, as: 'invoice', attributes: ['id', 'number', 'total', 'amount_paid', 'status', 'due_date'] }],
    }],
  });
  return versApi(ressource, companyId);
}

/** Référence lisible par fournisseur et par année : PAI-2026-00012. */
async function nouvelleReference(supplierId, t) {
  const annee = aujourdhui().slice(0, 4);
  const n = await prochainNumero(`company:${supplierId}:payment:${annee}`, t);
  return `PAI-${annee}-${pad(n)}`;
}

const STATUTS_OUVERTS = ['emise', 'partiellement_payee', 'en_retard'];
/** Facture en écart de rapprochement (non accepté) ou contestée : rien ne s'y impute. */
const RAPPROCHEMENTS_BLOQUANTS = ['ecart', 'conteste'];

/**
 * Impute `disponible` FCFA du paiement sur des factures du même partenariat :
 * celles désignées (montants explicites), sinon les plus anciennes
 * d'abord (échéance, puis date). Une facture bloquée par un écart de
 * rapprochement n'est jamais payée. Factures et commandes mises à jour dans
 * la même transaction.
 * @returns {Promise<number>} montant imputé
 */
async function imputer(t, paiement, demandes, acteur) {
  const disponible = Number(paiement.amount) - Number(paiement.allocated_amount);
  if (disponible <= 0) return 0;
  const ouvertes = await Invoice.findAll({
    where: { partnership_id: paiement.partnership_id, status: { [Op.in]: STATUTS_OUVERTS }, match_status: { [Op.notIn]: RAPPROCHEMENTS_BLOQUANTS } },
    order: [['due_date', 'ASC'], ['issue_date', 'ASC'], ['created_at', 'ASC']],
    lock: t.LOCK.UPDATE,
    transaction: t,
  });
  const parId = new Map(ouvertes.map((f) => [f.id, f]));
  let plan;
  if (demandes?.length) {
    const erreurs = [];
    let somme = 0;
    plan = demandes.map((d) => {
      const f = parId.get(d.invoice_id);
      if (!f) erreurs.push(`Facture ${d.invoice_id} introuvable, déjà payée, d'un autre partenaire ou bloquée par un écart de rapprochement`);
      else if (d.amount > Number(f.total) - Number(f.amount_paid)) erreurs.push(`Facture ${f.number} : montant supérieur au reste à payer (${formatFcfa(Number(f.total) - Number(f.amount_paid))})`);
      somme += d.amount;
      return { facture: f, montant: d.amount };
    });
    if (somme > disponible) erreurs.push(`Imputations (${formatFcfa(somme)}) supérieures au montant du paiement (${formatFcfa(disponible)})`);
    if (erreurs.length) throw new ValidationError('Données invalides', erreurs, 'IMPUTATION_INVALIDE');
  } else {
    let reste = disponible;
    plan = [];
    for (const f of ouvertes) {
      if (reste <= 0) break;
      const du = Number(f.total) - Number(f.amount_paid);
      if (du <= 0) continue;
      const montant = Math.min(du, reste);
      plan.push({ facture: f, montant });
      reste -= montant;
    }
  }

  let impute = 0;
  for (const { facture, montant } of plan) {
    await PaymentAllocation.create({ payment_id: paiement.id, invoice_id: facture.id, amount: montant }, { transaction: t });
    impute += montant;
    const commande = await Order.findByPk(facture.order_id, { attributes: ['id', 'buyer_company_id', 'supplier_company_id', 'status'], transaction: t });
    await C.historiser(t, commande, {
      type: 'paiement', acteur, companyId: paiement.supplier_company_id, cote: 'fournisseur',
      details: { payment_id: paiement.id, reference: paiement.reference, invoice: facture.number, montant },
    });
    await factures.recalculerStatut(facture, t, acteur);
  }
  await paiement.update({ allocated_amount: Number(paiement.allocated_amount) + impute }, { transaction: t });
  return impute;
}

/**
 * Crédits disponibles d'un partenariat (paiements confirmés non entièrement
 * imputés) appliqués aux factures ouvertes — après l'émission d'une facture.
 */
async function imputerCredits(partnershipId, t, acteur = null) {
  const credits = await Payment.findAll({
    where: { partnership_id: partnershipId, status: 'confirme', allocated_amount: { [Op.lt]: sequelize.col('amount') } },
    order: [['paid_on', 'ASC'], ['created_at', 'ASC']],
    lock: t.LOCK.UPDATE,
    transaction: t,
  });
  let total = 0;
  for (const p of credits) total += await imputer(t, p, null, acteur);
  return total;
}

async function partenariatPourPaiement(partnershipId, companyId, t) {
  const { ressource: partenariat, cote } = await chargerPartage(Partnership, partnershipId, companyId, { transaction: t }, 'Partenariat');
  if (!['actif', 'suspendu'].includes(partenariat.status)) {
    throw new ConflictError('Aucun paiement ne peut être enregistré sur un partenariat non établi.', 'PARTENARIAT_INACTIF');
  }
  return { partenariat, cote };
}

/**
 * Enregistrement (fournisseur) ou déclaration (acheteur) d'un paiement.
 * Le côté vient du partenariat : l'entreprise connectée en est le
 * fournisseur ou l'acheteur.
 */
async function enregistrer(companyId, user, donnees) {
  const id = await sequelize.transaction(async (t) => {
    const { partenariat, cote } = await partenariatPourPaiement(donnees.partnership_id, companyId, t);
    const fournisseur = cote === 'fournisseur';
    if (!fournisseur && donnees.allocations?.length) {
      throw new ForbiddenError("L'imputation sur les factures est faite par le fournisseur à la confirmation.", 'CHAMP_RESERVE_FOURNISSEUR');
    }
    const paiement = await Payment.create({
      reference: await nouvelleReference(partenariat.supplier_company_id, t),
      supplier_company_id: partenariat.supplier_company_id,
      buyer_company_id: partenariat.buyer_company_id,
      partnership_id: partenariat.id,
      amount: donnees.amount,
      method: donnees.method,
      paid_on: donnees.paid_on,
      external_reference: donnees.external_reference || null,
      note: donnees.note || null,
      status: fournisseur ? 'confirme' : 'declare',
      recorded_by_side: cote,
      recorded_by: user.id,
      confirmed_at: fournisseur ? new Date() : null,
      confirmed_by: fournisseur ? user.id : null,
    }, { transaction: t });
    if (fournisseur) await imputer(t, paiement, donnees.allocations, user);
    await journaliser({
      action: fournisseur ? 'paiement.creation' : 'paiement.declaration', entityType: 'payment', entityId: paiement.id, companyId,
      details: { reference: paiement.reference, montant: paiement.amount, mode: paiement.method, impute: paiement.allocated_amount },
    }, t);
    const moi = await Company.findByPk(companyId, { attributes: ['name'], transaction: t });
    if (fournisseur) {
      await notifierEntreprise(t, partenariat.buyer_company_id, P.PAIEMENTS_LIRE, {
        type: 'paiement_enregistre',
        titre: 'Paiement enregistré',
        corps: `${moi.name} a enregistré votre paiement de ${formatFcfa(paiement.amount)} du ${formatFr(paiement.paid_on)} (${paiement.reference}).`,
        donnees: { payment_id: paiement.id, partnership_id: partenariat.id },
      });
    } else {
      await notifierEntreprise(t, partenariat.supplier_company_id, P.PAIEMENTS_ENREGISTRER, {
        type: 'paiement_declare',
        titre: 'Paiement déclaré par un client',
        corps: `${moi.name} déclare vous avoir payé ${formatFcfa(paiement.amount)} le ${formatFr(paiement.paid_on)}. Confirmez sa réception.`,
        donnees: { payment_id: paiement.id, partnership_id: partenariat.id },
      });
    }
    await synchroniser(t, [partenariat.supplier_company_id, partenariat.buyer_company_id], 'paiement', { payment_id: paiement.id, status: paiement.status });
    return paiement.id;
  });
  return detail(id, companyId);
}

/** Le fournisseur confirme un paiement déclaré par son client : il entre dans le solde. */
async function confirmer(id, companyId, user, { allocations = null } = {}) {
  await sequelize.transaction(async (t) => {
    const { ressource: paiement } = await charger(id, companyId, { transaction: t, lock: t.LOCK.UPDATE }, 'fournisseur');
    if (paiement.status !== 'declare') throw new ConflictError(`Ce paiement est « ${paiement.status} » : seul un paiement déclaré se confirme.`, 'TRANSITION_INVALIDE');
    await paiement.update({ status: 'confirme', confirmed_at: new Date(), confirmed_by: user.id }, { transaction: t });
    await imputer(t, paiement, allocations, user);
    await journaliser({ action: 'paiement.confirmation', entityType: 'payment', entityId: id, companyId, details: { reference: paiement.reference, montant: paiement.amount, impute: paiement.allocated_amount } }, t);
    const moi = await Company.findByPk(companyId, { attributes: ['name'], transaction: t });
    await notifierEntreprise(t, paiement.buyer_company_id, P.PAIEMENTS_LIRE, {
      type: 'paiement_enregistre',
      titre: 'Paiement confirmé',
      corps: `${moi.name} a confirmé la réception de votre paiement de ${formatFcfa(paiement.amount)} (${paiement.reference}).`,
      donnees: { payment_id: paiement.id },
    });
    await synchroniser(t, [paiement.supplier_company_id, paiement.buyer_company_id], 'paiement', { payment_id: id, status: 'confirme' });
  });
  return detail(id, companyId);
}

/** Le fournisseur rejette un paiement déclaré qu'il n'a pas reçu. */
async function rejeter(id, companyId, user, { reason }) {
  await sequelize.transaction(async (t) => {
    const { ressource: paiement } = await charger(id, companyId, { transaction: t, lock: t.LOCK.UPDATE }, 'fournisseur');
    if (paiement.status !== 'declare') throw new ConflictError(`Ce paiement est « ${paiement.status} » : seul un paiement déclaré se rejette.`, 'TRANSITION_INVALIDE');
    await paiement.update({ status: 'rejete', rejected_at: new Date(), rejection_reason: reason }, { transaction: t });
    await journaliser({ action: 'paiement.rejet', entityType: 'payment', entityId: id, companyId, details: { reference: paiement.reference, motif: reason } }, t);
    const moi = await Company.findByPk(companyId, { attributes: ['name'], transaction: t });
    await notifierEntreprise(t, paiement.buyer_company_id, P.PAIEMENTS_LIRE, {
      type: 'paiement_rejete',
      titre: 'Paiement non reconnu',
      corps: `${moi.name} n'a pas reconnu votre paiement déclaré de ${formatFcfa(paiement.amount)} : ${reason}`,
      donnees: { payment_id: paiement.id },
    });
    await synchroniser(t, [paiement.supplier_company_id, paiement.buyer_company_id], 'paiement', { payment_id: id, status: 'rejete' });
  });
  return detail(id, companyId);
}

/**
 * Annulation : un paiement CONFIRMÉ n'est annulé que par le fournisseur
 * (imputations levées, factures de nouveau dues) ; un paiement DÉCLARÉ peut
 * être retiré par l'acheteur qui l'a déclaré.
 */
async function annuler(id, companyId, user, { reason }) {
  await sequelize.transaction(async (t) => {
    const { ressource: paiement, cote } = await charger(id, companyId, { transaction: t, lock: t.LOCK.UPDATE });
    if (paiement.status === 'confirme' && cote !== 'fournisseur') {
      throw new ForbiddenError('Seul le fournisseur peut annuler un paiement confirmé.', 'ACTION_RESERVEE_AUTRE_PARTIE');
    }
    if (paiement.status === 'declare' && cote !== 'acheteur') {
      throw new ForbiddenError('Un paiement déclaré se confirme ou se rejette par le fournisseur.', 'ACTION_RESERVEE_AUTRE_PARTIE');
    }
    if (!['confirme', 'declare'].includes(paiement.status)) {
      throw new ConflictError(`Ce paiement est déjà « ${paiement.status} ».`, 'TRANSITION_INVALIDE');
    }
    const imputations = await PaymentAllocation.findAll({ where: { payment_id: id, cancelled_at: null }, transaction: t });
    await PaymentAllocation.update({ cancelled_at: new Date() }, { where: { payment_id: id, cancelled_at: null }, transaction: t });
    await paiement.update({ status: 'annule', cancelled_at: new Date(), cancellation_reason: reason, allocated_amount: 0 }, { transaction: t });
    for (const imputation of imputations) {
      const facture = await Invoice.findByPk(imputation.invoice_id, { transaction: t, lock: t.LOCK.UPDATE });
      await factures.recalculerStatut(facture, t, user);
    }
    await journaliser({ action: 'paiement.annulation', entityType: 'payment', entityId: id, companyId, details: { reference: paiement.reference, montant: paiement.amount, motif: reason, factures: imputations.map((i) => i.invoice_id) } }, t);
    const autre = cote === 'fournisseur' ? paiement.buyer_company_id : paiement.supplier_company_id;
    const moi = await Company.findByPk(companyId, { attributes: ['name'], transaction: t });
    await notifierEntreprise(t, autre, P.PAIEMENTS_LIRE, {
      type: 'paiement_rejete',
      titre: `Paiement ${paiement.reference} annulé`,
      corps: `${moi.name} a annulé le paiement ${paiement.reference} de ${formatFcfa(paiement.amount)} : ${reason}`,
      donnees: { payment_id: paiement.id },
    });
    await synchroniser(t, [paiement.supplier_company_id, paiement.buyer_company_id], 'paiement', { payment_id: id, status: 'annule' });
  });
  return detail(id, companyId);
}

/** Preuve de paiement (reçu de virement, capture Wave…) partagée avec l'autre partie. */
async function ajouterPreuve(id, companyId, user, fichier) {
  await transactionAvecFichiers(async (t) => {
    const { ressource: paiement, cote } = await charger(id, companyId, { transaction: t, lock: t.LOCK.UPDATE });
    if (['annule', 'rejete'].includes(paiement.status)) throw new ConflictError('Ce paiement est clos.', 'PAIEMENT_CLOS');
    const autre = cote === 'fournisseur' ? paiement.buyer_company_id : paiement.supplier_company_id;
    const document = await documents.creerDocument({
      companyId, partnerCompanyId: autre, entityType: 'payment', entityId: id, category: 'preuve_paiement', visibility: 'partenaire', fichier, uploadedBy: user.id,
    }, t);
    await paiement.update({ proof_document_id: document.id }, { transaction: t });
    await synchroniser(t, [paiement.supplier_company_id, paiement.buyer_company_id], 'paiement', { payment_id: id, status: paiement.status });
  });
  return detail(id, companyId);
}

module.exports = {
  lister, detail, enregistrer, confirmer, rejeter, annuler, ajouterPreuve, imputer, imputerCredits, STATUTS_OUVERTS, RAPPROCHEMENTS_BLOQUANTS,
};
