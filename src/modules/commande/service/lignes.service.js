'use strict';

const { Op } = require('sequelize');
const { Product, OrderVersion, OrderLine } = require('../../../models/index.js');
const { ValidationError } = require('../../../errors/AppError.js');
const { montantLigne, totaliser } = require('../../../utils/montants.js');

/**
 * Construction des lignes d'une version de commande.
 *
 * Chaque ligne est un INSTANTANÉ du produit (référence, désignation, unité,
 * prix HT, TVA) : modifier le catalogue ne réécrit jamais une commande. Les
 * montants sont calculés ici, côté serveur — jamais reçus du client.
 */

/**
 * Produits d'un fournisseur désignés par une liste d'identifiants, en UNE
 * requête. Un produit inconnu, d'un autre fournisseur, supprimé ou désactivé
 * est refusé (422).
 */
async function produitsDuFournisseur(supplierId, ids, transaction) {
  const uniques = [...new Set(ids.filter(Boolean))];
  if (!uniques.length) return new Map();
  const produits = await Product.findAll({
    where: { id: { [Op.in]: uniques }, company_id: supplierId },
    transaction,
  });
  const parId = new Map(produits.map((p) => [p.id, p]));
  const erreurs = uniques.filter((id) => !parId.get(id)?.is_active).map((id) => `Produit ${id} introuvable dans le catalogue de ce fournisseur, ou désactivé`);
  if (erreurs.length) throw new ValidationError('Données invalides', erreurs, 'PRODUIT_INVALIDE');
  return parId;
}

/** Ligne calculée à partir d'un produit du catalogue. */
function ligneDepuisProduit(produit, { quantite, prixUnitaire = null, commentaire = null }) {
  const prix = prixUnitaire ?? Number(produit.price);
  const taux = Number(produit.tax_rate);
  const m = montantLigne({ quantite, prixUnitaire: prix, tauxTva: taux });
  return {
    product_id: produit.id,
    reference: produit.reference,
    name: produit.name,
    unit: produit.unit,
    quantity: quantite,
    unit_price: prix,
    tax_rate: taux,
    line_subtotal: m.sousTotal,
    line_tax: m.tva,
    line_total: m.total,
    comment: commentaire,
  };
}

/** Ligne recalculée à partir d'une ligne existante (quantité et/ou prix modifiés). */
function recalculer(ligne, { quantite = Number(ligne.quantity), prixUnitaire = Number(ligne.unit_price) }) {
  const m = montantLigne({ quantite, prixUnitaire, tauxTva: Number(ligne.tax_rate) });
  return { quantity: quantite, unit_price: prixUnitaire, line_subtotal: m.sousTotal, line_tax: m.tva, line_total: m.total };
}

/**
 * § 9.1 — lignes du bon de commande saisies par l'acheteur : produits du
 * catalogue et quantités. Un produit en rupture n'est pas commandable ; la
 * quantité minimale de commande est respectée ; un produit n'apparaît qu'une fois.
 * @param {Array<{ product_id: string, quantity: number, comment?: string }>} saisies
 */
async function lignesAcheteur(supplierId, saisies, transaction) {
  const produits = await produitsDuFournisseur(supplierId, saisies.map((s) => s.product_id), transaction);
  const erreurs = [];
  const vus = new Set();
  const lignes = saisies.map((s, i) => {
    const p = produits.get(s.product_id);
    if (vus.has(s.product_id)) erreurs.push(`Ligne ${i + 1} : le produit « ${p.name} » figure déjà dans le bon de commande`);
    vus.add(s.product_id);
    if (p.availability === 'rupture') erreurs.push(`Ligne ${i + 1} : « ${p.name} » est indisponible chez le fournisseur`);
    if (s.quantity < Number(p.min_order_quantity)) erreurs.push(`Ligne ${i + 1} : quantité minimale de commande pour « ${p.name} » : ${Number(p.min_order_quantity)}`);
    return { ...ligneDepuisProduit(p, { quantite: s.quantity, commentaire: s.comment || null }), line_no: i + 1, change_type: 'inchangee' };
  });
  if (erreurs.length) throw new ValidationError('Données invalides', erreurs, 'LIGNES_INVALIDES');
  return lignes;
}

