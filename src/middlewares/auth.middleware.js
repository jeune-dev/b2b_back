'use strict';

const jwt = require('jsonwebtoken');
const { jwtConfig, cleHmac } = require('../config/security.js');
const { User, CompanyMember, Company } = require('../models/index.js');
const { UnauthorizedError, ForbiddenError } = require('../errors/AppError.js');
const { permissionsDuRole } = require('../modules/auth/service/roles.service.js');

/**
 * Authentification par jeton d'accès (Bearer) — reprise de Widjila / Immo.
 *
 * Contrôles, dans l'ordre :
 *   1. signature et expiration (HS256 uniquement — pas de `alg: none`) ;
 *   2. type `access` : un refresh token ou un jeton d'invitation ne vaut JAMAIS
 *      jeton d'accès ;
 *   3. compte existant, non supprimé, ACTIF — un compte désactivé perd l'accès
 *      à la requête suivante ;
 *   4. `token_version` identique à la base : un changement de mot de passe ou
 *      une « déconnexion de tous les appareils » périme à l'instant tous les
 *      jetons déjà émis ;
 *   5. mot de passe provisoire (`must_change_password`) : 403
 *      CHANGEMENT_MOT_DE_PASSE_REQUIS hors des routes de changement ;
 *   6. super admin sans double authentification : 403 MFA_REQUISE.
 *
 * UNE seule requête SQL : l'utilisateur et, pour un compte d'entreprise, son
 * appartenance active à une entreprise (jointure).
 *
 * Pose sur la requête :
 *   req.user          — l'utilisateur (sans secrets à la sérialisation)
 *   req.permissions   — Set des permissions effectives (rôle DANS l'entreprise)
 *   req.companyId     — entreprise de l'utilisateur (compte d'entreprise)
 *   req.companyType   — acheteur | fournisseur | mixte
 *   req.companyStatus — actif | suspendu
 *   req.memberRole    — rôle interne (administrateur, comptable…)
 */

/**
 * Seules routes ouvertes à un compte dont le mot de passe doit être changé :
 * lire son profil (le client y lit `must_change_password`), changer le mot de
 * passe, se déconnecter.
 */
const ROUTES_AVANT_CHANGEMENT = new Set([
  'GET /api/v1/compte',
  'POST /api/v1/compte/mot-de-passe',
  'POST /api/v1/auth/deconnexion',
]);

/**
 * Super admin sans double authentification : seules la lecture du profil, la
 * configuration TOTP, le changement de mot de passe et la déconnexion sont
 * ouverts. Le reste de l'administration est fermé.
 */
const ROUTES_AVANT_MFA = new Set([
  ...ROUTES_AVANT_CHANGEMENT,
  'POST /api/v1/compte/mfa/initialiser',
  'POST /api/v1/compte/mfa/activer',
]);

const cleRoute = (req) => `${req.method} ${String(req.originalUrl || '').split('?')[0].replace(/\/+$/, '')}`;
const routeOuverteAvantChangement = (req) => ROUTES_AVANT_CHANGEMENT.has(cleRoute(req));
const routeOuverteAvantMfa = (req) => ROUTES_AVANT_MFA.has(cleRoute(req));

/**
 * Vérifie le jeton d'accès et charge le compte. Exporté pour le flux
 * d'événements temps réel, qui authentifie un ticket plutôt qu'un en-tête.
 * @returns {Promise<object>} utilisateur avec ses appartenances
 */
async function chargerUtilisateur(userId, tokenVersion) {
  const utilisateur = await User.findByPk(userId, {
    attributes: ['id', 'role_code', 'first_name', 'last_name', 'email', 'phone', 'status', 'token_version', 'must_change_password', 'language', 'totp_enabled_at'],
    include: [{
      model: CompanyMember,
      as: 'memberships',
      required: false,
      where: { status: 'actif' },
      attributes: ['company_id', 'role_code'],
      include: [{ model: Company, as: 'company', attributes: ['id', 'status', 'type'] }],
    }],
  });
  if (!utilisateur) throw new UnauthorizedError('Session invalide, veuillez vous reconnecter', 'SESSION_INVALIDE');
  if (utilisateur.status !== 'actif') throw new ForbiddenError('Compte désactivé. Contactez le support.', 'COMPTE_INACTIF');
  if ((tokenVersion ?? -1) !== utilisateur.token_version) {
    throw new UnauthorizedError('Session expirée, veuillez vous reconnecter', 'SESSION_REVOQUEE');
  }
  return utilisateur;
}

/** Pose l'utilisateur, son entreprise et ses permissions sur la requête. */
async function poserContexte(req, utilisateur) {
  req.user = utilisateur;
  const appartenance = utilisateur.memberships?.[0];
  if (appartenance) {
    req.companyId = appartenance.company_id;
    req.companyStatus = appartenance.company?.status;
    req.companyType = appartenance.company?.type;
    req.memberRole = appartenance.role_code;
    req.permissions = await permissionsDuRole(appartenance.role_code);
  } else {
    req.permissions = await permissionsDuRole(utilisateur.role_code);
  }
}

const auth = async (req, res, next) => {
  try {
    const entete = req.headers.authorization;
    if (!entete || !entete.startsWith('Bearer ')) {
      return next(new UnauthorizedError('Jeton manquant ou invalide', 'TOKEN_MANQUANT'));
    }

    const decode = jwt.verify(entete.slice(7), cleHmac(jwtConfig.secret), { algorithms: [jwtConfig.algorithme] });
    if (decode.typ !== 'access') {
      return next(new UnauthorizedError('Jeton invalide pour cette opération', 'TOKEN_INVALIDE'));
    }

    const utilisateur = await chargerUtilisateur(decode.sub, decode.tv);

    // Mot de passe PROVISOIRE (compte créé par un autre) : tant qu'il n'est
    // pas changé, seul le changement de mot de passe est ouvert.
    if (utilisateur.must_change_password && !routeOuverteAvantChangement(req)) {
      return next(new ForbiddenError(
        'Vous devez changer votre mot de passe provisoire avant de continuer.',
        'CHANGEMENT_MOT_DE_PASSE_REQUIS'
      ));
    }

    // Double authentification OBLIGATOIRE pour le super admin.
    if (utilisateur.role_code === 'super_admin' && !utilisateur.totp_enabled_at && !routeOuverteAvantMfa(req)) {
      return next(new ForbiddenError(
        'Configurez la double authentification avant d’accéder à l’administration.',
        'MFA_REQUISE'
      ));
    }

    await poserContexte(req, utilisateur);
    req.sessionId = decode.sid || null;
    return next();
  } catch (err) {
    return next(err); // TokenExpiredError / JsonWebTokenError → errorHandler (401)
  }
};

module.exports = auth;
module.exports.chargerUtilisateur = chargerUtilisateur;
module.exports.poserContexte = poserContexte;
