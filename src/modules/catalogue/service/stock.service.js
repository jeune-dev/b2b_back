'use strict';

const { Op } = require('sequelize');
const sequelize = require('../../../config/db.js');
const {
  Product, StockMovement, User, Company,
} = require('../../../models/index.js');
const { P } = require('../../../config/permissions.js');
const { parametresEntreprise } = require('../../../config/parametres.js');
const { ConflictError, ValidationError } = require('../../../errors/AppError.js');
const { chargerPourEntreprise } = require('../../../utils/acces.js');
const { formatQuantite } = require('../../../utils/montants.js');
const { journaliser } = require('../../audit/service/audit.service.js');
const { notifierEntreprise } = require('../../notification/service/notification.service.js');

/**
 * Stock du fournisseur (produits SUIVIS en stock : `stock_quantity` non nul).
 *
 *   disponible = stock physique − stock réservé
 *
 *   - RÉSERVATION à la validation d'une commande (§ 11) : la quantité validée
 *     est mise de côté ; une validation au-delà du disponible est refusée
 *     (409 STOCK_INSUFFISANT) — le fournisseur propose alors une quantité
 *     réduite (§ 10) ;
 *   - SORTIE à la livraison : stock physique et réservation diminuent ;
 *   - LIBÉRATION à l'annulation ou quand le reliquat est soldé ;
 *   - ENTRÉE, AJUSTEMENT d'inventaire, RETOUR client (litige accepté).
 * Chaque variation laisse un mouvement (historique) ; la disponibilité
 * affichée aux clients suit le stock (rupture, stock limité) et une alerte
 * de stock bas prévient le fournisseur une fois par franchissement du seuil.
 */

const q = (v) => Math.round(Number(v || 0) * 1000) / 1000;
const estSuivi = (produit) => produit.stock_quantity !== null && produit.stock_quantity !== undefined;
const disponible = (produit) => q(Number(produit.stock_quantity) - Number(produit.stock_reserved));

/** Disponibilité affichée déduite du stock (« sur commande » reste un choix du fournisseur). */
function disponibiliteDeduite(produit) {
  if (!estSuivi(produit) || produit.availability === 'sur_commande') return produit.availability;
  const dispo = disponible(produit);
  if (dispo <= 0) return 'rupture';
  const seuil = produit.low_stock_threshold === null ? null : Number(produit.low_stock_threshold);
  if (seuil !== null && dispo <= seuil) return 'stock_limite';
  // Au-dessus du seuil : une rupture (ou un « stock limité » posé par le seuil) est levée.
  if (produit.availability === 'rupture') return 'disponible';
  if (produit.availability === 'stock_limite' && seuil !== null) return 'disponible';
  return produit.availability;
}

/**
 * Après une variation : disponibilité recalculée, alerte de stock bas (une
 * fois par franchissement du seuil), dans la transaction.
 */
async function apresVariation(t, produit) {
  const champs = {};
  const dispo = disponibiliteDeduite(produit);
  if (dispo !== produit.availability) champs.availability = dispo;
  const seuil = produit.low_stock_threshold === null ? null : Number(produit.low_stock_threshold);
  const bas = estSuivi(produit) && seuil !== null && disponible(produit) <= seuil;
  if (bas && !produit.low_stock_notified_at) {
    champs.low_stock_notified_at = new Date();
    const company = await Company.findByPk(produit.company_id, { attributes: ['settings'], transaction: t });
    if (parametresEntreprise(company).low_stock_alerts) {
      await notifierEntreprise(t, produit.company_id, P.PRODUITS_GERER, {
        type: 'stock_bas',
        titre: `Stock bas — ${produit.name}`,
        corps: `Il reste ${formatQuantite(disponible(produit))} disponible(s) pour « ${produit.name} » (${produit.reference}), seuil d'alerte ${formatQuantite(seuil)}.`,
        donnees: { product_id: produit.id },
      });
    }
  } else if (!bas && produit.low_stock_notified_at) {
    champs.low_stock_notified_at = null;
  }
  if (Object.keys(champs).length) await produit.update(champs, { transaction: t });
}

async function tracer(t, produit, { type, quantite, orderId = null, note = null, userId = null }) {
  await StockMovement.create({
    company_id: produit.company_id,
    product_id: produit.id,
    type,
    quantity: quantite,
    stock_after: produit.stock_quantity,
    reserved_after: produit.stock_reserved,
    order_id: orderId,
    note,
    created_by: userId,
  }, { transaction: t });
}

