'use strict';

const {
  Joi, uuid, dateIso, recherche, tri, pagination, montant, jsonOuTableau,
} = require('../../../validations/common.js');
const { quantite } = require('../../catalogue/validation/catalogue.validation.js');
const { codes, STATUT_FACTURE } = require('../../../config/enums.js');

const statuts = codes(STATUT_FACTURE).join('|');

const listeSchema = Joi.object({
  ...pagination,
  sens: Joi.string().valid('emises', 'recues'),
  status: Joi.string().trim().max(200).pattern(new RegExp(`^(${statuts})(,(${statuts}))*$`))
    .messages({ 'string.pattern.base': '{{#label}} : un ou plusieurs statuts de facture séparés par des virgules' }),
  partner_id: uuid,
  impayees: Joi.boolean(),
  // Factures bloquées par un écart de rapprochement.
  bloquees: Joi.boolean(),
  q: recherche,
  du: dateIso,
  au: dateIso,
  modifie_depuis: Joi.date().iso(),
  tri: tri(['issue_date', 'due_date', 'total', 'number', 'created_at']),
});

/** JSON ou champs multipart (chaînes converties par Joi). */
const emissionSchema = Joi.object({
  order_id: uuid.required(),
  issue_date: dateIso,
  // Par défaut : date de facture + délai de paiement du partenariat.
  due_date: dateIso,
  note: Joi.string().trim().max(2000).allow('', null),
  revision: Joi.number().integer().min(1),
  // Quantités / prix effectivement facturés, par ligne de la commande validée
  // (par défaut : quantités reçues aux prix validés). Rapprochés de la commande.
  lines: jsonOuTableau(Joi.array().items(Joi.object({
    line_no: Joi.number().integer().min(1).required(),
    quantity: quantite,
    unit_price: montant,
  }).or('quantity', 'unit_price')).min(1).max(500).unique('line_no')),
  // Facture transmise : total TTC imprimé sur le document du fournisseur.
  declared_total: montant,
});

const ecartSchema = Joi.object({ comment: Joi.string().trim().max(1000).allow('', null) });
const contestationSchema = Joi.object({ comment: Joi.string().trim().min(3).max(1000).required() });

const annulationSchema = Joi.object({ reason: Joi.string().trim().min(3).max(1000).required() });

module.exports = {
  listeSchema, emissionSchema, annulationSchema, ecartSchema, contestationSchema,
};
