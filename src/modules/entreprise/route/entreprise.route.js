'use strict';

const router = require('express').Router();
const ctrl = require('../controller/entreprise.controller.js');
const validate = require('../../../middlewares/validate.middleware.js');
const { recevoirFichier } = require('../../../middlewares/upload.middleware.js');
const { requirePermission } = require('../../../middlewares/acces.middleware.js');
const { P } = require('../../../config/permissions.js');
const v = require('../validation/entreprise.validation.js');

// § 6 — fiche de l'entreprise : lisible par tout membre, modifiable par l'administrateur.
router.get('/', ctrl.detail);
router.patch('/', requirePermission(P.ENTREPRISE_GERER), validate(v.modificationSchema), ctrl.modifier);
router.patch('/parametres', requirePermission(P.ENTREPRISE_GERER), validate(v.parametresSchema), ctrl.modifierParametres);
router.post('/logo', requirePermission(P.ENTREPRISE_GERER), recevoirFichier('image'), ctrl.changerLogo);
router.delete('/logo', requirePermission(P.ENTREPRISE_GERER), ctrl.supprimerLogo);

module.exports = router;
