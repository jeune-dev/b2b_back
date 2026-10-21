'use strict';

const { Op } = require('sequelize');
const sequelize = require('../../../config/db.js');
const {
  CreditNote, CreditNoteLine, CreditNoteAllocation, Invoice, InvoiceLine, Company, Order, Claim,
} = require('../../../models/index.js');
const { P } = require('../../../config/permissions.js');
const { ConflictError, ValidationError } = require('../../../errors/AppError.js');
const { chargerPartage } = require('../../../utils/acces.js');
const { prochainNumero, pad } = require('../../../utils/compteur.js');
const { aujourdhui } = require('../../../utils/dates.js');
const { ordre, periode, rechercheTexte } = require('../../../utils/liste.js');
const { montantLigne, totaliser, formatFcfa } = require('../../../utils/montants.js');
const cache = require('../../../utils/cache.js');
const modeles = require('../../modele/service/modele.service.js');
const factures = require('../../facture/service/facture.service.js');
const { STATUTS_OUVERTS, RAPPROCHEMENTS_BLOQUANTS } = require('../../paiement/service/paiement.service.js');
const { journaliser } = require('../../audit/service/audit.service.js');
const { notifierEntreprise, synchroniser } = require('../../notification/service/notification.service.js');

/**
 * Avoirs (notes de crédit) du fournisseur : après un litige accepté (§ 13 :
 * produit manquant, endommagé, non conforme…) ou un geste commercial sur une
 * facture. Un avoir RÉDUIT ce que le client doit :
 *   - imputé d'abord sur la facture qu'il concerne, puis sur les factures
 *     ouvertes les plus anciennes du partenariat ;
 *   - le surplus reste un crédit, imputé sur les factures suivantes ;
 *   - le solde (§ 16) = factures − paiements − avoirs.
 * Rien n'est supprimé : un avoir erroné est ANNULÉ, ses imputations levées.
 */

const INCLUDES = [
  { model: Company, as: 'supplier', attributes: ['id', 'name', 'logo_document_id'], paranoid: false },
  { model: Company, as: 'buyer', attributes: ['id', 'name', 'logo_document_id'], paranoid: false },
  { model: Order, as: 'order', attributes: ['id', 'number'] },
  { model: Invoice, as: 'invoice', attributes: ['id', 'number'] },
];

function versApi(avoir, companyId) {
  const a = avoir.toJSON();
  return {
    ...a,
    direction: a.supplier_company_id === companyId ? 'emis' : 'recu',
    unallocated_amount: a.status === 'annule' ? 0 : Number(a.total) - Number(a.amount_allocated),
    pdf_url: `/api/v1/avoirs/${a.id}/pdf`,
  };
}

async function lister(companyId, f, { limit, offset }) {
  const conditions = [];
  if (f.sens === 'emis') conditions.push({ supplier_company_id: companyId });
  else if (f.sens === 'recus') conditions.push({ buyer_company_id: companyId });
  else conditions.push({ [Op.or]: [{ supplier_company_id: companyId }, { buyer_company_id: companyId }] });
  if (f.status) conditions.push({ status: f.status });
  if (f.partner_id) conditions.push({ [Op.or]: [{ supplier_company_id: f.partner_id }, { buyer_company_id: f.partner_id }] });
  if (f.invoice_id) conditions.push({ invoice_id: f.invoice_id });
  const texte = rechercheTexte(f.q, ['number']);
  if (texte) conditions.push(texte);
  const dates = periode(f.du, f.au);
  if (dates) conditions.push({ issue_date: dates });
  const { rows, count } = await CreditNote.findAndCountAll({
    where: { [Op.and]: conditions }, include: INCLUDES, order: ordre(f.tri, '-issue_date'), limit, offset,
  });
  return { rows: rows.map((r) => versApi(r, companyId)), count };
}

async function charger(id, companyId, options = {}, cote = null) {
  return chargerPartage(CreditNote, id, companyId, options, 'Avoir', { cote });
}

