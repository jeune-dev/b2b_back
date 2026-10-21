'use strict';

const { ValidationError } = require('../../../errors/AppError.js');
const { montantLigne, totaliser } = require('../../../utils/montants.js');

/**
 * Rapprochement à trois voies : COMMANDE (prix validés) / RÉCEPTION
 * (quantités reçues) / FACTURE (quantités et prix facturés).
 *
 * Une facture qui facture plus que ce qui a été reçu, ou plus cher que le
 * prix validé — au-delà de la tolérance de l'acheteur — est marquée « écart »
 * et son PAIEMENT est BLOQUÉ (aucune imputation) jusqu'à ce que l'acheteur
 * accepte l'écart ou que le fournisseur la remplace. Facturer moins (geste
 * commercial, oubli) n'est jamais un écart. Pour une facture TRANSMISE (PDF
 * du fournisseur), le total imprimé déclaré est aussi comparé au total
 * calculé, dans les deux sens : les deux documents doivent concorder.
 */

const q = (v) => Math.round(Number(v || 0) * 1000) / 1000;

/** Ligne de facture valorisée. */
function ligne(source, quantite, prix, numeroCommande) {
  const m = montantLigne({ quantite, prixUnitaire: prix, tauxTva: Number(source.tax_rate) });
  return {
    order_line_no: numeroCommande,
    product_id: source.product_id,
    reference: source.reference,
    name: source.name,
    unit: source.unit,
    quantity: quantite,
    unit_price: prix,
    tax_rate: Number(source.tax_rate),
    line_subtotal: m.sousTotal,
    line_tax: m.tva,
    line_total: m.total,
  };
}

/**
 * Lignes ATTENDUES : version validée × quantités réceptionnées ; une ligne
 * sans quantité reçue (indisponible, rien reçu, reliquat soldé) n'est pas due.
 */
function lignesAttendues(lignesCommande) {
  return lignesCommande
    .map((l) => ({ l, quantite: l.received_quantity !== null && l.received_quantity !== undefined ? Number(l.received_quantity) : Number(l.quantity) }))
    .filter(({ quantite }) => quantite > 0)
    .map(({ l, quantite }) => ligne(l, quantite, Number(l.unit_price), l.line_no));
}

/**
 * Lignes FACTURÉES : les lignes attendues, avec les quantités et prix que le
 * fournisseur facture effectivement quand il les précise (`line_no` de la
 * commande validée). Quantité 0 : la ligne n'est pas facturée.
 * @param {Array<{ line_no: number, quantity?: number, unit_price?: number }>} saisies
 */
function lignesFacturees(attendues, lignesCommande, saisies = []) {
  if (!saisies.length) return attendues.map((l) => ({ ...l }));
  const commande = new Map(lignesCommande.map((l) => [l.line_no, l]));
  const parNumero = new Map(saisies.map((s) => [s.line_no, s]));
  const inconnues = saisies.filter((s) => !commande.has(s.line_no) || Number(commande.get(s.line_no).quantity) <= 0);
  if (inconnues.length) {
    throw new ValidationError('Données invalides', inconnues.map((s) => `La ligne ${s.line_no} n'existe pas dans la commande validée`), 'LIGNES_INVALIDES');
  }
  const attenduesParNumero = new Map(attendues.map((l) => [l.order_line_no, l]));
  const numeros = [...new Set([...attendues.map((l) => l.order_line_no), ...saisies.map((s) => s.line_no)])].sort((a, b) => a - b);
  return numeros.map((n) => {
    const base = attenduesParNumero.get(n) || ligne(commande.get(n), 0, Number(commande.get(n).unit_price), n);
    const s = parNumero.get(n);
    if (!s) return { ...base };
    return ligne(commande.get(n), s.quantity ?? base.quantity, s.unit_price ?? base.unit_price, n);
  }).filter((l) => l.quantity > 0);
}

/**
 * @param {number} tolerance  en % (réglage de l'acheteur)
 * @param {number|null} totalDeclare  total imprimé sur une facture transmise
 * @returns {{ statut: 'conforme'|'ecart', details: object }}
 */
function rapprocher(attendues, facturees, tolerance, totalDeclare = null) {
  const marge = (v) => v * (1 + tolerance / 100);
  const attenduesParNumero = new Map(attendues.map((l) => [l.order_line_no, l]));
  const ecarts = [];
  for (const f of facturees) {
    const a = attenduesParNumero.get(f.order_line_no);
    if (!a) {
      ecarts.push({ line_no: f.order_line_no, name: f.name, type: 'non_receptionne', attendu: 0, facture: f.quantity });
      continue;
    }
    if (q(f.quantity) > q(marge(a.quantity))) ecarts.push({ line_no: f.order_line_no, name: f.name, type: 'quantite', attendu: a.quantity, facture: f.quantity });
    if (f.unit_price > Math.round(marge(a.unit_price))) ecarts.push({ line_no: f.order_line_no, name: f.name, type: 'prix', attendu: a.unit_price, facture: f.unit_price });
  }
  const totalCalcule = totaliser(facturees).total;
  const totalAttendu = totaliser(attendues).total;
  if (totalDeclare !== null && totalDeclare !== undefined && Math.abs(totalDeclare - totalCalcule) > Math.round((totalCalcule * tolerance) / 100)) {
    ecarts.push({ type: 'total_document', attendu: totalCalcule, facture: totalDeclare });
  }
  return {
    statut: ecarts.length ? 'ecart' : 'conforme',
    details: {
      tolerance_percent: tolerance, expected_total: totalAttendu, invoiced_total: totalCalcule, declared_total: totalDeclare, ecarts,
    },
  };
}

/** Facture bloquée au paiement (écart non accepté, ou contestée). */
const estBloquee = (facture) => ['ecart', 'conteste'].includes(facture.match_status);

module.exports = {
  lignesAttendues, lignesFacturees, rapprocher, estBloquee,
};
