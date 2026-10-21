'use strict';

const { Op } = require('sequelize');
const {
  Partnership, PriceList, PriceListItem, ProductPriceTier,
} = require('../../../models/index.js');

/**
 * Prix effectif d'un produit pour UN client, calculé côté serveur — jamais
 * reçu du client :
 *
 *   1. prix de BASE du catalogue (HT) ;
 *   2. LISTE DE PRIX affectée au partenariat (tarif propre à ce client ou à
 *      un groupe de clients) : prix propre du produit dans la liste, sinon
 *      remise globale de la liste ;
 *   3. REMISE PAR PALIER de quantité : la plus forte remise dont le seuil est
 *      atteint, appliquée au prix issu de 1 et 2.
 *
 * Les montants restent des FCFA entiers (arrondi au franc le plus proche).
 */

const appliquerRemise = (prix, pourcentage) => (pourcentage
  ? Math.round((Number(prix) * (10000 - Math.round(Number(pourcentage) * 100))) / 10000)
  : Number(prix));

/**
 * Contexte de tarification d'un couple acheteur / fournisseur pour un
 * ensemble de produits, en TROIS requêtes au plus (jamais une par produit).
 * @returns {Promise<{ liste: object|null, prixListe: Map<string, number>, paliers: Map<string, Array<{ min: number, remise: number }>> }>}
 */
async function contexte(supplierId, buyerId, produitIds, transaction) {
  const ids = [...new Set(produitIds.filter(Boolean))];
  const partenariat = buyerId
    ? await Partnership.findOne({ where: { buyer_company_id: buyerId, supplier_company_id: supplierId }, attributes: ['price_list_id'], transaction })
    : null;
  let liste = null;
  if (partenariat?.price_list_id) {
    liste = await PriceList.findOne({ where: { id: partenariat.price_list_id, is_active: true }, attributes: ['id', 'name', 'discount_percent'], transaction });
  }
  const [prix, paliers] = await Promise.all([
    liste && ids.length
      ? PriceListItem.findAll({ where: { price_list_id: liste.id, product_id: { [Op.in]: ids } }, attributes: ['product_id', 'price'], transaction })
      : [],
    ids.length
      ? ProductPriceTier.findAll({ where: { product_id: { [Op.in]: ids } }, attributes: ['product_id', 'min_quantity', 'discount_percent'], order: [['min_quantity', 'DESC']], transaction })
      : [],
  ]);
  const parProduit = new Map();
  for (const p of paliers) {
    if (!parProduit.has(p.product_id)) parProduit.set(p.product_id, []);
    parProduit.get(p.product_id).push({ min: Number(p.min_quantity), remise: Number(p.discount_percent) });
  }
  return {
    liste: liste ? { id: liste.id, name: liste.name, discount_percent: Number(liste.discount_percent) } : null,
    prixListe: new Map(prix.map((i) => [i.product_id, Number(i.price)])),
    paliers: parProduit,
  };
}

/** Prix du client AVANT remise de palier (base ou liste de prix). */
function prixClient(produit, ctx) {
  if (ctx.prixListe.has(produit.id)) return ctx.prixListe.get(produit.id);
  return appliquerRemise(produit.price, ctx.liste?.discount_percent || 0);
}

/** Remise de palier atteinte pour une quantité (0 sans palier). */
function remisePalier(produitId, ctx, quantite) {
  return (ctx.paliers.get(produitId) || []).find((p) => Number(quantite) >= p.min)?.remise || 0;
}

/**
 * Prix unitaire effectif d'un produit pour une quantité.
 * @returns {{ base_unit_price: number, discount_percent: number, unit_price: number }}
 */
function prixPour(produit, ctx, quantite) {
  const base = prixClient(produit, ctx);
  const remise = remisePalier(produit.id, ctx, quantite);
  return { base_unit_price: base, discount_percent: remise, unit_price: appliquerRemise(base, remise) };
}

/**
 * Prix affichés dans le catalogue vu par un client : son prix, le prix
 * catalogue s'il diffère, et les paliers avec le prix unitaire de chacun.
 */
function prixAffiches(produit, ctx) {
  const base = prixClient(produit, ctx);
  const paliers = [...(ctx.paliers.get(produit.id) || [])].sort((a, b) => a.min - b.min);
  return {
    price: base,
    catalog_price: Number(produit.price),
    has_customer_price: base !== Number(produit.price),
    price_tiers: paliers.map((p) => ({ min_quantity: p.min, discount_percent: p.remise, unit_price: appliquerRemise(base, p.remise) })),
  };
}

module.exports = {
  contexte, prixPour, prixAffiches, prixClient, remisePalier, appliquerRemise,
};
