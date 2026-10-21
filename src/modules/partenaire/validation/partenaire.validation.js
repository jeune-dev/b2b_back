'use strict';

const {
  Joi, uuid, email, dateIso, recherche, tri, pagination,
} = require('../../../validations/common.js');
const {
  codes, RELATION, STATUT_PARTENARIAT, STATUT_INVITATION_PARTENAIRE, SECTEUR_ACTIVITE,
} = require('../../../config/enums.js');

const relation = Joi.string().valid(...codes(RELATION));

const listeSchema = Joi.object({
  ...pagination,
  relation,
  status: Joi.string().valid(...codes(STATUT_PARTENARIAT)),
  q: recherche,
});

// `relation` : ce que l'entreprise ciblée sera pour moi (mon fournisseur ou mon client).
const demandeSchema = Joi.object({
  company_id: uuid.required(),
  relation: relation.required(),
  message: Joi.string().trim().max(1000).allow('', null),
});

const modificationSchema = Joi.object({
  notes: Joi.string().trim().max(5000).allow('', null),
  payment_terms_days: Joi.number().integer().min(0).max(365),
  supplier_customer_code: Joi.string().trim().max(40).allow('', null),
  // Conditions du fournisseur : tarif du client, plafond de crédit, blocage en cas de retard.
  price_list_id: uuid.allow(null),
  credit_limit: Joi.number().integer().min(0).max(1e13).allow(null),
  block_on_overdue: Joi.boolean(),
}).min(1);

const motifSchema = Joi.object({ reason: Joi.string().trim().min(3).max(1000).required() });
const motifFacultatifSchema = Joi.object({ reason: Joi.string().trim().max(1000).allow('', null) });

const invitationsSchema = Joi.object({
  ...pagination,
  status: Joi.string().valid(...codes(STATUT_INVITATION_PARTENAIRE)),
});

// `relation` : rôle de l'entreprise invitée pour moi.
const invitationSchema = Joi.object({
  email: email.required(),
  relation: relation.required(),
  company_name: Joi.string().trim().max(150).allow('', null),
  contact_name: Joi.string().trim().max(160).allow('', null),
  message: Joi.string().trim().max(1000).allow('', null),
});

const annuaireSchema = Joi.object({
  ...pagination,
  q: recherche,
  type: Joi.string().valid('fournisseur', 'acheteur'),
  sector: Joi.string().valid(...codes(SECTEUR_ACTIVITE)),
  city: Joi.string().trim().max(100),
  tri: tri(['name', 'city', 'created_at']),
});

const releveSchema = Joi.object({ du: dateIso, au: dateIso });

module.exports = {
  listeSchema, demandeSchema, modificationSchema, motifSchema, motifFacultatifSchema,
  invitationsSchema, invitationSchema, annuaireSchema, releveSchema,
};
