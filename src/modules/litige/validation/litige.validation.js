'use strict';

const {
  Joi, uuid, tri, pagination,
} = require('../../../validations/common.js');
const { codes, TYPE_LITIGE, STATUT_LITIGE } = require('../../../config/enums.js');
const { quantite } = require('../../catalogue/validation/catalogue.validation.js');

const ouvertureSchema = Joi.object({
  order_id: uuid.required(),
  delivery_id: uuid.allow(null),
  type: Joi.string().valid(...codes(TYPE_LITIGE)).required(),
  description: Joi.string().trim().min(5).max(2000).required(),
  // Lignes de la commande validée concernées et quantités en litige.
  lines: Joi.array().items(Joi.object({
    line_no: Joi.number().integer().min(1).required(),
    quantity: quantite.greater(0).required(),
    comment: Joi.string().trim().max(500).allow('', null),
  })).min(1).max(500).unique('line_no').required(),
});

const acceptationSchema = Joi.object({
  response: Joi.string().trim().max(2000).allow('', null),
  // La marchandise est reprise : retour en stock (produits suivis en stock).
  restock: Joi.boolean().default(false),
});

const refusSchema = Joi.object({ response: Joi.string().trim().min(3).max(2000).required() });
const annulationSchema = Joi.object({ reason: Joi.string().trim().max(1000).allow('', null) });

const listeSchema = Joi.object({
  ...pagination,
  sens: Joi.string().valid('ouverts_par_moi', 'recus'),
  status: Joi.string().valid(...codes(STATUT_LITIGE)),
  order_id: uuid,
  tri: tri(['created_at', 'total', 'number']),
});

module.exports = {
  ouvertureSchema, acceptationSchema, refusSchema, annulationSchema, listeSchema,
};
