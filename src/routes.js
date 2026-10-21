'use strict';

const router = require('express').Router();
const auth = require('./middlewares/auth.middleware.js');
const { requireEntreprise, requireRole } = require('./middlewares/acces.middleware.js');
const { exigerAbonnementPourEcrire } = require('./middlewares/abonnement.middleware.js');
const { authenticatedRateLimit, adminRateLimit, webhookRateLimit } = require('./middlewares/rateLimit.middleware.js');

/**
 * Registre des routes /api/v1 — le MÊME backend pour le web et le mobile
 * (§ 4 « les deux applications utilisent le même backend, la même API et les
 * mêmes données »).
 *
 * Deux espaces, deux chaînes de gardes appliquées UNE fois par préfixe — une
 * route ajoutée dans un module hérite automatiquement de la garde de son
 * espace, elle ne peut pas l'oublier :
 *
 *   espace entreprise : auth → limite par utilisateur → entreprise active
 *                       → abonnement (écritures) → permission (dans le module)
 *   super admin       : auth → limite admin → rôle super_admin → permission
 */

const espaceEntreprise = [auth, authenticatedRateLimit, requireEntreprise, exigerAbonnementPourEcrire];
const espaceAdmin = [auth, adminRateLimit, requireRole('super_admin')];
const authentifie = [auth, authenticatedRateLimit];

const m = (chemin) => require(`./modules/${chemin}`);

// ── Public ─────────────────────────────────────────────────────────────────
router.use('/auth', m('auth/route/auth.route.js'));
router.use('/referentiels', m('referentiel/route/referentiel.route.js'));
router.use('/abonnement/plans', m('abonnement/route/plansPublics.route.js'));
// Webhooks des prestataires : authentifiés par relecture chez le prestataire, pas par jeton.
router.use('/webhooks', webhookRateLimit, m('webhook/route/webhook.route.js'));

// ── Tout compte authentifié ────────────────────────────────────────────────
router.use('/compte', authentifie, m('compte/route/compte.route.js'));
router.use('/notifications', authentifie, m('notification/route/notification.route.js'));
// Flux temps réel : la garde est dans le module (ticket du flux).
router.use('/evenements', m('evenements/route/evenements.route.js'));

// ── Espace entreprise (web et mobile) ──────────────────────────────────────
router.use('/tableau-de-bord', espaceEntreprise, m('dashboard/route/dashboard.route.js'));
router.use('/entreprise', espaceEntreprise, m('entreprise/route/entreprise.route.js'));
router.use('/utilisateurs', espaceEntreprise, m('utilisateur/route/utilisateur.route.js'));
router.use('/annuaire', espaceEntreprise, m('partenaire/route/annuaire.route.js'));
router.use('/partenariats', espaceEntreprise, m('partenaire/route/partenaire.route.js'));
router.use('/produits', espaceEntreprise, m('catalogue/route/produit.route.js'));
router.use('/categories-produits', espaceEntreprise, m('catalogue/route/categorie.route.js'));
router.use('/catalogues', espaceEntreprise, m('catalogue/route/catalogueFournisseur.route.js'));
router.use('/listes-prix', espaceEntreprise, m('catalogue/route/listePrix.route.js'));
router.use('/listes-achat', espaceEntreprise, m('listeAchat/route/listeAchat.route.js'));
router.use('/achats', espaceEntreprise, m('commande/route/achat.route.js'));
router.use('/ventes', espaceEntreprise, m('commande/route/vente.route.js'));
router.use('/factures', espaceEntreprise, m('facture/route/facture.route.js'));
router.use('/avoirs', espaceEntreprise, m('avoir/route/avoir.route.js'));
router.use('/litiges', espaceEntreprise, m('litige/route/litige.route.js'));
router.use('/paiements', espaceEntreprise, m('paiement/route/paiement.route.js'));
router.use('/situation', espaceEntreprise, m('situation/route/situation.route.js'));
router.use('/statistiques', espaceEntreprise, m('statistiques/route/statistiques.route.js'));
router.use('/modeles-documents', espaceEntreprise, m('modele/route/modele.route.js'));
router.use('/documents', espaceEntreprise, m('document/route/document.route.js'));
// Abonnement : SANS garde d'abonnement — souscrire est le seul moyen de sortir
// de la lecture seule quand l'abonnement a expiré (§ 25).
router.use('/abonnement', auth, authenticatedRateLimit, requireEntreprise, m('abonnement/route/abonnement.route.js'));

// ── Super admin (web) ──────────────────────────────────────────────────────
router.use('/admin', espaceAdmin, m('admin/route/admin.route.js'));

module.exports = router;
