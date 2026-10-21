'use strict';

const router = require('express').Router();
const ctrl = require('../controller/auth.controller.js');
const validate = require('../../../middlewares/validate.middleware.js');
const { authRateLimit, sessionRateLimit, otpCibleRateLimit } = require('../../../middlewares/rateLimit.middleware.js');
const v = require('../validation/auth.validation.js');

// § 26 — création du compte et de l'entreprise. Routes publiques, toutes limitées en débit.
router.post('/inscription', authRateLimit, validate(v.inscriptionSchema), ctrl.inscription);
router.post('/connexion', authRateLimit, validate(v.connexionSchema), ctrl.connexion);
// Seconde étape de la connexion quand la double authentification est active.
router.post('/mfa', authRateLimit, validate(v.mfaSchema), ctrl.mfa);
router.post('/refresh', sessionRateLimit, validate(v.refreshSchema), ctrl.rafraichir);
router.post('/deconnexion', sessionRateLimit, validate(v.deconnexionSchema), ctrl.deconnexion);
router.post('/mot-de-passe-oublie', authRateLimit, otpCibleRateLimit, validate(v.motDePasseOublieSchema), ctrl.motDePasseOublie);
router.post('/reinitialiser-mot-de-passe', authRateLimit, otpCibleRateLimit, validate(v.reinitialisationSchema), ctrl.reinitialiser);
// § 5.3 — activation d'un compte collaborateur (lien ou code reçu par e-mail).
// Limité par IP ET par e-mail ciblé (force brute du code à 8 chiffres).
router.post('/invitation/activation', authRateLimit, otpCibleRateLimit, validate(v.activationSchema), ctrl.activerInvitation);

module.exports = router;