async function detail(id, companyId) {
  const { ressource } = await charger(id, companyId, {
    include: [...INCLUDES, { model: CreditNoteLine, as: 'lines', separate: true, order: [['line_no', 'ASC']] }],
  });
  const imputations = await CreditNoteAllocation.findAll({
    where: { credit_note_id: id, cancelled_at: null },
    include: [{ model: Invoice, as: 'invoice', attributes: ['id', 'number', 'total', 'amount_paid', 'status'] }],
    order: [['created_at', 'ASC']],
  });
  return { ...versApi(ressource, companyId), allocations: imputations };
}

/** Numéro lisible par fournisseur et par année : AV-2026-00003. */
async function nouveauNumero(supplierId, t) {
  const annee = aujourdhui().slice(0, 4);
  const n = await prochainNumero(`company:${supplierId}:credit_note:${annee}`, t);
  return `AV-${annee}-${pad(n)}`;
}

/** Ligne d'avoir valorisée (quantité × prix unitaire HT, TVA de la ligne d'origine). */
function ligneAvoir(source, quantite, numero) {
  const m = montantLigne({ quantite, prixUnitaire: Number(source.unit_price), tauxTva: Number(source.tax_rate) });
  return {
    line_no: numero,
    product_id: source.product_id,
    reference: source.reference,
    name: source.name,
    unit: source.unit,
    quantity: quantite,
    unit_price: Number(source.unit_price),
    tax_rate: Number(source.tax_rate),
    line_subtotal: m.sousTotal,
    line_tax: m.tva,
    line_total: m.total,
  };
}

/** Impute UN avoir : sa facture d'abord, puis les factures ouvertes les plus anciennes. */
async function imputer(t, avoir) {
  let reste = Number(avoir.total) - Number(avoir.amount_allocated);
  if (reste <= 0) return 0;
  const ouvertes = await Invoice.findAll({
    where: { partnership_id: avoir.partnership_id, status: { [Op.in]: STATUTS_OUVERTS }, match_status: { [Op.notIn]: RAPPROCHEMENTS_BLOQUANTS } },
    order: [
      [sequelize.literal(`CASE WHEN "Invoice"."id" = ${sequelize.escape(avoir.invoice_id || '00000000-0000-0000-0000-000000000000')} THEN 0 ELSE 1 END`), 'ASC'],
      ['due_date', 'ASC'], ['issue_date', 'ASC'], ['created_at', 'ASC'],
    ],
    lock: t.LOCK.UPDATE,
    transaction: t,
  });
  let impute = 0;
  for (const facture of ouvertes) {
    if (reste <= 0) break;
    const du = Number(facture.total) - Number(facture.amount_paid);
    if (du <= 0) continue;
    const montant = Math.min(du, reste);
    await CreditNoteAllocation.create({ credit_note_id: avoir.id, invoice_id: facture.id, amount: montant }, { transaction: t });
    await factures.recalculerStatut(facture, t);
    reste -= montant;
    impute += montant;
  }
  if (impute) await avoir.update({ amount_allocated: Number(avoir.amount_allocated) + impute }, { transaction: t });
  return impute;
}

/** Avoirs disponibles d'un partenariat imputés sur ses factures ouvertes (après une nouvelle facture). */
async function imputerAvoirs(partnershipId, t) {
  const disponibles = await CreditNote.findAll({
    where: { partnership_id: partnershipId, status: 'emis', amount_allocated: { [Op.lt]: sequelize.col('total') } },
    order: [['issue_date', 'ASC'], ['created_at', 'ASC']],
    lock: t.LOCK.UPDATE,
    transaction: t,
  });
  let total = 0;
  for (const a of disponibles) total += await imputer(t, a);
  return total;
}

/**
 * Émission d'un avoir dans une transaction ouverte (litige accepté, geste
 * commercial).
 * @param {{ supplierId, buyerId, partnershipId, orderId?, invoiceId?, claimId?, reason, lignes, user }} p
 */
