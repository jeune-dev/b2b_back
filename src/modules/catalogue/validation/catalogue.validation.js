'use strict';

const {
  Joi, uuid, montant, recherche, tri, pagination,
} = require('../../../validations/common.js');
const { codes, UNITE, DISPONIBILITE } = require('../../../config/enums.js');

/** Quantité : jusqu'à 3 décimales (2,5 kg), bornée. */
const quantite = Joi.number().min(0).max(1_000_000_000).precision(3);
const tauxTva = Joi.number().min(0).max(100).precision(2);

const champs = {
  category_id: uuid.allow(null),
  reference: Joi.string().trim().min(1).max(60).pattern(/^[\w./ -]+$/u)
    .messages({ 'string.pattern.base': '{{#label}} : lettres, chiffres, espaces et - _ . / uniquement' }),
  name: Joi.string().trim().min(1).max(200),
  description: Joi.string().trim().max(5000).allow('', null),
  unit: Joi.string().valid(...codes(UNITE)),
  packaging: Joi.string().trim().max(100).allow('', null),
  price: montant,
  tax_rate: tauxTva,
  availability: Joi.string().valid(...codes(DISPONIBILITE)),
  stock_quantity: quantite.allow(null),
  min_order_quantity: quantite.greater(0),
  // Quantité commandée par multiples de (carton de 12…), quantité maximale par commande.
  order_multiple: quantite.greater(0).allow(null),
  max_order_quantity: quantite.greater(0).allow(null),
  low_stock_threshold: quantite.allow(null),
  // Remises par paliers : la liste fournie remplace les paliers existants.
  price_tiers: Joi.array().items(Joi.object({
    min_quantity: quantite.greater(0).required(),
    discount_percent: Joi.number().greater(0).less(100).precision(2).required(),
  })).max(10).unique('min_quantity'),
};

/** Quantité maximale ≥ quantité minimale quand les deux sont fournies. */
const bornesQuantite = (valeur, aide) => {
  if (valeur.max_order_quantity && valeur.min_order_quantity && valeur.max_order_quantity < valeur.min_order_quantity) {
    return aide.message('max_order_quantity doit être supérieure ou égale à min_order_quantity');
  }
  return valeur;
};

const creationSchema = Joi.object({
  ...champs,
  reference: champs.reference.required(),
  name: champs.name.required(),
  unit: champs.unit.required(),
  price: champs.price.required(),
}).custom(bornesQuantite);

const modificationSchema = Joi.object(champs).min(1).custom(bornesQuantite);
const prixSchema = Joi.object({ price: montant.required(), tax_rate: tauxTva, price_tiers: champs.price_tiers });

/** Champs texte du multipart d'import (« simulation » : vérifier sans écrire). */
const importSchema = Joi.object({ simulation: Joi.boolean().default(false) });

/** Liste de prix : prix propres par produit et remise globale. */
const prixListe = Joi.array().items(Joi.object({ product_id: uuid.required(), price: montant.required() })).max(5000).unique('product_id');
const listePrixSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  description: Joi.string().trim().max(1000).allow('', null),
  discount_percent: Joi.number().min(0).less(100).precision(2),
  is_active: Joi.boolean(),
  items: prixListe,
});
const listePrixModificationSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100),
  description: Joi.string().trim().max(1000).allow('', null),
  discount_percent: Joi.number().min(0).less(100).precision(2),
  is_active: Joi.boolean(),
  items: prixListe,
}).min(1);
const disponibiliteSchema = Joi.object({ availability: champs.availability.required(), stock_quantity: quantite.allow(null) });

/** Entrée en stock (quantité ajoutée) ou inventaire (stock constaté). */
const stockSchema = Joi.object({
  type: Joi.string().valid('entree', 'ajustement').required(),
  quantity: Joi.when('type', { is: 'entree', then: quantite.greater(0).required(), otherwise: Joi.forbidden() }),
  stock_quantity: Joi.when('type', { is: 'ajustement', then: quantite.required(), otherwise: Joi.forbidden() }),
  note: Joi.string().trim().max(500).allow('', null),
});
const mouvementsSchema = Joi.object(pagination);

const filtres = {
  ...pagination,
  q: recherche,
  category_id: uuid,
  availability: Joi.string().valid(...codes(DISPONIBILITE)),
  tri: tri(['name', 'reference', 'price', 'created_at', 'updated_at']),
};

const listeSchema = Joi.object({ ...filtres, is_active: Joi.boolean() });
const listeAcheteurSchema = Joi.object(filtres);

const categorieSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  sort_order: Joi.number().integer().min(0).max(10000),
});
const categorieModificationSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100),
  sort_order: Joi.number().integer().min(0).max(10000),
}).min(1);

const fournisseurParam = Joi.object({ supplierId: uuid.required() });
const produitFournisseurParam = Joi.object({ supplierId: uuid.required(), id: uuid.required() });

module.exports = {
  creationSchema, modificationSchema, prixSchema, disponibiliteSchema, listeSchema, listeAcheteurSchema,
  categorieSchema, categorieModificationSchema, fournisseurParam, produitFournisseurParam, quantite, tauxTva,
  stockSchema, mouvementsSchema, importSchema, listePrixSchema, listePrixModificationSchema,
};
