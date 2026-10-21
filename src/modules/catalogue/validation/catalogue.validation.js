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
};

const creationSchema = Joi.object({
  ...champs,
  reference: champs.reference.required(),
  name: champs.name.required(),
  unit: champs.unit.required(),
  price: champs.price.required(),
});

const modificationSchema = Joi.object(champs).min(1);
const prixSchema = Joi.object({ price: montant.required(), tax_rate: tauxTva });
const disponibiliteSchema = Joi.object({ availability: champs.availability.required(), stock_quantity: quantite.allow(null) });

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
};
