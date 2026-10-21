'use strict';

const { QueryTypes } = require('sequelize');
const sequelize = require('../../../config/db.js');
const {
  Company, Delivery, DeliveryLine, OrderLine,
} = require('../../../models/index.js');
const { P } = require('../../../config/permissions.js');
const { ConflictError, NotFoundError, ValidationError } = require('../../../errors/AppError.js');
const { prochainNumero, pad } = require('../../../utils/compteur.js');
const { aujourdhui } = require('../../../utils/dates.js');
const { formatQuantite } = require('../../../utils/montants.js');
const { transactionAvecFichiers } = require('../../../database/transaction.js');
const C = require('./commun.js');
const { detail } = require('./commande.service.js');
const documents = require('../../document/service/document.service.js');
const stock = require('../../catalogue/service/stock.service.js');
const { journaliser } = require('../../audit/service/audit.service.js');
const { notifierEntreprise } = require('../../notification/service/notification.service.js');

/**
 * Livraisons (§ 13) — une commande validée peut être livrée en PLUSIEURS
 * fois. Chaque livraison est un bon de livraison numéroté (BL-2026-00012)
 * portant les quantités expédiées ligne par ligne :
 *
 *   validée / en préparation / prête
 *     → livraison partielle → « livrée partiellement » (reliquat à livrer)
 *     → dernière livraison  → « livrée »
 *
 * L'acheteur réceptionne CHAQUE livraison (quantités reçues, réserves). Les
 * quantités reçues cumulées alimentent la facture (§ 14). Quand tout est
 * livré et réceptionné, la commande passe à « réception confirmée ».
 *
 * Le reliquat peut être SOLDÉ (par le fournisseur qui ne peut pas livrer le
 * reste, ou par l'acheteur qui y renonce) : il ne sera plus livré ni facturé,
 * le stock réservé est libéré.
 */

const q = (v) => Math.round(Number(v || 0) * 1000) / 1000;
const STATUTS_LIVRABLES = ['validee', 'en_preparation', 'prete', 'livree_partiellement'];

/** Lignes livrables de la version validée et leur reliquat. */
function reliquats(commande, lignes) {
  return lignes
    .filter((l) => Number(l.quantity) > 0)
    .map((l) => ({ ligne: l, reste: commande.backorder_closed_at ? 0 : q(Number(l.quantity) - Number(l.delivered_quantity)) }));
}

async function numero(supplierId, t) {
  const annee = aujourdhui().slice(0, 4);
  const n = await prochainNumero(`company:${supplierId}:delivery:${annee}`, t);
  return `BL-${annee}-${pad(n)}`;
}

async function nomEntreprise(companyId, t) {
  return (await Company.findByPk(companyId, { attributes: ['name'], transaction: t })).name;
}

/**
 * Expédition d'une livraison par le fournisseur.
 * @param {{ lines?: Array<{ line_no: number, quantity: number }>, note?: string, carrier?: string, revision?: number }} donnees
 *   sans `lines` : tout le reliquat est livré.
 * @param {object|null} fichier  bon de livraison signé / photo (facultatif)
 */
