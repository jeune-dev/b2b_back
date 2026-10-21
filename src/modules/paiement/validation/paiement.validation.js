'use strict';

const {
  Joi, uuid, montantPositif, dateIso, recherche, tri, pagination,
} = require('../../../validations/common.js');
const { codes, MODE_PAIEMENT, STATUT_PAIEMENT } = require('../../../config/enums.js');
const { aujourdhui } = require('../../../utils/dates.js');

const imputations = Joi.array().items(Joi.object({
  invoice_id: uuid.required(),
  amount: montantPositif.required(),
})).max(200).unique('invoice_id');

const enregistrementSchema = Joi.object({
  partnership_id: uuid.required(),
  amount: montantPositif.required(),
  method: Joi.string().valid(...codes(MODE_PAIEMENT)).required(),
  // Un paiement ne peut pas être daté dans le futur.
  paid_on: dateIso.required().custom((v, aide) => (v <= aujourdhui() ? v : aide.message('{{#label}} ne peut pas être dans le futur'))),
  external_reference: Joi.string().trim().max(100).allow('', null),
  note: Joi.string().trim().max(2000).allow('', null),
  // Fournisseur : factures à solder (sinon, les plus anciennes d'abord).
  allocations: imputations,
});

const confirmationSchema = Joi.object({ allocations: imputations });

const motifSchema = Joi.object({ reason: Joi.string().trim().min(3).max(1000).required() });

const listeSchema = Joi.object({
  ...pagination,
  sens: Joi.string().valid('recus', 'effectues'),
  status: Joi.string().valid(...codes(STATUT_PAIEMENT)),
  method: Joi.string().valid(...codes(MODE_PAIEMENT)),
  partner_id: uuid,
  partnership_id: uuid,
  q: recherche,
  du: dateIso,
  au: dateIso,
  modifie_depuis: Joi.date().iso(),
  tri: tri(['paid_on', 'amount', 'created_at']),
});

module.exports = { enregistrementSchema, confirmationSchema, motifSchema, listeSchema };
