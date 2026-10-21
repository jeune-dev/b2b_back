'use strict';

const { ForbiddenError, UnauthorizedError } = require('../errors/AppError.js');
const { decrire } = require('../utils/contrat.js');

/**
 * Contrôle d'accès VERTICAL (§ 24) : rôles, permissions, espace entreprise et
 * profil acheteur / fournisseur. À placer après `auth`.
 */

/** Le compte doit porter l'un des rôles plateforme indiqués. */
const requireRole = (...roles) => decrire((req, res, next) => {
  if (!req.user) return next(new UnauthorizedError());
  if (roles.includes(req.user.role_code)) return next();
  return next(new ForbiddenError("Vous n'avez pas les droits nécessaires pour cette action.", 'ROLE_INSUFFISANT'));
}, { type: 'role', roles });

/**
 * Le compte doit détenir la permission (RBAC fin, `roles.permissions`) — ou
 * l'UNE des permissions citées (ex. un litige s'ouvre par qui réceptionne OU
 * par qui gère les achats).
 */
const requirePermission = (...permissions) => decrire((req, res, next) => {
  if (!req.user) return next(new UnauthorizedError());
  if (permissions.some((p) => req.permissions?.has(p))) return next();
  return next(new ForbiddenError("Vous n'avez pas la permission d'effectuer cette action.", 'PERMISSION_REFUSEE', { permission: permissions.join(' | ') }));
}, { type: 'permission', permission: permissions.join(' ou ') });

/**
 * Routes de l'espace entreprise : le compte doit appartenir à une entreprise
 * ACTIVE (§ 6 « chaque entreprise dispose d'un espace propre »). Un super
 * admin n'y a pas accès : il administre la plateforme, il n'achète ni ne vend.
 */
const requireEntreprise = (req, res, next) => {
  if (!req.user) return next(new UnauthorizedError());
  if (!req.companyId) {
    return next(new ForbiddenError('Cette fonctionnalité est réservée aux comptes d’entreprise.', 'ESPACE_ENTREPRISE_REQUIS'));
  }
  if (req.companyStatus !== 'actif') {
    return next(new ForbiddenError('Votre entreprise est suspendue. Contactez le support Pro2Link.', 'ENTREPRISE_SUSPENDUE'));
  }
  return next();
};
decrire(requireEntreprise, { type: 'espace', espace: 'entreprise' });

/**
 * § 5 — profil commercial exigé : seule une entreprise FOURNISSEUR (ou mixte)
 * gère un catalogue et traite des commandes reçues ; seule une entreprise
 * ACHETEUSE (ou mixte) passe des commandes.
 * @param {'acheteur'|'fournisseur'} profil
 */
const requireProfil = (profil) => decrire((req, res, next) => {
  if (req.companyType === profil || req.companyType === 'mixte') return next();
  const message = profil === 'fournisseur'
    ? 'Fonctionnalité réservée aux entreprises fournisseurs. Passez votre entreprise en profil « mixte » pour vendre.'
    : 'Fonctionnalité réservée aux entreprises acheteuses. Passez votre entreprise en profil « mixte » pour acheter.';
  return next(new ForbiddenError(message, 'PROFIL_ENTREPRISE_INCOMPATIBLE', { profil_requis: profil }));
}, { type: 'profil', profil });

module.exports = { requireRole, requirePermission, requireEntreprise, requireProfil };
