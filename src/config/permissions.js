'use strict';

/**
 * Catalogue des permissions (RBAC fin, § 5.3 « les permissions doivent
 * dépendre du rôle », § 24).
 *
 * Les permissions EFFECTIVES d'un rôle vivent en base (`roles.permissions`),
 * synchronisées depuis `PERMISSIONS_PAR_ROLE` ci-dessous à chaque démarrage
 * (src/scripts/initialiser.js). Le catalogue sert :
 *   - à la synchronisation des rôles ;
 *   - aux routes, qui référencent ces constantes plutôt que des chaînes libres.
 *
 * Un compte d'entreprise tire ses permissions de son rôle DANS l'entreprise
 * (`company_members.role_code`), jamais de son rôle plateforme.
 */

const P = Object.freeze({
  // ── Espace entreprise ──────────────────────────────────────────────────
  DASHBOARD_LIRE: 'dashboard.lire',
  ENTREPRISE_GERER: 'entreprise.gerer',
  UTILISATEURS_GERER: 'utilisateurs.gerer',
  PARTENAIRES_LIRE: 'partenaires.lire',
  PARTENAIRES_GERER: 'partenaires.gerer',
  CATALOGUE_LIRE: 'catalogue.lire',
  PRODUITS_GERER: 'produits.gerer',
  ACHATS_LIRE: 'achats.lire',
  ACHATS_GERER: 'achats.gerer',
  RECEPTION_CONFIRMER: 'reception.confirmer',
  VENTES_LIRE: 'ventes.lire',
  VENTES_TRAITER: 'ventes.traiter',
  FACTURES_LIRE: 'factures.lire',
  FACTURES_EMETTRE: 'factures.emettre',
  PAIEMENTS_LIRE: 'paiements.lire',
  PAIEMENTS_ENREGISTRER: 'paiements.enregistrer',
  MODELES_GERER: 'modeles.gerer',
  STATISTIQUES_LIRE: 'statistiques.lire',
  DOCUMENTS_LIRE: 'documents.lire',
  DOCUMENTS_ECRIRE: 'documents.ecrire',
  ABONNEMENT_GERER: 'abonnement.gerer',

  // ── Super admin (web) ──────────────────────────────────────────────────
  ADMIN_DASHBOARD: 'admin.dashboard',
  ADMIN_ENTREPRISES: 'admin.entreprises',
  ADMIN_UTILISATEURS: 'admin.utilisateurs',
  ADMIN_ABONNEMENTS: 'admin.abonnements',
  ADMIN_PAIEMENTS: 'admin.paiements',
  ADMIN_PLANS: 'admin.plans',
  ADMIN_PARAMETRES: 'admin.parametres',
  ADMIN_NOTIFICATIONS: 'admin.notifications',
  ADMIN_STATISTIQUES: 'admin.statistiques',
  ADMIN_AUDIT: 'admin.audit',
  ADMIN_ROLES: 'admin.roles',
});

const TOUTES = Object.freeze(Object.values(P));
const ENTREPRISE = TOUTES.filter((p) => !p.startsWith('admin.'));
const SUPER_ADMIN = TOUTES.filter((p) => p.startsWith('admin.'));

/**
 * § 5.3 — rôles internes d'une entreprise. L'administrateur a tout ; les
 * autres rôles n'ont que ce que leur métier exige (moindre privilège).
 */
const PERMISSIONS_PAR_ROLE = Object.freeze({
  super_admin: SUPER_ADMIN,
  // Rôle plateforme d'un compte d'entreprise : aucune permission propre,
  // tout vient du rôle dans l'entreprise.
  utilisateur: [],
  administrateur: ENTREPRISE,
  responsable_achats: [
    P.DASHBOARD_LIRE, P.PARTENAIRES_LIRE, P.PARTENAIRES_GERER, P.CATALOGUE_LIRE,
    P.ACHATS_LIRE, P.ACHATS_GERER, P.RECEPTION_CONFIRMER,
    P.FACTURES_LIRE, P.PAIEMENTS_LIRE, P.STATISTIQUES_LIRE, P.DOCUMENTS_LIRE, P.DOCUMENTS_ECRIRE,
  ],
  responsable_commandes: [
    P.DASHBOARD_LIRE, P.PARTENAIRES_LIRE, P.CATALOGUE_LIRE, P.PRODUITS_GERER,
    P.ACHATS_LIRE, P.VENTES_LIRE, P.VENTES_TRAITER, P.FACTURES_LIRE,
    P.STATISTIQUES_LIRE, P.DOCUMENTS_LIRE, P.DOCUMENTS_ECRIRE,
  ],
  comptable: [
    P.DASHBOARD_LIRE, P.PARTENAIRES_LIRE, P.ACHATS_LIRE, P.VENTES_LIRE,
    P.FACTURES_LIRE, P.FACTURES_EMETTRE, P.PAIEMENTS_LIRE, P.PAIEMENTS_ENREGISTRER,
    P.MODELES_GERER, P.STATISTIQUES_LIRE, P.DOCUMENTS_LIRE, P.DOCUMENTS_ECRIRE,
  ],
  receptionnaire: [
    P.DASHBOARD_LIRE, P.CATALOGUE_LIRE, P.ACHATS_LIRE, P.RECEPTION_CONFIRMER,
    P.DOCUMENTS_LIRE, P.DOCUMENTS_ECRIRE,
  ],
  commercial: [
    P.DASHBOARD_LIRE, P.PARTENAIRES_LIRE, P.PARTENAIRES_GERER, P.CATALOGUE_LIRE, P.PRODUITS_GERER,
    P.VENTES_LIRE, P.VENTES_TRAITER, P.FACTURES_LIRE, P.PAIEMENTS_LIRE,
    P.STATISTIQUES_LIRE, P.DOCUMENTS_LIRE, P.DOCUMENTS_ECRIRE,
  ],
});

module.exports = { P, TOUTES, PERMISSIONS_PAR_ROLE };
