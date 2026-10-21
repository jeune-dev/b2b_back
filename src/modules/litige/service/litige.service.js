'use strict';

const { Op, QueryTypes } = require('sequelize');
const sequelize = require('../../../config/db.js');
const {
  Claim, ClaimLine, Company, Order, Delivery, CreditNote,
} = require('../../../models/index.js');
const { P } = require('../../../config/permissions.js');
const { ConflictError, ValidationError } = require('../../../errors/AppError.js');
const { chargerPartage } = require('../../../utils/acces.js');
const { prochainNumero, pad } = require('../../../utils/compteur.js');
const { aujourdhui } = require('../../../utils/dates.js');
const { ordre } = require('../../../utils/liste.js');
const { totaliser, formatFcfa, formatQuantite } = require('../../../utils/montants.js');
const { transactionAvecFichiers } = require('../../../database/transaction.js');
const C = require('../../commande/service/commun.js');
const avoirs = require('../../avoir/service/avoir.service.js');
const stock = require('../../catalogue/service/stock.service.js');
const documents = require('../../document/service/document.service.js');
const { journaliser } = require('../../audit/service/audit.service.js');
const { notifierEntreprise, synchroniser } = require('../../notification/service/notification.service.js');

/**
 * Retours et litiges après livraison (§ 13, § 20) : produit manquant,
 * endommagé, non conforme, erreur de produit, périmé…
 *
 *   1. L'ACHETEUR ouvre un litige sur une commande livrée : lignes et
 *      quantités concernées (au plus la quantité reçue, moins ce qui est déjà
 *      en litige), description, photos.
 *   2. Le FOURNISSEUR l'accepte — un AVOIR est émis automatiquement pour la
 *      valeur des lignes (imputé sur la facture, ou sur la future facture) et,
 *      s'il reprend la marchandise, elle revient en stock — ou le refuse en
 *      motivant sa réponse.
 *   3. L'acheteur peut retirer un litige encore ouvert.
 * Chaque étape figure dans l'historique de la commande, vu des deux parties.
 */

const STATUTS_COMMANDE_LITIGIEUX = ['livree_partiellement', 'livree', 'reception_confirmee', 'facturee', 'terminee'];

const INCLUDES = [
  { model: Company, as: 'buyer', attributes: ['id', 'name', 'logo_document_id'], paranoid: false },
  { model: Company, as: 'supplier', attributes: ['id', 'name', 'logo_document_id'], paranoid: false },
  { model: Order, as: 'order', attributes: ['id', 'number', 'status'] },
  { model: Delivery, as: 'delivery', attributes: ['id', 'number', 'delivery_no'] },
  { model: CreditNote, as: 'creditNote', attributes: ['id', 'number', 'total', 'status'] },
];

function versApi(litige, companyId) {
  const { creditNote, ...l } = litige.toJSON();
  return { ...l, side: l.buyer_company_id === companyId ? 'acheteur' : 'fournisseur', credit_note: creditNote || null };
}

async function charger(id, companyId, options = {}, cote = null) {
  return chargerPartage(Claim, id, companyId, options, 'Litige', { cote });
}

async function lister(companyId, f, { limit, offset }) {
  const conditions = [];
  if (f.sens === 'ouverts_par_moi') conditions.push({ buyer_company_id: companyId });
  else if (f.sens === 'recus') conditions.push({ supplier_company_id: companyId });
  else conditions.push({ [Op.or]: [{ buyer_company_id: companyId }, { supplier_company_id: companyId }] });
  if (f.status) conditions.push({ status: f.status });
  if (f.order_id) conditions.push({ order_id: f.order_id });
  const { rows, count } = await Claim.findAndCountAll({
    where: { [Op.and]: conditions }, include: INCLUDES, order: ordre(f.tri, '-created_at'), limit, offset,
  });
  return { rows: rows.map((r) => versApi(r, companyId)), count };
}

async function detail(id, companyId) {
  const { ressource } = await charger(id, companyId, {
    include: [
      ...INCLUDES,
      { model: ClaimLine, as: 'lines', separate: true, order: [['line_no', 'ASC']] },
    ],
  });
  const pieces = await documents.lister(companyId, { entity_type: 'claim', entity_id: id }, { limit: 50, offset: 0 });
  return { ...versApi(ressource, companyId), attachments: pieces.rows };
}

async function nouveauNumero(buyerId, t) {
  const annee = aujourdhui().slice(0, 4);
  const n = await prochainNumero(`company:${buyerId}:claim:${annee}`, t);
  return `LIT-${annee}-${pad(n)}`;
}

/** Quantités déjà en litige (ouvert ou accepté) par ligne de commande. */
async function dejaEnLitige(orderId, t) {
  const lignes = await sequelize.query(
    `SELECT cl.line_no, sum(cl.quantity) AS quantite FROM claim_lines cl JOIN claims c ON c.id = cl.claim_id
      WHERE c.order_id = :orderId AND c.status IN ('ouvert', 'accepte') GROUP BY cl.line_no`,
    { replacements: { orderId }, type: QueryTypes.SELECT, transaction: t }
  );
  return new Map(lignes.map((l) => [l.line_no, Number(l.quantite)]));
}