async function expedier(id, companyId, user, {
  lines = null, note = null, carrier = null, revision,
}, fichier = null) {
  await transactionAvecFichiers(async (t) => {
    const { commande } = await C.chargerPourModifier(id, companyId, t, 'fournisseur');
    C.verifierRevision(commande, revision);
    if (!STATUTS_LIVRABLES.includes(commande.status)) C.verifierStatut(commande, 'livree');
    const version = await C.version(commande.id, commande.validated_version_no, t);
    const restes = reliquats(commande, version.lines);
    const parNumero = new Map(restes.map((r) => [r.ligne.line_no, r]));
    const erreurs = [];
    let envois;
    if (lines?.length) {
      envois = lines.map((s) => {
        const r = parNumero.get(s.line_no);
        if (!r) erreurs.push(`La ligne ${s.line_no} n'existe pas dans la commande validée (ou n'a rien à livrer)`);
        else if (s.quantity > r.reste) erreurs.push(`Ligne ${s.line_no} « ${r.ligne.name} » : ${formatQuantite(s.quantity)} livré(s) pour un reste à livrer de ${formatQuantite(r.reste)}`);
        return r ? { ligne: r.ligne, quantite: s.quantity } : null;
      });
    } else {
      envois = restes.filter((r) => r.reste > 0).map((r) => ({ ligne: r.ligne, quantite: r.reste }));
    }
    if (erreurs.length) throw new ValidationError('Données invalides', erreurs, 'LIVRAISON_INVALIDE');
    envois = envois.filter((e) => e.quantite > 0);
    if (!envois.length) throw new ConflictError('Il ne reste rien à livrer sur cette commande.', 'RIEN_A_LIVRER');

    await stock.sortir(t, commande, envois, user, `Livraison ${commande.number}`);
    const livraison = await Delivery.create({
      number: await numero(companyId, t),
      order_id: commande.id,
      supplier_company_id: companyId,
      buyer_company_id: commande.buyer_company_id,
      delivery_no: commande.deliveries_count + 1,
      status: 'expediee',
      note,
      carrier,
      created_by: user.id,
    }, { transaction: t });
    await DeliveryLine.bulkCreate(envois.map(({ ligne, quantite }) => ({
      delivery_id: livraison.id, line_no: ligne.line_no, product_id: ligne.product_id, reference: ligne.reference, name: ligne.name, unit: ligne.unit, quantity: quantite,
    })), { transaction: t });
    for (const { ligne, quantite } of envois) {
      await ligne.update({ delivered_quantity: q(Number(ligne.delivered_quantity) + quantite) }, { transaction: t });
    }
    if (fichier) {
      const document = await documents.creerDocument({
        companyId, partnerCompanyId: commande.buyer_company_id, entityType: 'order', entityId: commande.id,
        category: 'bon_livraison', visibility: 'partenaire', fichier, uploadedBy: user.id,
      }, t);
      await livraison.update({ document_id: document.id }, { transaction: t });
    }

    const complete = reliquats(commande, version.lines).every((r) => r.reste <= 0);
    const vers = complete ? 'livree' : 'livree_partiellement';
    const avant = commande.status;
    if (avant !== vers) C.verifierStatut(commande, vers);
    await commande.update({
      status: vers,
      deliveries_count: commande.deliveries_count + 1,
      ...(complete ? { delivered_at: new Date(), delivery_note: note } : {}),
    }, { transaction: t });
    const resume = envois.map(({ ligne, quantite }) => ({ line_no: ligne.line_no, name: ligne.name, quantite }));
    await C.historiser(t, commande, {
      type: complete ? 'livraison' : 'livraison_partielle', de: avant, vers, acteur: user, companyId, cote: 'fournisseur', message: note,
      details: { delivery_id: livraison.id, number: livraison.number, lignes: resume, ...(livraison.document_id ? { bon_livraison_id: livraison.document_id } : {}) },
    });
    await journaliser({ action: 'commande.livraison', entityType: 'order', entityId: commande.id, companyId, details: { number: commande.number, livraison: livraison.number, complete } }, t);
    const fournisseur = await nomEntreprise(companyId, t);
    await notifierEntreprise(t, commande.buyer_company_id, P.RECEPTION_CONFIRMER, {
      type: complete ? 'commande_livree' : 'livraison_partielle',
      titre: `${complete ? 'Commande livrée' : 'Livraison partielle'} — ${commande.number}`,
      corps: complete
        ? `${fournisseur} indique avoir livré votre commande ${commande.number} (${livraison.number}). Vérifiez la livraison et confirmez la réception.`
        : `${fournisseur} a livré une partie de votre commande ${commande.number} (${livraison.number}) ; le reste suivra. Réceptionnez cette livraison.`,
      donnees: { order_id: commande.id, number: commande.number, delivery_id: livraison.id },
    });
    await C.apresChangement(t, commande);
  });
  return detail(id, companyId);
}

/**
 * Quantités reçues cumulées par ligne de la version validée (somme des
 * livraisons réceptionnées) : base de la facture (§ 14).
 */
