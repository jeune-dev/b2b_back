'use strict';

const { Joi, uuid, pagination } = require('../../../validations/common.js');
const { ENTITE_DOCUMENT, codes } = require('../../../config/enums.js');

const listeSchema = Joi.object({
  ...pagination,
  entity_type: Joi.string().valid(...codes(ENTITE_DOCUMENT)),
  entity_id: uuid,
}).and('entity_type', 'entity_id');

const fichierSchema = Joi.object({
  taille: Joi.string().valid('miniature', 'originale'),
});

/** Champs multipart d'une pièce jointe (commande, paiement…). */
const pieceJointeSchema = Joi.object({
  description: Joi.string().trim().max(255).allow('', null),
});

module.exports = { listeSchema, fichierSchema, pieceJointeSchema };