/**
 * Ouverture d'un litige par l'acheteur.
 * @param {{ order_id, delivery_id?, type, description, lines: Array<{ line_no, quantity, comment? }> }} donnees
 */
async function ouvrir(companyId, user, {
  order_id: orderId, delivery_id: deliveryId = null, type, description, lines,
}) {
  const id = await sequelize.transaction(async (t) => {
    const { commande } = await C.chargerPourModifier(orderId, companyId, t, 'acheteur');
    if (!STATUTS_COMMANDE_LITIGIEUX.includes(commande.status)) {
      throw new ConflictError('Un litige porte sur une commande livrée (après réception de la marchandise).', 'COMMANDE_NON_LIVREE', { statut: commande.status });
    }
    if (deliveryId) {
      const livraison = await Delivery.findOne({ where: { id: deliveryId, order_id: commande.id }, attributes: ['id'], transaction: t });
      if (!livraison) throw new ValidationError('Données invalides', ['Livraison introuvable sur cette commande'], 'LIVRAISON_INVALIDE');
    }
    const version = await C.version(commande.id, commande.validated_version_no, t);
    const parNumero = new Map(version.lines.map((l) => [l.line_no, l]));
    const deja = await dejaEnLitige(commande.id, t);
    const erreurs = [];
    const lignes = lines.map((s) => {
      const l = parNumero.get(s.line_no);
      if (!l) { erreurs.push(`La ligne ${s.line_no} n'existe pas dans la commande validée`); return null; }
      const recue = Number(l.received_quantity ?? 0);
      const possible = Math.round((recue - (deja.get(s.line_no) || 0)) * 1000) / 1000;
      if (s.quantity > possible) {
        erreurs.push(`Ligne ${s.line_no} « ${l.name} » : ${formatQuantite(s.quantity)} en litige pour ${formatQuantite(Math.max(0, possible))} réceptionné(s) non encore contesté(s)`);
      }
      return { ...avoirs.ligneAvoir(l, s.quantity, s.line_no), comment: s.comment || null };
    });
    if (erreurs.length) throw new ValidationError('Données invalides', erreurs, 'LITIGE_INVALIDE');
    const litige = await Claim.create({
      number: await nouveauNumero(companyId, t),
      order_id: commande.id,
      buyer_company_id: companyId,
      supplier_company_id: commande.supplier_company_id,
      partnership_id: commande.partnership_id,
      delivery_id: deliveryId,
      type,
      status: 'ouvert',
      description,
      ...totaliser(lignes),
      opened_by: user.id,
    }, { transaction: t });
    await ClaimLine.bulkCreate(lignes.map((l) => ({ ...l, claim_id: litige.id })), { transaction: t });
    await C.historiser(t, commande, {
      type: 'litige', acteur: user, companyId, cote: 'acheteur', message: description,
      details: { claim_id: litige.id, number: litige.number, type, total: litige.total },
    });
    await C.apresChangement(t, commande);
    await journaliser({ action: 'litige.creation', entityType: 'claim', entityId: litige.id, companyId, details: { number: litige.number, commande: commande.number, type, total: litige.total } }, t);
    const acheteur = await Company.findByPk(companyId, { attributes: ['name'], transaction: t });
    await notifierEntreprise(t, commande.supplier_company_id, P.VENTES_LIRE, {
      type: 'litige',
      titre: `Litige ${litige.number} — ${commande.number}`,
      corps: `${acheteur.name} signale un problème sur la commande ${commande.number} (${formatFcfa(litige.total)}) : ${description.slice(0, 200)}`,
      donnees: { claim_id: litige.id, order_id: commande.id },
    });
    return litige.id;
  });
  return detail(id, companyId);
}

/** Litige ouvert, verrouillé, du côté exigé ; la commande est verrouillée aussi. */
async function chargerOuvert(id, companyId, cote, t) {
  const { ressource: litige } = await charger(id, companyId, { transaction: t, lock: t.LOCK.UPDATE }, cote);
  if (litige.status !== 'ouvert') throw new ConflictError(`Ce litige est déjà « ${litige.status} ».`, 'LITIGE_CLOS');
  const commande = await Order.findByPk(litige.order_id, { transaction: t, lock: t.LOCK.UPDATE });
  return { litige, commande };
}

/**
 * Le fournisseur accepte : avoir émis pour la valeur des lignes (imputé sur
 * la facture de la commande si elle existe), retour en stock si la
 * marchandise est reprise.
 */