async function emettreDansTransaction(t, {
  supplierId, buyerId, partnershipId, orderId = null, invoiceId = null, claimId = null, reason, lignes, user,
}) {
  const totaux = totaliser(lignes);
  if (totaux.total <= 0) throw new ValidationError('Données invalides', ['Un avoir porte un montant positif'], 'AVOIR_VIDE');
  const modele = await modeles.modeleActif(supplierId, 'facture', t);
  const avoir = await CreditNote.create({
    number: await nouveauNumero(supplierId, t),
    supplier_company_id: supplierId,
    buyer_company_id: buyerId,
    partnership_id: partnershipId,
    order_id: orderId,
    invoice_id: invoiceId,
    claim_id: claimId,
    status: 'emis',
    issue_date: aujourdhui(),
    reason,
    ...totaux,
    template_id: modele?.id || null,
    created_by: user.id,
  }, { transaction: t });
  await CreditNoteLine.bulkCreate(lignes.map((l) => ({ ...l, credit_note_id: avoir.id })), { transaction: t });
  await imputer(t, avoir);
  await journaliser({
    action: 'avoir.creation', entityType: 'credit_note', entityId: avoir.id, companyId: supplierId,
    details: { number: avoir.number, total: avoir.total, facture: invoiceId, litige: claimId },
  }, t);
  const fournisseur = await Company.findByPk(supplierId, { attributes: ['name'], transaction: t });
  await notifierEntreprise(t, buyerId, P.FACTURES_LIRE, {
    type: 'avoir',
    titre: `Avoir ${avoir.number}`,
    corps: `${fournisseur.name} vous accorde l'avoir ${avoir.number} de ${formatFcfa(avoir.total)} : ${reason}`,
    donnees: { credit_note_id: avoir.id, invoice_id: invoiceId, order_id: orderId },
  });
  await synchroniser(t, [supplierId, buyerId], 'facture', { credit_note_id: avoir.id, status: 'emis' });
  t.afterCommit(() => Promise.all([supplierId, buyerId].map((c) => cache.invalider(`dashboard:*:${c}`))).catch(() => {}));
  return avoir;
}

/**
 * Avoir sur une facture, à l'initiative du fournisseur (erreur de prix,
 * geste commercial) : lignes de la facture et quantités à créditer. Le total
 * des avoirs d'une facture ne dépasse jamais son montant.
 * @param {{ invoice_id: string, reason: string, lines: Array<{ line_no: number, quantity: number }> }} donnees
 */
async function emettreSurFacture(companyId, user, { invoice_id: invoiceId, reason, lines }) {
  const id = await sequelize.transaction(async (t) => {
    const { ressource: facture } = await chargerPartage(Invoice, invoiceId, companyId, { transaction: t, lock: t.LOCK.UPDATE }, 'Facture', { cote: 'fournisseur' });
    if (facture.status === 'annulee') throw new ConflictError('Cette facture est annulée.', 'FACTURE_ANNULEE');
    const lignesFacture = new Map((await InvoiceLine.findAll({ where: { invoice_id: invoiceId }, transaction: t })).map((l) => [l.line_no, l]));
    const erreurs = [];
    const lignes = lines.map((s, i) => {
      const source = lignesFacture.get(s.line_no);
      if (!source) { erreurs.push(`La ligne ${s.line_no} n'existe pas sur la facture ${facture.number}`); return null; }
      if (s.quantity > Number(source.quantity)) erreurs.push(`Ligne ${s.line_no} : ${s.quantity} crédité(s) pour ${Number(source.quantity)} facturé(s)`);
      return ligneAvoir(source, s.quantity, i + 1);
    });
    if (erreurs.length) throw new ValidationError('Données invalides', erreurs, 'LIGNES_INVALIDES');
    const [[{ deja }]] = await sequelize.query(
      "SELECT coalesce(sum(total), 0)::bigint AS deja FROM credit_notes WHERE invoice_id = :id AND status = 'emis'",
      { replacements: { id: invoiceId }, transaction: t }
    );
    const montant = totaliser(lignes).total;
    if (Number(deja) + montant > Number(facture.total)) {
      throw new ValidationError('Données invalides', [`Les avoirs de la facture ${facture.number} dépasseraient son montant (${formatFcfa(facture.total)} ; déjà crédité ${formatFcfa(deja)})`], 'AVOIR_EXCESSIF');
    }
    const avoir = await emettreDansTransaction(t, {
      supplierId: companyId, buyerId: facture.buyer_company_id, partnershipId: facture.partnership_id,
      orderId: facture.order_id, invoiceId, reason, lignes, user,
    });
    return avoir.id;
  });
  return detail(id, companyId);
}