/**
 * § 10 — proposition modifiée du fournisseur, ou contre-proposition de
 * l'acheteur, à partir des lignes de la version COURANTE.
 *
 * Chaque saisie désigne :
 *   - une ligne existante (`line_no`) : quantité modifiée, prix modifié
 *     (fournisseur seulement), produit indisponible (fournisseur seulement),
 *     ou retrait (acheteur : quantité 0) ;
 *   - un produit du catalogue (`product_id`) : produit ajouté, ou produit de
 *     REMPLACEMENT d'une ligne (`substitute_for_line_no`, fournisseur).
 * Les lignes non citées sont reprises telles quelles.
 *
 * @param {Array<object>} lignesCourantes  lignes SIMPLES (get({ plain: true })) de la version courante
 * @param {'acheteur'|'fournisseur'} cote
 * @returns {Promise<Array<object>>} lignes de la nouvelle version
 */
async function lignesModifiees(supplierId, lignesCourantes, saisies, cote, transaction) {
  const parNumero = new Map(lignesCourantes.map((l) => [l.line_no, l]));
  const produits = await produitsDuFournisseur(supplierId, saisies.filter((s) => !s.line_no).map((s) => s.product_id), transaction);
  const erreurs = [];
  const modifiees = new Map();
  const ajoutees = [];

  saisies.forEach((s, i) => {
    const libelle = `Saisie ${i + 1}`;
    if (s.line_no) {
      const ligne = parNumero.get(s.line_no);
      if (!ligne) { erreurs.push(`${libelle} : la ligne ${s.line_no} n'existe pas`); return; }
      if (modifiees.has(s.line_no)) { erreurs.push(`${libelle} : la ligne ${s.line_no} est citée deux fois`); return; }
      if (cote === 'acheteur' && (s.unit_price !== undefined || s.unavailable)) {
        erreurs.push(`${libelle} : seul le fournisseur modifie un prix ou signale une indisponibilité`);
        return;
      }
      if (s.unavailable) {
        modifiees.set(s.line_no, {
          ...ligne, ...recalculer(ligne, { quantite: 0 }), change_type: 'indisponible',
          original_quantity: Number(ligne.quantity), comment: s.comment ?? ligne.comment,
        });
        return;
      }
      const quantite = s.quantity ?? Number(ligne.quantity);
      const prix = s.unit_price ?? Number(ligne.unit_price);
      if (cote === 'acheteur' && quantite === 0) { modifiees.set(s.line_no, null); return; }
      if (quantite <= 0) { erreurs.push(`${libelle} : quantité invalide (signalez plutôt le produit indisponible)`); return; }
      let changement = 'inchangee';
      if (quantite !== Number(ligne.quantity)) changement = 'quantite_modifiee';
      else if (prix !== Number(ligne.unit_price)) changement = 'prix_modifie';
      modifiees.set(s.line_no, {
        ...ligne,
        ...recalculer(ligne, { quantite, prixUnitaire: prix }),
        change_type: changement,
        original_quantity: changement === 'inchangee' ? null : Number(ligne.quantity),
        original_unit_price: prix !== Number(ligne.unit_price) ? Number(ligne.unit_price) : null,
        comment: s.comment ?? ligne.comment,
      });
      return;
    }
    const produit = produits.get(s.product_id);
    if (!s.quantity || s.quantity <= 0) { erreurs.push(`${libelle} : quantité requise pour un produit ajouté`); return; }
    if (cote === 'acheteur' && (s.unit_price !== undefined || s.substitute_for_line_no)) {
      erreurs.push(`${libelle} : seul le fournisseur fixe un prix ou propose un produit de remplacement`);
      return;
    }
    if (s.substitute_for_line_no && !parNumero.has(s.substitute_for_line_no)) {
      erreurs.push(`${libelle} : la ligne remplacée ${s.substitute_for_line_no} n'existe pas`);
      return;
    }
    if (lignesCourantes.some((l) => l.product_id === produit.id) || ajoutees.some((l) => l.product_id === produit.id)) {
      erreurs.push(`${libelle} : « ${produit.name} » figure déjà dans la commande (modifiez sa ligne)`);
      return;
    }
    ajoutees.push({
      ...ligneDepuisProduit(produit, { quantite: s.quantity, prixUnitaire: s.unit_price ?? null, commentaire: s.comment || null }),
      change_type: s.substitute_for_line_no ? 'substitution' : 'ajoutee',
      substitute_for_line_no: s.substitute_for_line_no || null,
    });
  });
  if (erreurs.length) throw new ValidationError('Données invalides', erreurs, 'LIGNES_INVALIDES');

  // Lignes reprises : remises à « inchangée » (la marque de changement
  // décrit l'écart avec la version PRÉCÉDENTE seulement).
  const reprises = lignesCourantes
    .filter((l) => !modifiees.has(l.line_no))
    .map((l) => ({ ...l, change_type: l.change_type === 'indisponible' ? 'indisponible' : 'inchangee', original_quantity: null, original_unit_price: null }));
  const conservees = [...reprises, ...[...modifiees.values()].filter(Boolean)].sort((a, b) => a.line_no - b.line_no);
  let numero = Math.max(0, ...lignesCourantes.map((l) => l.line_no));
  const resultat = [...conservees, ...ajoutees.map((l) => ({ ...l, line_no: ++numero }))];

  if (!resultat.some((l) => Number(l.quantity) > 0)) {
    throw new ValidationError('Données invalides', ['La commande ne contiendrait plus aucun produit : refusez-la ou annulez-la plutôt'], 'COMMANDE_VIDE');
  }
  const retirees = [...modifiees.values()].filter((m) => m === null).length;
  const changees = [...modifiees.values()].filter((m) => m && m.change_type !== 'inchangee').length;
  if (!ajoutees.length && !retirees && !changees) {
    throw new ValidationError('Données invalides', ['Aucune modification par rapport à la version actuelle'], 'AUCUNE_MODIFICATION');
  }
  return resultat;
}

