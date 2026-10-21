'use strict';

const {
  Joi, uuid, dateIso, recherche, tri, pagination,
} = require('../../../validations/common.js');
const { codes, STATUT_AVOIR } = require('../../../config/enums.js');
const { quantite } = require('../../catalogue/validation/catalogue.validation.js');

/** Avoir sur une facture : lignes de la facture et quantités créditées. */
const emissionSchema = Joi.object({
  invoice_id: uuid.required(),
  reason: Joi.string().trim().min(3).max(1000).required(),
  lines: Joi.array().items(Joi.object({
    line_no: Joi.number().integer().min(1).required(),
    quantity: quantite.greater(0).required(),
  })).min(1).max(500).unique('line_no').required(),
});

const annulationSchema = Joi.object({ reason: Joi.string().trim().min(3).max(1000).required() });

const listeSchema = Joi.object({
  ...pagination,
  sens: Joi.string().valid('emis', 'recus'),
  status: Joi.string().valid(...codes(STATUT_AVOIR)),
  partner_id: uuid,
  invoice_id: uuid,
  q: recherche,
  du: dateIso,
  au: dateIso,
  tri: tri(['issue_date', 'total', 'number', 'created_at']),
});

module.exports = { emissionSchema, annulationSchema, listeSchema };