/** Produits verrouillés dans l'ordre des identifiants (pas d'interblocage entre deux commandes). */
async function verrouiller(t, ids) {
  const uniques = [...new Set(ids.filter(Boolean))].sort();
  if (!uniques.length) return new Map();
  const produits = await Product.findAll({
    where: { id: { [Op.in]: uniques } }, order: [['id', 'ASC']], lock: t.LOCK.UPDATE, transaction: t, paranoid: false,
  });
  return new Map(produits.map((p) => [p.id, p]));
}

/**
 * Réserve les quantités des lignes validées (produits suivis seulement).
 * @param {Array<object>} lignes  instances OrderLine de la version validée
 */
async function reserver(t, commande, lignes, user) {
  const produits = await verrouiller(t, lignes.map((l) => l.product_id));
  const manques = [];
  for (const l of lignes) {
    const p = produits.get(l.product_id);
    if (p && estSuivi(p) && Number(l.quantity) > 0 && Number(l.quantity) > disponible(p)) {
      manques.push({ line_no: l.line_no, name: l.name, demande: Number(l.quantity), disponible: Math.max(0, disponible(p)) });
    }
  }
  if (manques.length) {
    throw new ConflictError(
      `Stock insuffisant : ${manques.map((m) => `« ${m.name} » (${formatQuantite(m.disponible)} disponible(s) pour ${formatQuantite(m.demande)} demandé(s))`).join(', ')}. Le fournisseur doit proposer une quantité réduite.`,
      'STOCK_INSUFFISANT',
      { lignes: manques }
    );
  }
  for (const l of lignes) {
    const p = produits.get(l.product_id);
    if (!p || !estSuivi(p) || Number(l.quantity) <= 0) continue;
    await p.update({ stock_reserved: q(Number(p.stock_reserved) + Number(l.quantity)) }, { transaction: t });
    await l.update({ stock_reserved: Number(l.quantity) }, { transaction: t });
    await tracer(t, p, { type: 'reservation', quantite: Number(l.quantity), orderId: commande.id, userId: user?.id, note: commande.number });
    await apresVariation(t, p);
  }
}

/** Libère ce qui reste réservé sur les lignes (annulation, reliquat soldé). */
async function liberer(t, commande, lignes, user, note) {
  const aLiberer = lignes.filter((l) => Number(l.stock_reserved) > 0);
  const produits = await verrouiller(t, aLiberer.map((l) => l.product_id));
  for (const l of aLiberer) {
    const p = produits.get(l.product_id);
    const quantite = Number(l.stock_reserved);
    await l.update({ stock_reserved: 0 }, { transaction: t });
    if (!p) continue;
    await p.update({ stock_reserved: q(Math.max(0, Number(p.stock_reserved) - quantite)) }, { transaction: t });
    await tracer(t, p, { type: 'liberation', quantite: -quantite, orderId: commande.id, userId: user?.id, note });
    await apresVariation(t, p);
  }
}

/**
 * Sortie de stock à la livraison.
 * @param {Array<{ ligne: object, quantite: number }>} sorties  ligne = OrderLine validée
 */
async function sortir(t, commande, sorties, user, note) {
  const produits = await verrouiller(t, sorties.map((s) => s.ligne.product_id));
  const manques = [];
  for (const { ligne, quantite } of sorties) {
    const p = produits.get(ligne.product_id);
    if (p && estSuivi(p) && quantite > Number(p.stock_quantity)) manques.push(`« ${p.name} » : ${formatQuantite(p.stock_quantity)} en stock pour ${formatQuantite(quantite)} livré(s)`);
  }
  if (manques.length) {
    throw new ConflictError(`Stock physique insuffisant pour cette livraison — ${manques.join(', ')}. Corrigez d'abord le stock (entrée ou inventaire).`, 'STOCK_INSUFFISANT');
  }
  for (const { ligne, quantite } of sorties) {
    const p = produits.get(ligne.product_id);
    const consommee = Math.min(Number(ligne.stock_reserved), quantite);
    if (consommee > 0) await ligne.update({ stock_reserved: q(Number(ligne.stock_reserved) - consommee) }, { transaction: t });
    if (!p || !estSuivi(p)) continue;
    await p.update({
      stock_quantity: q(Number(p.stock_quantity) - quantite),
      stock_reserved: q(Math.max(0, Number(p.stock_reserved) - consommee)),
    }, { transaction: t });
    await tracer(t, p, { type: 'sortie', quantite: -quantite, orderId: commande.id, userId: user?.id, note });
    await apresVariation(t, p);
  }
}

