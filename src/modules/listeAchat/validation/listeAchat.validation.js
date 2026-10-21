'use strict';

const {
  Joi, uuid, tri, pagination,
} = require('../../../validations/common.js');
const { quantite } = require('../../catalogue/validation/catalogue.validation.js');
const { creationSchema: commandeSchema } = require('../../commande/validation/commande.validation.js');

const MAX_PRODUITS = 300;

/** Produit de la liste : quantité par défaut et/ou stock cible. */
const item = Joi.object({
  product_id: uuid,
  reference: Joi.string().trim().min(1).max(60),
  quantity: quantite.greater(0).allow(null),
  par_level: quantite.greater(0).allow(null),
}).xor('product_id', 'reference')
  .or('quantity', 'par_level')
  .messages({
    'object.xor': 'Chaque produit est désigné par product_id OU par reference',
    'object.missing': 'Chaque produit porte une quantité par défaut (quantity) ou un stock cible (par_level)',
  });

const creationSchema = Joi.object({
  supplier_id: uuid.required(),
  name: Joi.string().trim().min(1).max(100).required(),
  notes: Joi.string().trim().max(2000).allow('', null),
  // Liste construite à partir d'une commande passée, OU produit par produit.
  from_order_id: uuid,
  items: Joi.array().items(item).max(MAX_PRODUITS),
}).oxor('from_order_id', 'items');

const modificationSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100),
  notes: Joi.string().trim().max(2000).allow('', null),
  items: Joi.array().items(item).max(MAX_PRODUITS),
}).min(1);

/** En-tête facultatif du bon de commande produit par la liste. */
const enteteCommande = Object.fromEntries(['buyer_reference', 'delivery_address', 'requested_delivery_date', 'conditions']
  .map((c) => [c, commandeSchema.extract(c)]));

const commandeListeSchema = Joi.object({
  stocks: Joi.array().items(Joi.object({ product_id: uuid.required(), on_hand: quantite.required() })).max(MAX_PRODUITS).unique('product_id'),
  lines: Joi.array().items(Joi.object({ product_id: uuid.required(), quantity: quantite.required() })).max(MAX_PRODUITS).unique('product_id'),
  ...enteteCommande,
});

const listeSchema = Joi.object({
  ...pagination,
  supplier_id: uuid,
  tri: tri(['name', 'created_at', 'last_ordered_at']),
});

module.exports = {
  creationSchema, modificationSchema, commandeListeSchema, listeSchema,
};