/** Champs d'une ligne existante, prêts à être recopiés dans une nouvelle version. */
const CHAMPS_LIGNE = [
  'line_no', 'product_id', 'reference', 'name', 'unit', 'quantity', 'unit_price', 'tax_rate', 'line_subtotal', 'line_tax',
  'line_total', 'change_type', 'original_quantity', 'original_unit_price', 'substitute_for_line_no', 'comment',
];
const copier = (ligne) => Object.fromEntries(CHAMPS_LIGNE.map((c) => [c, ligne[c] ?? null]));

/**
 * Crée une version et ses lignes ; met à jour les totaux de la commande.
 * @returns {Promise<object>} la version créée
 */
async function creerVersion(t, commande, { numero, cote, auteur, statut, commentaire = null, lignes }) {
  const totaux = totaliser(lignes);
  const version = await OrderVersion.create({
    order_id: commande.id,
    version_no: numero,
    proposed_by_side: cote,
    proposed_by: auteur?.id || null,
    status: statut,
    comment: commentaire,
    ...totaux,
    lines_count: lignes.length,
  }, { transaction: t });
  await OrderLine.bulkCreate(lignes.map((l) => ({
    ...copier(l), order_id: commande.id, version_id: version.id,
  })), { transaction: t });
  await commande.update({ current_version_no: numero, ...totaux, lines_count: lignes.length }, { transaction: t });
  return version;
}

/** Remplace les lignes d'une version brouillon (modification du bon avant envoi). */
async function remplacerLignes(t, commande, version, lignes) {
  await OrderLine.destroy({ where: { version_id: version.id }, transaction: t });
  await OrderLine.bulkCreate(lignes.map((l) => ({ ...copier(l), order_id: commande.id, version_id: version.id })), { transaction: t });
  const totaux = totaliser(lignes);
  await version.update({ ...totaux, lines_count: lignes.length }, { transaction: t });
  await commande.update({ ...totaux, lines_count: lignes.length }, { transaction: t });
}

module.exports = {
  produitsDuFournisseur, lignesAcheteur, lignesModifiees, creerVersion, remplacerLignes, copier,
};