/** Retour en stock de marchandises reprises (litige accepté avec retour). */
async function retourner(t, retours, user, { orderId, note }) {
  const produits = await verrouiller(t, retours.map((r) => r.productId));
  for (const { productId, quantite } of retours) {
    const p = produits.get(productId);
    if (!p || !estSuivi(p)) continue;
    await p.update({ stock_quantity: q(Number(p.stock_quantity) + quantite) }, { transaction: t });
    await tracer(t, p, { type: 'retour', quantite, orderId, userId: user?.id, note });
    await apresVariation(t, p);
  }
}

/**
 * Entrée en stock ou inventaire, par le fournisseur.
 *   - `entree` : `quantity` ajoutée (démarre le suivi si le produit n'était pas suivi) ;
 *   - `ajustement` : `stock_quantity` = quantité constatée à l'inventaire.
 */
async function ajuster(id, companyId, user, { type, quantity = null, stock_quantity: constate = null, note = null }) {
  return sequelize.transaction(async (t) => {
    const produit = await chargerPourEntreprise(Product, id, companyId, { transaction: t, lock: t.LOCK.UPDATE }, 'Produit');
    const actuel = estSuivi(produit) ? Number(produit.stock_quantity) : 0;
    const nouveau = type === 'entree' ? q(actuel + quantity) : q(constate);
    if (nouveau < Number(produit.stock_reserved)) {
      throw new ValidationError('Données invalides', [`Le stock ne peut pas descendre sous la quantité réservée par les commandes validées (${formatQuantite(produit.stock_reserved)})`], 'STOCK_SOUS_RESERVE');
    }
    const variation = q(nouveau - actuel);
    if (variation === 0 && estSuivi(produit)) throw new ConflictError('Le stock est déjà à cette valeur.', 'STATUT_INCHANGE');
    await produit.update({ stock_quantity: nouveau }, { transaction: t });
    if (variation !== 0) await tracer(t, produit, { type, quantite: variation, userId: user.id, note });
    await apresVariation(t, produit);
    await journaliser({ action: 'produit.mouvement_stock', entityType: 'product', entityId: id, companyId, details: { type, variation, stock: nouveau } }, t);
    return produit;
  });
}

/**
 * Le suivi de stock d'un produit change par la fiche produit (stock_quantity
 * saisi ou retiré) : la variation est tracée comme un ajustement.
 */
async function tracerChangementFiche(t, produit, avant, user) {
  const apres = estSuivi(produit) ? Number(produit.stock_quantity) : null;
  if (apres === avant) return;
  if (apres === null) {
    if (Number(produit.stock_reserved) > 0) {
      throw new ConflictError('Des commandes validées réservent ce produit : le suivi de stock ne peut pas être arrêté.', 'STOCK_RESERVE');
    }
    return;
  }
  if (apres < Number(produit.stock_reserved)) {
    throw new ValidationError('Données invalides', [`Le stock ne peut pas descendre sous la quantité réservée (${formatQuantite(produit.stock_reserved)})`], 'STOCK_SOUS_RESERVE');
  }
  const variation = q(apres - (avant ?? 0));
  if (variation !== 0) await tracer(t, produit, { type: 'ajustement', quantite: variation, userId: user?.id, note: 'Fiche produit' });
}

async function mouvements(id, companyId, { limit, offset }) {
  await chargerPourEntreprise(Product, id, companyId, { attributes: ['id', 'company_id'] }, 'Produit');
  const { rows, count } = await StockMovement.findAndCountAll({
    where: { product_id: id },
    include: [{ model: User, as: 'author', attributes: ['id', 'first_name', 'last_name'], paranoid: false }],
    order: [['created_at', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
  });
  return { rows, count };
}

/** Produits suivis en rupture ou sous leur seuil d'alerte. */
async function alertes(companyId) {
  const produits = await Product.findAll({
    where: {
      company_id: companyId,
      stock_quantity: { [Op.ne]: null },
      [Op.or]: [
        sequelize.literal('"Product"."stock_quantity" - "Product"."stock_reserved" <= 0'),
        sequelize.literal('"Product"."low_stock_threshold" IS NOT NULL AND "Product"."stock_quantity" - "Product"."stock_reserved" <= "Product"."low_stock_threshold"'),
      ],
    },
    attributes: ['id', 'reference', 'name', 'unit', 'stock_quantity', 'stock_reserved', 'low_stock_threshold', 'availability', 'is_active'],
    order: [['name', 'ASC']],
  });
  return produits.map((p) => ({ ...p.toJSON(), available_quantity: disponible(p) }));
}

module.exports = {
  estSuivi, disponible, disponibiliteDeduite, reserver, liberer, sortir, retourner, ajuster, tracerChangementFiche,
  mouvements, alertes, apresVariation,
};