async function cumulerReceptions(t, commande) {
  await sequelize.query(
    `UPDATE order_lines l SET received_quantity = coalesce((
        SELECT sum(dl.received_quantity) FROM delivery_lines dl JOIN deliveries d ON d.id = dl.delivery_id
         WHERE d.order_id = :orderId AND d.status = 'receptionnee' AND dl.line_no = l.line_no), 0)
      FROM order_versions v
     WHERE v.id = l.version_id AND v.order_id = :orderId AND v.version_no = :versionNo`,
    { replacements: { orderId: commande.id, versionNo: commande.validated_version_no }, transaction: t }
  );
}

/**
 * Livraisons en attente de réception. Pas de verrou propre : toute écriture
 * sur une livraison passe par la commande, verrouillée par l'appelant.
 */
async function enAttente(commandeId, t) {
  return Delivery.findAll({
    where: { order_id: commandeId, status: 'expediee' },
    include: [{ model: DeliveryLine, as: 'lines' }],
    order: [['delivery_no', 'ASC'], [{ model: DeliveryLine, as: 'lines' }, 'line_no', 'ASC']],
    transaction: t,
  });
}

/**
 * Passage à « réception confirmée » quand plus rien n'est attendu : tout est
 * livré (ou le reliquat soldé) et chaque livraison est réceptionnée.
 */
async function cloreSiComplete(t, commande, user, companyId, note) {
  const restantes = await Delivery.count({ where: { order_id: commande.id, status: 'expediee' }, transaction: t });
  if (restantes || commande.status !== 'livree') return false;
  const [{ reserves }] = await sequelize.query(
    "SELECT bool_or(with_reserves) AS reserves FROM deliveries WHERE order_id = :id AND status = 'receptionnee'",
    { replacements: { id: commande.id }, type: QueryTypes.SELECT, transaction: t }
  );
  C.verifierStatut(commande, 'reception_confirmee');
  await commande.update({
    status: 'reception_confirmee', received_at: new Date(), reception_note: note, reception_with_reserves: Boolean(reserves) || Boolean(commande.backorder_closed_at),
  }, { transaction: t });
  await C.historiser(t, commande, {
    type: 'reception', de: 'livree', vers: 'reception_confirmee', versionNo: commande.validated_version_no, acteur: user, companyId, cote: 'acheteur', message: note,
    details: { avec_reserves: commande.reception_with_reserves },
  });
  return true;
}

/**
 * Réception de livraisons par l'acheteur.
 * @param {Array<object>} livraisons  livraisons « expédiées » visées
 * @param {Array<{ line_no: number, received_quantity: number }>} saisies  quantités reçues par ligne de
 *   commande, réparties sur les livraisons visées dans leur ordre ; sans saisie : tout est reçu.
 */
async function receptionner(t, commande, livraisons, saisies, { user, companyId, note, reserves }) {
  const erreurs = [];
  const livreParLigne = new Map();
  for (const d of livraisons) for (const l of d.lines) livreParLigne.set(l.line_no, q((livreParLigne.get(l.line_no) || 0) + Number(l.quantity)));
  for (const s of saisies) {
    if (!livreParLigne.has(s.line_no)) erreurs.push(`La ligne ${s.line_no} ne fait pas partie de la livraison à réceptionner`);
    else if (s.received_quantity > livreParLigne.get(s.line_no)) erreurs.push(`Ligne ${s.line_no} : quantité reçue supérieure à la quantité livrée (${formatQuantite(livreParLigne.get(s.line_no))})`);
  }
  if (erreurs.length) throw new ValidationError('Données invalides', erreurs, 'RECEPTION_INVALIDE');

  const aRepartir = new Map(saisies.map((s) => [s.line_no, s.received_quantity]));
  let ecart = false;
  for (const d of livraisons) {
    for (const l of d.lines) {
      let recue = Number(l.quantity);
      if (aRepartir.has(l.line_no)) {
        recue = Math.min(Number(l.quantity), aRepartir.get(l.line_no));
        aRepartir.set(l.line_no, q(aRepartir.get(l.line_no) - recue));
      }
      if (recue !== Number(l.quantity)) ecart = true;
      await l.update({ received_quantity: recue }, { transaction: t });
    }
    await d.update({
      status: 'receptionnee', received_at: new Date(), received_by: user.id, reception_note: note, with_reserves: Boolean(reserves) || ecart,
    }, { transaction: t });
  }
  await cumulerReceptions(t, commande);
  const avecReserves = Boolean(reserves) || ecart;
  const close = await cloreSiComplete(t, commande, user, companyId, note);
  if (!close) {
    await C.historiser(t, commande, {
      type: 'reception_partielle', acteur: user, companyId, cote: 'acheteur', message: note,
      details: { livraisons: livraisons.map((d) => d.number), avec_reserves: avecReserves },
    });
  }
  await journaliser({ action: 'commande.reception', entityType: 'order', entityId: commande.id, companyId, details: { number: commande.number, livraisons: livraisons.map((d) => d.number), avec_reserves: avecReserves, complete: close } }, t);
  const acheteur = await nomEntreprise(companyId, t);
  await notifierEntreprise(t, commande.supplier_company_id, P.VENTES_LIRE, {
    type: 'reception_confirmee',
    titre: `${close ? 'Réception confirmée' : 'Livraison réceptionnée'} — ${commande.number}`,
    corps: close
      ? `${acheteur} a confirmé la réception de la commande ${commande.number}${avecReserves ? ' avec réserves' : ''}. Vous pouvez établir la facture.`
      : `${acheteur} a réceptionné ${livraisons.map((d) => d.number).join(', ')}${avecReserves ? ' avec réserves' : ''} pour la commande ${commande.number}.`,
    donnees: { order_id: commande.id, number: commande.number },
  });
  await C.apresChangement(t, commande);
}

