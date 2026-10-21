'use strict';

const { Joi } = require('../../../validations/common.js');
const { codes, TYPE_MODELE_DOCUMENT, STATUT_MODELE_DOCUMENT } = require('../../../config/enums.js');

const type = Joi.string().valid(...codes(TYPE_MODELE_DOCUMENT));

/** Champs multipart (chaînes converties par Joi : « true » → true, « 80 » → 80). */
const creationSchema = Joi.object({
  type: type.required(),
  name: Joi.string().trim().min(2).max(120),
  accent_color: Joi.string().trim().pattern(/^#[0-9A-Fa-f]{6}$/).messages({ 'string.pattern.base': '{{#label}} : couleur au format #RRGGBB' }),
  header_text: Joi.string().trim().max(1000).allow('', null),
  footer_text: Joi.string().trim().max(500).allow('', null),
  legal_mentions: Joi.string().trim().max(1000).allow('', null),
  show_logo: Joi.boolean(),
  // Zones laissées libres pour l'en-tête et le pied imprimés sur le papier (points PDF).
  margin_top: Joi.number().integer().min(20).max(300),
  margin_bottom: Joi.number().integer().min(20).max(300),
  keep_background: Joi.boolean(),
});

const listeSchema = Joi.object({
  type,
  status: Joi.string().valid(...codes(STATUT_MODELE_DOCUMENT)),
});

module.exports = { creationSchema, listeSchema };
