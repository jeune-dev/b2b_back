'use strict';

const Joi = require('joi');

/**
 * Paramètres CONFIGURABLES.
 *
 * Deux niveaux :
 *   - par entreprise (`companies.settings`) : préfixes de numérotation, délai
 *     de paiement par défaut, acceptation automatique des partenariats,
 *     rappels d'échéance ;
 *   - plateforme (`platform_settings`, super admin) : essai, invitations,
 *     OTP, expiration des demandes de paiement d'abonnement.
 */

const DEFAUTS_ENTREPRISE = Object.freeze({
  // § 9.1 — numéro de commande lisible : BC-2026-00001.
  order_prefix: 'BC',
  // § 14 — numéro de facture : FAC-2026-00001.
  invoice_prefix: 'FAC',
  // § 16 — délai de paiement accordé par défaut à un nouveau client (jours).
  default_payment_terms_days: 30,
  // § 7 — un fournisseur peut accepter automatiquement les demandes de partenariat.
  auto_accept_partnerships: false,
  // § 17 « échéance ou montant dû » — rappel N jours avant l'échéance d'une facture.
  invoice_reminder_days_before: 3,
  // Conditions générales reprises sur chaque bon de commande émis.
  default_order_conditions: null,
});

const schemaParametresEntreprise = Joi.object({
  order_prefix: Joi.string().trim().uppercase().pattern(/^[A-Z][A-Z0-9]{0,7}$/)
    .messages({ 'string.pattern.base': '{{#label}} : 1 à 8 lettres majuscules ou chiffres, commençant par une lettre' }),
  invoice_prefix: Joi.string().trim().uppercase().pattern(/^[A-Z][A-Z0-9]{0,7}$/)
    .messages({ 'string.pattern.base': '{{#label}} : 1 à 8 lettres majuscules ou chiffres, commençant par une lettre' }),
  default_payment_terms_days: Joi.number().integer().min(0).max(365),
  auto_accept_partnerships: Joi.boolean(),
  invoice_reminder_days_before: Joi.number().integer().min(0).max(60),
  default_order_conditions: Joi.string().trim().max(2000).allow('', null),
});

/** Paramètres effectifs d'une entreprise (défauts + surcharges). */
function parametresEntreprise(company) {
  return { ...DEFAUTS_ENTREPRISE, ...(company?.settings || {}) };
}

const DEFAUTS_PLATEFORME = Object.freeze({
  essai: { plan_code: 'BUSINESS', duree_jours: 30 },
  invitation: { duree_jours: 7 },
  otp: { duree_minutes: 15, tentatives_max: 5 },
  paiement: { expiration_minutes: 30 },
});

const SCHEMAS_PLATEFORME = Object.freeze({
  essai: Joi.object({ plan_code: Joi.string().trim().max(30).required(), duree_jours: Joi.number().integer().min(0).max(90).required() }),
  invitation: Joi.object({ duree_jours: Joi.number().integer().min(1).max(30).required() }),
  otp: Joi.object({ duree_minutes: Joi.number().integer().min(5).max(60).required(), tentatives_max: Joi.number().integer().min(3).max(10).required() }),
  paiement: Joi.object({ expiration_minutes: Joi.number().integer().min(5).max(1440).required() }),
});

module.exports = {
  DEFAUTS_ENTREPRISE, schemaParametresEntreprise, parametresEntreprise,
  DEFAUTS_PLATEFORME, SCHEMAS_PLATEFORME,
};
