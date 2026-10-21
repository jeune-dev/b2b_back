'use strict';

const {
  Joi, uuid, email, telephone, nom, montant, dateIso, recherche, tri, pagination,
} = require('../../../validations/common.js');
const {
  codes, STATUT_ENTREPRISE, TYPE_ENTREPRISE, SECTEUR_ACTIVITE, STATUT_ABONNEMENT, STATUT_PAIEMENT_ABONNEMENT,
  STATUT_UTILISATEUR, ROLES, PERIODE_FACTURATION, STATUT_PLAN, FONCTIONNALITE,
} = require('../../../config/enums.js');
const { CIBLES } = require('../service/plateforme.service.js');

/**
 * Schémas Joi de l'administration. Toute entrée est bornée ; les statuts ne
 * sont jamais écrits depuis le corps d'une requête (transitions dédiées).
 */

const codePlan = Joi.string().trim().uppercase().max(30);
const motif = Joi.string().trim().min(3).max(1000);

const companyIdParam = Joi.object({ companyId: uuid.required() });

// ── Entreprises ────────────────────────────────────────────────────────────

const entreprisesSchema = Joi.object({
  ...pagination,
  q: recherche,
  status: Joi.string().valid(...codes(STATUT_ENTREPRISE)),
  type: Joi.string().valid(...codes(TYPE_ENTREPRISE)),
  sector: Joi.string().valid(...codes(SECTEUR_ACTIVITE)),
  plan: codePlan,
  abonnement: Joi.string().valid('essai', 'actif', 'suspendu', 'expire', 'annule', 'aucun'),
  tri: tri(['created_at', 'name']),
});

const motifSchema = Joi.object({ reason: motif.required() });
const motifFacultatifSchema = Joi.object({ reason: motif });

// ── Abonnements et paiements ───────────────────────────────────────────────

const abonnementsSchema = Joi.object({
  ...pagination,
  status: Joi.string().valid(...codes(STATUT_ABONNEMENT)),
  plan: codePlan,
  company_id: uuid,
  fin_avant: dateIso,
  tri: tri(['created_at', 'current_period_end']),
});

const activationSchema = Joi.object({
  plan_code: codePlan.required(),
  months: Joi.number().integer().min(1).max(24).required(),
  note: Joi.string().trim().max(1000).allow('', null),
  // Montant réellement encaissé (remise, geste commercial) ; défaut : prix × mois.
  amount: montant.allow(null),
});

const paiementsSchema = Joi.object({
  ...pagination,
  status: Joi.string().valid(...codes(STATUT_PAIEMENT_ABONNEMENT)),
  provider: Joi.string().valid('paydunya', 'manuel'),
  company_id: uuid,
  du: dateIso,
  au: dateIso,
  tri: tri(['created_at', 'amount']),
});

const statistiquesSchema = Joi.object({ du: dateIso, au: dateIso });

// ── Utilisateurs ───────────────────────────────────────────────────────────

const utilisateursSchema = Joi.object({
  ...pagination,
  q: recherche,
  role: Joi.string().valid(...codes(ROLES)),
  status: Joi.string().valid(...codes(STATUT_UTILISATEUR)),
  verrouille: Joi.boolean(),
  tri: tri(['created_at', 'last_name', 'last_login_at']),
});

const superAdminSchema = Joi.object({
  first_name: nom.required(),
  last_name: nom.required(),
  email: email.required(),
  phone: telephone.allow(null),
  // Politique renforcée vérifiée par le service (validerMotDePasseAdmin).
  password: Joi.string().max(128).required(),
  // Mot de passe de l'administrateur qui crée le compte (ré-authentification).
  current_password: Joi.string().max(128).required(),
});

const reinitialisationAccesSchema = Joi.object({
  current_password: Joi.string().max(128).required(),
  reason: Joi.string().trim().min(3).max(500).required(),
});

// ── Notifications ──────────────────────────────────────────────────────────

const diffusionSchema = Joi.object({
  cible: Joi.string().valid(...Object.keys(CIBLES)).required(),
  titre: Joi.string().trim().min(3).max(150).required(),
  corps: Joi.string().trim().min(3).max(2000).required(),
});

// ── Forfaits ───────────────────────────────────────────────────────────────

const limite = Joi.number().integer().min(1).max(1_000_000).allow(null);
const champsPlan = {
  name: Joi.string().trim().min(1).max(80),
  description: Joi.string().trim().max(2000).allow('', null),
  price: montant,
  currency: Joi.string().trim().uppercase().length(3),
  billing_period: Joi.string().valid(...codes(PERIODE_FACTURATION)),
  max_users: limite,
  max_products: limite,
  max_partners: limite,
  max_orders_per_month: limite,
  features: Joi.array().items(Joi.string().valid(...codes(FONCTIONNALITE))).unique().max(codes(FONCTIONNALITE).length),
  sort_order: Joi.number().integer().min(0).max(10000),
};
const planCreationSchema = Joi.object({
  ...champsPlan,
  code: Joi.string().trim().uppercase().pattern(/^[A-Z][A-Z0-9_]{1,29}$/).required()
    .messages({ 'string.pattern.base': '{{#label}} : lettres majuscules, chiffres et _ (2 à 30 caractères)' }),
  name: champsPlan.name.required(),
  price: champsPlan.price.required(),
  status: Joi.string().valid(...codes(STATUT_PLAN)),
});
const planModificationSchema = Joi.object(champsPlan).min(1);
const plansSchema = Joi.object({ status: Joi.string().valid(...codes(STATUT_PLAN)) });

// ── Journal d'audit ────────────────────────────────────────────────────────

const journalSchema = Joi.object({
  ...pagination,
  company_id: uuid,
  user_id: uuid,
  action: Joi.string().trim().max(80),
  entity_type: Joi.string().trim().max(40),
  entity_id: Joi.string().trim().max(64),
  du: dateIso,
  au: dateIso,
});

const cleParametre = Joi.object({ cle: Joi.string().trim().max(80).required() });

module.exports = {
  companyIdParam, entreprisesSchema, motifSchema, motifFacultatifSchema,
  abonnementsSchema, activationSchema, paiementsSchema, statistiquesSchema,
  utilisateursSchema, superAdminSchema, reinitialisationAccesSchema, diffusionSchema,
  planCreationSchema, planModificationSchema, plansSchema, journalSchema, cleParametre,
};
