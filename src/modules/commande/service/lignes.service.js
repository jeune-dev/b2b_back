'use strict';

const { Op } = require('sequelize');
const sequelize = require('../../../config/db.js');
const { Product, OrderVersion, OrderLine } = require('../../../models/index.js');
const { ValidationError } = require('../../../errors/AppError.js');
const { montantLigne, totaliser, formatQuantite } = require('../../../utils/montants.js');
const tarification = require('../../catalogue/service/tarification.service.js');

/**
 * Construction des lignes d'une version de commande.
 *
 * Chaque ligne est un INSTANTANÉ du produit (référence, désignation, unité,
 * prix HT, TVA) : modifier le catalogue ne réécrit jamais une commande. Les
 * montants sont calculés ici, côté serveur — jamais reçus du client — au PRIX
 * DU CLIENT : liste de prix de son partenariat, puis remise par palier de
 * quantité (`base_unit_price` : prix avant palier, `discount_percent` : remise
 * de palier appliquée).
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

/**
 * Saisie rapide : produits désignés par leur RÉFÉRENCE fournisseur (sans
 * distinction de casse), résolus en une requête.
 * @returns {Promise<Map<string, object>>} référence en minuscules → produit actif
 */
async function produitsParReference(supplierId, references, transaction) {
  const uniques = [...new Set(references.filter(Boolean).map((r) => r.trim().toLowerCase()))];
  if (!uniques.length) return new Map();
  const produits = await Product.findAll({
    where: {
      company_id: supplierId,
      is_active: true,
      [Op.and]: [sequelize.where(sequelize.fn('lower', sequelize.col('reference')), { [Op.in]: uniques })],
    },
    attributes: ['id', 'reference'],
    transaction,
  });
  return new Map(produits.map((p) => [p.reference.toLowerCase(), p]));
}

/**
 * Remplace la référence d'une saisie par l'identifiant du produit.
 * @param {Array<{ product_id?: string, reference?: string }>} saisies
 */
async function resoudreReferences(supplierId, saisies, transaction) {
  if (!saisies.some((s) => s.reference)) return saisies;
  const parRef = await produitsParReference(supplierId, saisies.map((s) => s.reference), transaction);
  const erreurs = [];
  const resolues = saisies.map((s, i) => {
    if (!s.reference) return s;
    const p = parRef.get(s.reference.trim().toLowerCase());
    if (!p) {
      erreurs.push(`Ligne ${i + 1} : référence « ${s.reference} » introuvable dans le catalogue de ce fournisseur`);
      return s;
    }
    const { reference, ...reste } = s;
    return { ...reste, product_id: p.id };
  });
  if (erreurs.length) throw new ValidationError('Données invalides', erreurs, 'REFERENCE_INCONNUE');
  return resolues;
}

/** Quantité exprimée en millièmes (3 décimales) : comparaisons exactes. */
const milliemes = (v) => Math.round(Number(v) * 1000);

/**
 * Règles de quantité du fournisseur pour un produit : minimum, multiple
 * (« par carton de 12 »), maximum par commande.
 * @returns {string[]} erreurs lisibles
 */
function erreursQuantite(produit, quantite, libelle) {
  const erreurs = [];
  if (quantite < Number(produit.min_order_quantity)) {
    erreurs.push(`${libelle} : quantité minimale de commande pour « ${produit.name} » : ${formatQuantite(produit.min_order_quantity)}`);
  }
  if (produit.order_multiple && milliemes(quantite) % milliemes(produit.order_multiple) !== 0) {
    erreurs.push(`${libelle} : « ${produit.name} » se commande par multiples de ${formatQuantite(produit.order_multiple)}`);
  }
  if (produit.max_order_quantity && quantite > Number(produit.max_order_quantity)) {
    erreurs.push(`${libelle} : quantité maximale par commande pour « ${produit.name} » : ${formatQuantite(produit.max_order_quantity)}`);
  }
  return erreurs;
}

/**
 * Ligne calculée à partir d'un produit du catalogue.
 * @param {{ quantite: number, tarif?: { base_unit_price: number, discount_percent: number, unit_price: number }, prixUnitaire?: number|null, commentaire?: string|null }} o
 *   `prixUnitaire` (fixé par le fournisseur) prime sur le tarif.
 */
