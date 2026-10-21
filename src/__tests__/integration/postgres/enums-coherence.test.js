'use strict';

const { sequelize, fermer } = require('../../setup/helpers.js');
const E = require('../../../config/enums.js');

/**
 * Cohérence énumérations ↔ base : chaque contrainte CHECK `col IN (…)`
 * accepte EXACTEMENT les codes de config/enums.js (source unique). Une
 * énumération modifiée sans migration — ou l'inverse — échoue ici.
 */

afterAll(fermer);

const ATTENDUS = [
  ['users', 'status', E.STATUT_UTILISATEUR],
  ['companies', 'type', E.TYPE_ENTREPRISE],
  ['companies', 'sector', E.SECTEUR_ACTIVITE],
  ['companies', 'tax_regime', E.REGIME_FISCAL],
  ['companies', 'status', E.STATUT_ENTREPRISE],
  ['company_members', 'role_code', E.ROLES_ENTREPRISE],
  ['company_members', 'status', E.STATUT_MEMBRE],
  ['member_invitations', 'role_code', E.ROLES_ENTREPRISE],
  ['partnerships', 'status', E.STATUT_PARTENARIAT],
  ['partnership_invitations', 'relation', E.RELATION],
  ['partnership_invitations', 'status', E.STATUT_INVITATION_PARTENAIRE],
  ['products', 'unit', E.UNITE],
  ['products', 'availability', E.DISPONIBILITE],
  ['orders', 'status', E.STATUT_COMMANDE],
  ['orders', 'cancelled_by_side', E.COTE],
  ['order_versions', 'proposed_by_side', E.COTE],
  ['order_versions', 'status', E.STATUT_VERSION],
  ['order_lines', 'unit', E.UNITE],
  ['order_lines', 'change_type', E.CHANGEMENT_LIGNE],
  ['order_events', 'type', E.EVENEMENT_COMMANDE],
  ['order_events', 'actor_side', E.COTE],
  ['document_templates', 'type', E.TYPE_MODELE_DOCUMENT],
  ['document_templates', 'status', E.STATUT_MODELE_DOCUMENT],
  ['invoices', 'status', E.STATUT_FACTURE],
  ['invoices', 'source', E.SOURCE_FACTURE],
  ['invoice_lines', 'unit', E.UNITE],
  ['payments', 'method', E.MODE_PAIEMENT],
  ['payments', 'status', E.STATUT_PAIEMENT],
  ['payments', 'recorded_by_side', E.COTE],
  ['documents', 'entity_type', E.ENTITE_DOCUMENT],
  ['documents', 'category', E.CATEGORIE_DOCUMENT],
  ['documents', 'visibility', E.VISIBILITE_DOCUMENT],
  ['notifications', 'type', E.TYPE_NOTIFICATION],
  ['subscriptions', 'status', E.STATUT_ABONNEMENT],
  ['subscription_plans', 'billing_period', E.PERIODE_FACTURATION],
  ['subscription_plans', 'status', E.STATUT_PLAN],
  ['subscription_payments', 'status', E.STATUT_PAIEMENT_ABONNEMENT],
  ['device_tokens', 'platform', E.PLATEFORME_APPAREIL],
];

/** Valeurs d'une contrainte CHECK `col IN ('a', 'b')` (forme déparsée par PostgreSQL). */
async function valeursCheck(table, colonne) {
  const [lignes] = await sequelize.query(
    `SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = :table AND c.contype = 'c'`,
    { replacements: { table } }
  );
  const def = lignes.map((l) => l.def).find((d) => new RegExp(`\\(\\(?${colonne}\\)?(::text)? = ANY`).test(d));
  if (!def) return null;
  return [...def.matchAll(/'([^']+)'::/g)].map((m) => m[1]).sort();
}

test.each(ATTENDUS.map(([t, c, e]) => [`${t}.${c}`, t, c, e]))('%s ↔ enums.js', async (nom, table, colonne, enumeration) => {
  expect(await valeursCheck(table, colonne)).toEqual(E.codes(enumeration).sort());
});