/**
 * Annulation par le fournisseur : imputations levées, factures de nouveau
 * dues ; un litige accepté par cet avoir redevient ouvert.
 */
async function annuler(id, companyId, user, { reason }) {
  await sequelize.transaction(async (t) => {
    const { ressource: avoir } = await charger(id, companyId, { transaction: t, lock: t.LOCK.UPDATE }, 'fournisseur');
    if (avoir.status === 'annule') throw new ConflictError('Cet avoir est déjà annulé.', 'STATUT_INCHANGE');
    const imputations = await CreditNoteAllocation.findAll({ where: { credit_note_id: id, cancelled_at: null }, transaction: t });
    await CreditNoteAllocation.update({ cancelled_at: new Date() }, { where: { credit_note_id: id, cancelled_at: null }, transaction: t });
    await avoir.update({ status: 'annule', cancelled_at: new Date(), cancellation_reason: reason, amount_allocated: 0 }, { transaction: t });
    for (const imputation of imputations) {
      const facture = await Invoice.findByPk(imputation.invoice_id, { transaction: t, lock: t.LOCK.UPDATE });
      await factures.recalculerStatut(facture, t, user);
    }
    if (avoir.claim_id) {
      await Claim.update(
        { status: 'ouvert', credit_note_id: null, resolved_at: null, resolved_by: null },
        { where: { id: avoir.claim_id, status: 'accepte' }, transaction: t }
      );
    }
    await journaliser({ action: 'avoir.annulation', entityType: 'credit_note', entityId: id, companyId, details: { number: avoir.number, motif: reason } }, t);
    const fournisseur = await Company.findByPk(companyId, { attributes: ['name'], transaction: t });
    await notifierEntreprise(t, avoir.buyer_company_id, P.FACTURES_LIRE, {
      type: 'avoir',
      titre: `Avoir ${avoir.number} annulé`,
      corps: `${fournisseur.name} a annulé l'avoir ${avoir.number} (${formatFcfa(avoir.total)}) : ${reason}`,
      donnees: { credit_note_id: id },
    });
    await synchroniser(t, [avoir.supplier_company_id, avoir.buyer_company_id], 'facture', { credit_note_id: id, status: 'annule' });
    t.afterCommit(() => Promise.all([avoir.supplier_company_id, avoir.buyer_company_id].map((c) => cache.invalider(`dashboard:*:${c}`))).catch(() => {}));
  });
  return detail(id, companyId);
}

/** Avoir et ses lignes, pour le PDF (contrôle d'accès des deux parties). */
async function pourPdf(id, companyId) {
  const { ressource } = await charger(id, companyId);
  const lignes = await CreditNoteLine.findAll({ where: { credit_note_id: id }, order: [['line_no', 'ASC']] });
  return { avoir: ressource, lignes: lignes.map((l) => l.get({ plain: true })) };
}

module.exports = {
  lister, detail, emettreDansTransaction, emettreSurFacture, annuler, imputerAvoirs, pourPdf, ligneAvoir,
};
