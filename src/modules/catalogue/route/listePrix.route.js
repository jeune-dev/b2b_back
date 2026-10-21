'use strict';

const router = require('express').Router();
const ctrl = require('../controller/catalogue.controller.js');
const validate = require('../../../middlewares/validate.middleware.js');
const { requirePermission, requireProfil } = require('../../../middlewares/acces.middleware.js');
const { P } = require('../../../config/permissions.js');
const { paramId } = require('../../../validations/common.js');
const v = require('../validation/catalogue.validation.js');

// Tarifs propres à un client ou à un groupe de clients (profil fournisseur ou mixte).
router.use(requireProfil('fournisseur'));
const lire = requirePermission(P.CATALOGUE_LIRE);
const gerer = requirePermission(P.PRODUITS_GERER);
const id = validate(paramId, 'params');

router.get('/', lire, ctrl.listesPrix);
router.post('/', gerer, validate(v.listePrixSchema), ctrl.creerListePrix);
router.get('/:id', lire, id, ctrl.listePrix);
router.patch('/:id', gerer, id, validate(v.listePrixModificationSchema), ctrl.modifierListePrix);
router.delete('/:id', gerer, id, ctrl.supprimerListePrix);

module.exports = router;