async function accepter(id, companyId, user, { response = null, restock = false }) {
  await sequelize.transaction(async (t) => {
    const { litige, commande } = await chargerOuvert(id, companyId, 'fournisseur', t);
    const lignes = await ClaimLine.findAll({ where: { claim_id: id }, order: [['line_no', 'ASC']], transaction: t });
    const facture = await commande.getInvoice({ where: { status: { [Op.ne]: 'annulee' } }, attributes: ['id'], transaction: t });
    const avoir = await avoirs.emettreDansTransaction(t, {
      supplierId: companyId,
      buyerId: litige.buyer_company_id,
      partnershipId: litige.partnership_id,
      orderId: litige.order_id,
      invoiceId: facture?.id || null,
      claimId: litige.id,
      reason: `Litige ${litige.number} — ${litige.description}`.slice(0, 1000),
      lignes: lignes.map((l, i) => ({ ...avoirs.ligneAvoir(l, Number(l.quantity), i + 1) })),
      user,
    });
    if (restock) {
      await stock.retourner(t, lignes.filter((l) => l.product_id).map((l) => ({ productId: l.product_id, quantite: Number(l.quantity) })), user, { orderId: litige.order_id, note: `Retour ${litige.number}` });
    }
    await litige.update({
      status: 'accepte', response, restock, credit_note_id: avoir.id, resolved_at: new Date(), resolved_by: user.id,
    }, { transaction: t });
    await C.historiser(t, commande, {
      type: 'avoir', acteur: user, companyId, cote: 'fournisseur', message: response,
      details: {
        claim_id: litige.id, claim: litige.number, credit_note_id: avoir.id, credit_note: avoir.number, total: avoir.total, retour_stock: restock,
      },
    });
    await C.apresChangement(t, commande);
    await journaliser({ action: 'litige.acceptation', entityType: 'claim', entityId: id, companyId, details: { number: litige.number, avoir: avoir.number, retour_stock: restock } }, t);
    await synchroniser(t, [litige.buyer_company_id, litige.supplier_company_id], 'litige', { claim_id: id, status: 'accepte' });
  });
  return detail(id, companyId);
}

/** Le fournisseur refuse le litige, réponse motivée. */
async function refuser(id, companyId, user, { response }) {
  await sequelize.transaction(async (t) => {
    const { litige, commande } = await chargerOuvert(id, companyId, 'fournisseur', t);
    await litige.update({ status: 'refuse', response, resolved_at: new Date(), resolved_by: user.id }, { transaction: t });
    await C.historiser(t, commande, {
      type: 'litige', acteur: user, companyId, cote: 'fournisseur', message: response, details: { claim_id: id, claim: litige.number, decision: 'refuse' },
    });
    await C.apresChangement(t, commande);
    await journaliser({ action: 'litige.refus', entityType: 'claim', entityId: id, companyId, details: { number: litige.number, motif: response } }, t);
    const fournisseur = await Company.findByPk(companyId, { attributes: ['name'], transaction: t });
    await notifierEntreprise(t, litige.buyer_company_id, P.ACHATS_LIRE, {
      type: 'litige',
      titre: `Litige ${litige.number} refusé`,
      corps: `${fournisseur.name} a refusé le litige ${litige.number} : ${response}`,
      donnees: { claim_id: id, order_id: litige.order_id },
    });
    await synchroniser(t, [litige.buyer_company_id, litige.supplier_company_id], 'litige', { claim_id: id, status: 'refuse' });
  });
  return detail(id, companyId);
}

/** L'acheteur retire un litige encore ouvert. */
async function annuler(id, companyId, user, { reason = null } = {}) {
  await sequelize.transaction(async (t) => {
    const { litige, commande } = await chargerOuvert(id, companyId, 'acheteur', t);
    await litige.update({ status: 'annule', response: reason, resolved_at: new Date(), resolved_by: user.id }, { transaction: t });
    await C.historiser(t, commande, {
      type: 'litige', acteur: user, companyId, cote: 'acheteur', message: reason, details: { claim_id: id, claim: litige.number, decision: 'annule' },
    });
    await C.apresChangement(t, commande);
    await journaliser({ action: 'litige.annulation', entityType: 'claim', entityId: id, companyId, details: { number: litige.number } }, t);
    await synchroniser(t, [litige.buyer_company_id, litige.supplier_company_id], 'litige', { claim_id: id, status: 'annule' });
  });
  return detail(id, companyId);
}

/** Photo ou document à l'appui du litige, partagé avec l'autre partie. */
async function joindre(id, companyId, user, fichier) {
  await transactionAvecFichiers(async (t) => {
    const { ressource: litige, cote } = await charger(id, companyId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!['ouvert'].includes(litige.status)) throw new ConflictError('Ce litige est clos.', 'LITIGE_CLOS');
    const autre = cote === 'acheteur' ? litige.supplier_company_id : litige.buyer_company_id;
    await documents.creerDocument({
      companyId, partnerCompanyId: autre, entityType: 'claim', entityId: id, category: 'piece_jointe', visibility: 'partenaire', fichier, uploadedBy: user.id,
    }, t);
    await synchroniser(t, [litige.buyer_company_id, litige.supplier_company_id], 'litige', { claim_id: id, status: litige.status });
  });
  return detail(id, companyId);
}

module.exports = {
  lister, detail, ouvrir, accepter, refuser, annuler, joindre,
};
