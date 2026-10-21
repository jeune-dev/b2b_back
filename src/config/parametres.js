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

  // ── Achats (côté acheteur) ──────────────────────────────────────────────
  // Circuit d'approbation interne : à partir de `min_total` FCFA TTC, un bon
  // de commande exige `approvals` approbations DISTINCTES (permission
  // achats.approuver, jamais celle de son auteur) avant de partir chez le
  // fournisseur. Vide : pas d'approbation.
  order_approval_levels: [],
  // Rapprochement commande / réception / facture : écart toléré (en %) sur
  // les quantités et prix facturés avant blocage du paiement.
  invoice_match_tolerance_percent: 2,

  // ── Ventes (côté fournisseur) ───────────────────────────────────────────
  // Montant minimum (HT, FCFA) d'un bon de commande reçu. null : aucun.
  min_order_amount: null,
  // Relances graduées des factures impayées : jours APRÈS l'échéance.
  dunning_enabled: true,
  dunning_days_after_due: [3, 7, 15],
  // Alerte de stock bas (produits suivis en stock).
  low_stock_alerts: true,

  // ── Comptabilité (export SYSCOHADA) ─────────────────────────────────────
  // Comptes surchargeables un à un ; les autres gardent le plan SYSCOHADA.
  accounting_accounts: {},
});

/** Plan de comptes SYSCOHADA révisé utilisé par l'export comptable. */
const COMPTES_SYSCOHADA = Object.freeze({
  clients: '411100',
  fournisseurs: '401100',
  ventes: '701100',
  achats: '601100',
  tva_collectee: '443100',
  tva_deductible: '445200',
  banque: '521100',
  caisse: '571100',
  mobile_money: '585000',
  rrr_obtenus: '601900',
  rrr_accordes: '701900',
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
  order_approval_levels: Joi.array().items(Joi.object({
    min_total: Joi.number().integer().min(0).max(1e13).required(),
    approvals: Joi.number().integer().min(1).max(3).required(),
  })).max(5).unique('min_total'),
  invoice_match_tolerance_percent: Joi.number().min(0).max(50).precision(2),
  min_order_amount: Joi.number().integer().min(1).max(1e13).allow(null),
  dunning_enabled: Joi.boolean(),
  dunning_days_after_due: Joi.array().items(Joi.number().integer().min(1).max(365)).min(1).max(6).unique(),
  low_stock_alerts: Joi.boolean(),
  accounting_accounts: Joi.object(Object.fromEntries(Object.keys(COMPTES_SYSCOHADA).map((c) => [c, Joi.string().trim().pattern(/^[0-9A-Z]{2,12}$/)
    .messages({ 'string.pattern.base': '{{#label}} : 2 à 12 chiffres ou lettres majuscules' })]))),
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

/** Comptes effectifs d'une entreprise : SYSCOHADA + ses surcharges. */
const comptesComptables = (reglages) => ({ ...COMPTES_SYSCOHADA, ...(reglages.accounting_accounts || {}) });

/**
 * Nombre d'approbations exigées pour un total TTC : palier le plus élevé
 * atteint (0 : aucune).
 */
function approbationsRequises(reglages, total) {
  const paliers = [...(reglages.order_approval_levels || [])].sort((a, b) => b.min_total - a.min_total);
  return paliers.find((p) => Number(total) >= p.min_total)?.approvals || 0;
}

module.exports = {
  DEFAUTS_ENTREPRISE, schemaParametresEntreprise, parametresEntreprise, COMPTES_SYSCOHADA, comptesComptables, approbationsRequises,
  DEFAUTS_PLATEFORME, SCHEMAS_PLATEFORME,
};
