'use strict';

const { Joi, telephone, email, motDePasse, nom } = require('../../../validations/common.js');
const { codes, TYPE_ENTREPRISE, SECTEUR_ACTIVITE, REGIME_FISCAL } = require('../../../config/enums.js');

/**
 * § 6 — informations principales de l'entreprise. Partagées par l'inscription
 * et la modification du profil (module entreprise).
 */
const champsEntreprise = {
  name: Joi.string().trim().min(2).max(150),
  legal_name: Joi.string().trim().max(200).allow('', null),
  type: Joi.string().valid(...codes(TYPE_ENTREPRISE)),
  sector: Joi.string().valid(...codes(SECTEUR_ACTIVITE)).allow(null),
  description: Joi.string().trim().max(2000).allow('', null),
  address: Joi.string().trim().max(255).allow('', null),
  city: Joi.string().trim().max(100).allow('', null),
  country: Joi.string().trim().uppercase().length(2),
  phone: telephone.allow(null),
  email: email.allow(null),
  website: Joi.string().trim().uri({ scheme: ['http', 'https'] }).max(255).allow('', null),
  // NINEA (identifiant national) et RCCM (registre du commerce) : formats
  // variables selon l'ancienneté — bornés, caractères sûrs uniquement.
  ninea: Joi.string().trim().uppercase().pattern(/^[A-Z0-9 ]{5,30}$/).allow(null)
    .messages({ 'string.pattern.base': '{{#label}} : 5 à 30 caractères (lettres, chiffres)' }),
  rccm: Joi.string().trim().uppercase().pattern(/^[A-Z0-9 ./-]{5,60}$/).allow(null)
    .messages({ 'string.pattern.base': '{{#label}} : 5 à 60 caractères (lettres, chiffres, / . -)' }),
  tax_regime: Joi.string().valid(...codes(REGIME_FISCAL)).allow(null),
  vat_registered: Joi.boolean(),
  default_tax_rate: Joi.number().min(0).max(100).precision(2),
  bank_details: Joi.string().trim().max(1000).allow('', null),
  is_listed: Joi.boolean(),
};

// § 26 — création du compte ET de l'entreprise.
const inscriptionSchema = Joi.object({
  first_name: nom.required(),
  last_name: nom.required(),
  email: email.required(),
  phone: telephone,
  job_title: Joi.string().trim().max(100).allow('', null),
  password: motDePasse.required(),
  password_confirmation: Joi.any().valid(Joi.ref('password')).required()
    .messages({ 'any.only': 'La confirmation du mot de passe ne correspond pas' }),
  company: Joi.object({
    ...champsEntreprise,
    name: champsEntreprise.name.required(),
    type: champsEntreprise.type.required(),
  }).required(),
  // Lien d'invitation reçu d'un partenaire (« rejoignez-moi sur Pro2Link »).
  invitation_token: Joi.string().trim().max(200),
  device_name: Joi.string().trim().max(120).allow('', null),
  platform: Joi.string().valid('android', 'ios', 'web').allow(null),
});

// Connexion par téléphone OU e-mail.
const connexionSchema = Joi.object({
  // Borné : une chaîne géante n'atteint jamais la détection e-mail/téléphone.
  identifiant: Joi.string().trim().max(254).required(),
  password: Joi.string().max(128).required(),
  device_name: Joi.string().trim().max(120).allow('', null),
  platform: Joi.string().valid('android', 'ios', 'web').allow(null),
});

const refreshSchema = Joi.object({
  refresh_token: Joi.string().max(2048).allow('', null),
});

const deconnexionSchema = refreshSchema;

// Mot de passe oublié (code à 6 chiffres envoyé par e-mail).
const motDePasseOublieSchema = Joi.object({
  identifiant: Joi.string().trim().max(254).required(),
});

const reinitialisationSchema = Joi.object({
  identifiant: Joi.string().trim().max(254).required(),
  code: Joi.string().trim().pattern(/^\d{6}$/).required().messages({ 'string.pattern.base': 'Le code doit contenir 6 chiffres' }),
  password: motDePasse.required(),
  password_confirmation: Joi.any().valid(Joi.ref('password')).required()
    .messages({ 'any.only': 'La confirmation du mot de passe ne correspond pas' }),
});

// § 5.3 — activation d'un compte collaborateur par lien OU par code + e-mail.
const activationSchema = Joi.object({
  token: Joi.string().trim().max(200),
  code: Joi.string().trim().pattern(/^\d{8}$/).messages({ 'string.pattern.base': "Le code d'activation contient 8 chiffres" }),
  email,
  phone: telephone,
  password: motDePasse.required(),
  password_confirmation: Joi.any().valid(Joi.ref('password')).required()
    .messages({ 'any.only': 'La confirmation du mot de passe ne correspond pas' }),
  device_name: Joi.string().trim().max(120).allow('', null),
  platform: Joi.string().valid('android', 'ios', 'web').allow(null),
})
  .xor('token', 'code')
  .with('code', 'email')
  .messages({ 'object.xor': "Fournissez soit le lien d'activation, soit le code d'activation" });

// Double authentification — seconde étape de la connexion.
const codeTotp = Joi.string().trim().pattern(/^\d{6}$/).messages({ 'string.pattern.base': 'Le code de vérification contient 6 chiffres' });
const codeSecours = Joi.string().trim().max(20);

const mfaSchema = Joi.object({
  mfa_token: Joi.string().max(2048).required(),
  code: codeTotp,
  code_secours: codeSecours,
  device_name: Joi.string().trim().max(120).allow('', null),
  platform: Joi.string().valid('android', 'ios', 'web').allow(null),
}).xor('code', 'code_secours').messages({ 'object.xor': 'Fournissez soit le code de vérification, soit un code de secours' });

module.exports = {
  champsEntreprise, inscriptionSchema, connexionSchema, refreshSchema, deconnexionSchema,
  motDePasseOublieSchema, reinitialisationSchema, activationSchema, mfaSchema, codeTotp, codeSecours,
};