function ligneDepuisProduit(produit, {
  quantite, tarif = null, prixUnitaire = null, commentaire = null,
}) {
  const prix = prixUnitaire ?? tarif?.unit_price ?? Number(produit.price);
  const taux = Number(produit.tax_rate);
  const m = montantLigne({ quantite, prixUnitaire: prix, tauxTva: taux });
  return {
    product_id: produit.id,
    reference: produit.reference,
    name: produit.name,
    unit: produit.unit,
    quantity: quantite,
    unit_price: prix,
    base_unit_price: prixUnitaire === null ? (tarif?.base_unit_price ?? prix) : prix,
    discount_percent: prixUnitaire === null ? (tarif?.discount_percent || 0) : 0,
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
 * catalogue (par identifiant ou par RÉFÉRENCE) et quantités. Un produit en
 * rupture n'est pas commandable ; minimum, multiple et maximum sont
 * respectés ; un produit n'apparaît qu'une fois.
 * @param {Array<{ product_id?: string, reference?: string, quantity: number, comment?: string }>} saisies
 */
async function lignesAcheteur(supplierId, buyerId, saisies, transaction) {
  const resolues = await resoudreReferences(supplierId, saisies, transaction);
  const ids = resolues.map((s) => s.product_id);
  const produits = await produitsDuFournisseur(supplierId, ids, transaction);
  const ctx = await tarification.contexte(supplierId, buyerId, ids, transaction);
  const erreurs = [];
  const vus = new Set();
  const lignes = resolues.map((s, i) => {
    const p = produits.get(s.product_id);
    const libelle = `Ligne ${i + 1}`;
    if (vus.has(s.product_id)) erreurs.push(`${libelle} : le produit « ${p.name} » figure déjà dans le bon de commande`);
    vus.add(s.product_id);
    if (p.availability === 'rupture') erreurs.push(`${libelle} : « ${p.name} » est indisponible chez le fournisseur`);
    erreurs.push(...erreursQuantite(p, s.quantity, libelle));
    return {
      ...ligneDepuisProduit(p, { quantite: s.quantity, tarif: tarification.prixPour(p, ctx, s.quantity), commentaire: s.comment || null }),
      line_no: i + 1,
      change_type: 'inchangee',
    };
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
 * Quand la quantité d'une ligne change, son prix suit les paliers de remise —
 * sauf si le fournisseur avait négocié un prix propre sur cette ligne (prix
 * différent du tarif) : ce prix est conservé.
 *
 * @param {Array<object>} lignesCourantes  lignes SIMPLES (get({ plain: true })) de la version courante
 * @param {'acheteur'|'fournisseur'} cote
 * @returns {Promise<Array<object>>} lignes de la nouvelle version
 */
async function lignesModifiees(supplierId, buyerId, lignesCourantes, saisies, cote, transaction) {
  const parNumero = new Map(lignesCourantes.map((l) => [l.line_no, l]));
  const produits = await produitsDuFournisseur(supplierId, saisies.filter((s) => !s.line_no).map((s) => s.product_id), transaction);
  // Produits des lignes existantes dont la quantité change (paliers) — même désactivés depuis.
  const idsExistants = saisies.filter((s) => s.line_no && s.quantity !== undefined).map((s) => parNumero.get(s.line_no)?.product_id).filter(Boolean);
  const existants = idsExistants.length
    ? new Map((await Product.findAll({ where: { id: { [Op.in]: [...new Set(idsExistants)] }, company_id: supplierId }, transaction, paranoid: false })).map((p) => [p.id, p]))
    : new Map();
  const ctx = await tarification.contexte(supplierId, buyerId, [...produits.keys(), ...existants.keys()], transaction);
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
      if (cote === 'acheteur' && quantite === 0) { modifiees.set(s.line_no, null); return; }
      if (quantite <= 0) { erreurs.push(`${libelle} : quantité invalide (signalez plutôt le produit indisponible)`); return; }
      const produit = existants.get(ligne.product_id);
      if (cote === 'acheteur' && produit && quantite !== Number(ligne.quantity)) erreurs.push(...erreursQuantite(produit, quantite, libelle));
      // Prix : fixé par le fournisseur, sinon tarif de la nouvelle quantité si la ligne suivait le tarif.
      let prix = s.unit_price ?? Number(ligne.unit_price);
      let tarif = { base_unit_price: ligne.base_unit_price, discount_percent: Number(ligne.discount_percent || 0) };
      if (s.unit_price === undefined && produit && quantite !== Number(ligne.quantity)
        && Number(ligne.unit_price) === tarification.prixPour(produit, ctx, Number(ligne.quantity)).unit_price) {
        tarif = tarification.prixPour(produit, ctx, quantite);
        prix = tarif.unit_price;
      } else if (s.unit_price !== undefined) {
        tarif = { base_unit_price: s.unit_price, discount_percent: 0 };
      }
      let changement = 'inchangee';
      if (quantite !== Number(ligne.quantity)) changement = 'quantite_modifiee';
      else if (prix !== Number(ligne.unit_price)) changement = 'prix_modifie';
      modifiees.set(s.line_no, {
        ...ligne,
        ...recalculer(ligne, { quantite, prixUnitaire: prix }),
        base_unit_price: tarif.base_unit_price,
        discount_percent: tarif.discount_percent,
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
    if (cote === 'acheteur') {
      if (produit.availability === 'rupture') erreurs.push(`${libelle} : « ${produit.name} » est indisponible chez le fournisseur`);
      erreurs.push(...erreursQuantite(produit, s.quantity, libelle));
    }
    ajoutees.push({
      ...ligneDepuisProduit(produit, {
        quantite: s.quantity, tarif: tarification.prixPour(produit, ctx, s.quantity), prixUnitaire: s.unit_price ?? null, commentaire: s.comment || null,
      }),
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
  'line_no', 'product_id', 'reference', 'name', 'unit', 'quantity', 'unit_price', 'base_unit_price', 'discount_percent', 'tax_rate',
  'line_subtotal', 'line_tax', 'line_total', 'change_type', 'original_quantity', 'original_unit_price', 'substitute_for_line_no', 'comment',
];
const copier = (ligne) => Object.fromEntries(CHAMPS_LIGNE.map((c) => [c, ligne[c] ?? (c === 'discount_percent' ? 0 : null)]));

/**
 * Crée une version et ses lignes ; met à jour les totaux de la commande.
 * @returns {Promise<object>} la version créée
 */
async function creerVersion(t, commande, {
  numero, cote, auteur, statut, commentaire = null, lignes,
}) {
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
  produitsDuFournisseur, resoudreReferences, lignesAcheteur, lignesModifiees, creerVersion, remplacerLignes, copier, erreursQuantite,
};
