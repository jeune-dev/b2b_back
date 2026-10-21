'use strict';

const {
  Joi, email, telephone, nom, recherche, tri, pagination,
} = require('../../../validations/common.js');
const { codes, ROLES_ENTREPRISE, STATUT_MEMBRE } = require('../../../config/enums.js');

const role = Joi.string().valid(...codes(ROLES_ENTREPRISE));

const listeSchema = Joi.object({
  ...pagination,
  q: recherche,
  role,
  status: Joi.string().valid(...codes(STATUT_MEMBRE)),
  tri: tri(['created_at', 'nom']),
});

const invitationsSchema = Joi.object({
  ...pagination,
  status: Joi.string().valid('en_attente', 'acceptee', 'revoquee', 'expiree'),
});

const invitationSchema = Joi.object({
  email: email.required(),
  first_name: nom.required(),
  last_name: nom.required(),
  phone: telephone.allow(null),
  job_title: Joi.string().trim().max(100).allow('', null),
  role_code: role.required(),
});

const roleSchema = Joi.object({ role_code: role.required() });

const motifSchema = Joi.object({ reason: Joi.string().trim().min(3).max(500).required() });

module.exports = { listeSchema, invitationsSchema, invitationSchema, roleSchema, motifSchema };