/** Réception d'UNE livraison désignée. */
async function receptionnerLivraison(id, livraisonId, companyId, user, {
  lines = [], note = null, with_reserves: reserves = false, revision,
}) {
  await sequelize.transaction(async (t) => {
    const { commande } = await C.chargerPourModifier(id, companyId, t, 'acheteur');
    C.verifierRevision(commande, revision);
    const livraison = (await enAttente(commande.id, t)).find((d) => d.id === livraisonId);
    if (!livraison) {
      const existe = await Delivery.count({ where: { id: livraisonId, order_id: commande.id }, transaction: t });
      if (!existe) throw new NotFoundError('Livraison introuvable');
      throw new ConflictError('Cette livraison est déjà réceptionnée.', 'LIVRAISON_DEJA_RECEPTIONNEE');
    }
    await receptionner(t, commande, [livraison], lines, { user, companyId, note, reserves });
  });
  return detail(id, companyId);
}

/**
 * § 13 — confirmation de réception globale : toutes les livraisons en
 * attente sont réceptionnées (quantités reçues facultatives, par ligne).
 */
async function confirmerReception(id, companyId, user, {
  lines = [], note = null, with_reserves: reserves = false, revision,
}) {
  await sequelize.transaction(async (t) => {
    const { commande } = await C.chargerPourModifier(id, companyId, t, 'acheteur');
    C.verifierRevision(commande, revision);
    if (!['livree', 'livree_partiellement'].includes(commande.status)) C.verifierStatut(commande, 'reception_confirmee');
    const livraisons = await enAttente(commande.id, t);
    if (!livraisons.length) throw new ConflictError('Aucune livraison en attente de réception sur cette commande.', 'AUCUNE_LIVRAISON_A_RECEPTIONNER');
    await receptionner(t, commande, livraisons, lines, { user, companyId, note, reserves });
  });
  return detail(id, companyId);
}

/**
 * Solde du reliquat : ce qui n'est pas encore livré ne le sera pas. Possible
 * pour les deux parties sur une commande livrée partiellement ; l'autre
 * partie est avertie, le stock réservé est libéré.
 */
