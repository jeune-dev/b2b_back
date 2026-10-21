'use strict';

const router = require('express').Router();
const ctrl = require('../controller/catalogue.controller.js');
const validate = require('../../../middlewares/validate.middleware.js');
const paginate = require('../../../middlewares/pagination.middleware.js');
const { requirePermission, requireProfil } = require('../../../middlewares/acces.middleware.js');
const { P } = require('../../../config/permissions.js');
const v = require('../validation/catalogue.validation.js');

// § 8 — l'acheteur consulte le catalogue de SES fournisseurs (partenariat actif).
router.use(requireProfil('acheteur'), requirePermission(P.CATALOGUE_LIRE));

router.get('/:supplierId/produits', validate(v.fournisseurParam, 'params'), validate(v.listeAcheteurSchema, 'query'), paginate(), ctrl.catalogueFournisseur);
router.get('/:supplierId/produits/:id', validate(v.produitFournisseurParam, 'params'), ctrl.produitFournisseur);
router.get('/:supplierId/categories', validate(v.fournisseurParam, 'params'), ctrl.categoriesFournisseur);

module.exports = router;
