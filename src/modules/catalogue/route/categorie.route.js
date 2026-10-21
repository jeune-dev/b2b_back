'use strict';

const router = require('express').Router();
const ctrl = require('../controller/catalogue.controller.js');
const validate = require('../../../middlewares/validate.middleware.js');
const { requirePermission, requireProfil } = require('../../../middlewares/acces.middleware.js');
const { P } = require('../../../config/permissions.js');
const { paramId } = require('../../../validations/common.js');
const v = require('../validation/catalogue.validation.js');

// § 8 — catégories du catalogue du fournisseur.
router.use(requireProfil('fournisseur'));
const gerer = requirePermission(P.PRODUITS_GERER);

router.get('/', requirePermission(P.CATALOGUE_LIRE), ctrl.categories);
router.post('/', gerer, validate(v.categorieSchema), ctrl.creerCategorie);
router.patch('/:id', gerer, validate(paramId, 'params'), validate(v.categorieModificationSchema), ctrl.modifierCategorie);
router.delete('/:id', gerer, validate(paramId, 'params'), ctrl.supprimerCategorie);

module.exports = router;