async function solderReliquat(id, companyId, user, { reason, revision }, coteExige) {
  await sequelize.transaction(async (t) => {
    const { commande, cote } = await C.chargerPourModifier(id, companyId, t, coteExige);
    C.verifierRevision(commande, revision);
    if (commande.status !== 'livree_partiellement') {
      throw new ConflictError('Seul le reliquat d’une commande livrée partiellement peut être soldé.', 'TRANSITION_INVALIDE', { statutActuel: commande.status });
    }
    const version = await C.version(commande.id, commande.validated_version_no, t);
    const nonLivre = reliquats(commande, version.lines).filter((r) => r.reste > 0).map((r) => ({ line_no: r.ligne.line_no, name: r.ligne.name, quantite: r.reste }));
    await stock.liberer(t, commande, version.lines, user, `Reliquat soldé ${commande.number}`);
    await commande.update({ backorder_closed_at: new Date(), backorder_closed_by_side: cote, backorder_close_reason: reason }, { transaction: t });
    C.verifierStatut(commande, 'livree');
    await commande.update({ status: 'livree', delivered_at: new Date() }, { transaction: t });
    await C.historiser(t, commande, {
      type: 'reliquat_solde', de: 'livree_partiellement', vers: 'livree', acteur: user, companyId, cote, message: reason, details: { non_livre: nonLivre },
    });
    await journaliser({ action: 'commande.reliquat_solde', entityType: 'order', entityId: commande.id, companyId, details: { number: commande.number, motif: reason, non_livre: nonLivre } }, t);
    // Tout ce qui a été livré est déjà réceptionné : la réception est confirmée.
    await cumulerReceptions(t, commande);
    await cloreSiComplete(t, commande, user, companyId, null);
    const autre = cote === 'acheteur' ? commande.supplier_company_id : commande.buyer_company_id;
    await notifierEntreprise(t, autre, cote === 'acheteur' ? P.VENTES_LIRE : P.ACHATS_LIRE, {
      type: 'commande_modifiee',
      titre: `Reliquat soldé — ${commande.number}`,
      corps: `${await nomEntreprise(companyId, t)} a soldé le reliquat de la commande ${commande.number} : le reste ne sera pas livré (${reason}).`,
      donnees: { order_id: commande.id, number: commande.number },
    });
    await C.apresChangement(t, commande);
  });
  return detail(id, companyId);
}

/** Livraisons d'une commande (bons de livraison et réceptions). */
async function lister(id, companyId, coteExige) {
  const { commande } = await C.charger(id, companyId, { attributes: ['id', 'buyer_company_id', 'supplier_company_id', 'status'] }, { cote: coteExige });
  return Delivery.findAll({
    where: { order_id: commande.id },
    include: [{ model: DeliveryLine, as: 'lines', separate: true, order: [['line_no', 'ASC']] }],
    order: [['delivery_no', 'ASC']],
  });
}

/** Bon de livraison signé ou photo, ajouté après coup par le fournisseur. */
async function joindreDocument(id, livraisonId, companyId, user, fichier) {
  await transactionAvecFichiers(async (t) => {
    const { commande } = await C.chargerPourModifier(id, companyId, t, 'fournisseur');
    const livraison = await Delivery.findOne({ where: { id: livraisonId, order_id: commande.id }, transaction: t, lock: t.LOCK.UPDATE });
    if (!livraison) throw new NotFoundError('Livraison introuvable');
    const document = await documents.creerDocument({
      companyId, partnerCompanyId: commande.buyer_company_id, entityType: 'order', entityId: commande.id,
      category: 'bon_livraison', visibility: 'partenaire', fichier, uploadedBy: user.id,
    }, t);
    await livraison.update({ document_id: document.id }, { transaction: t });
    await C.apresChangement(t, commande);
  });
  return lister(id, companyId, 'fournisseur');
}

/** Livraison d'une commande, pour son PDF (contrôle d'accès de la commande). */
async function pourPdf(id, livraisonId, companyId, coteExige) {
  const { commande } = await C.charger(id, companyId, {}, { cote: coteExige });
  const livraison = await Delivery.findOne({
    where: { id: livraisonId, order_id: commande.id },
    include: [{ model: DeliveryLine, as: 'lines', separate: true, order: [['line_no', 'ASC']] }],
  });
  if (!livraison) throw new NotFoundError('Livraison introuvable');
  const version = await C.version(commande.id, commande.validated_version_no);
  return { commande, livraison, lignesCommande: version.lines };
}

/** Lignes de commande validées, verrouillables (litiges). */
function lignesValidees(commande, t) {
  return OrderLine.findAll({
    where: { order_id: commande.id },
    include: [{ association: 'version', where: { version_no: commande.validated_version_no }, attributes: [] }],
    transaction: t,
  });
}

module.exports = {
  expedier, receptionnerLivraison, confirmerReception, solderReliquat, lister, joindreDocument, pourPdf, lignesValidees,
};
