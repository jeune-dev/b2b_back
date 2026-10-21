'use strict';

const router = require('express').Router();
const ctrl = require('../controller/statistiques.controller.js');
const validate = require('../../../middlewares/validate.middleware.js');
const { rapportRateLimit } = require('../../../middlewares/rateLimit.middleware.js');
const { requirePermission, requireProfil } = require('../../../middlewares/acces.middleware.js');
const { exigerFonctionnalite } = require('../../../middlewares/abonnement.middleware.js');
const { P } = require('../../../config/permissions.js');
const v = require('../validation/statistiques.validation.js');

// § 21 — statistiques d'achats et de ventes ; exports CSV (fonctionnalités du forfait).
router.use(requirePermission(P.STATISTIQUES_LIRE), rapportRateLimit);

router.get('/achats', requireProfil('acheteur'), exigerFonctionnalite('statistiques'), validate(v.periodeSchema, 'query'), ctrl.achats);
router.get('/ventes', requireProfil('fournisseur'), exigerFonctionnalite('statistiques'), validate(v.periodeSchema, 'query'), ctrl.ventes);
router.get('/exports/:type.csv', exigerFonctionnalite('exports'), validate(v.exportParam, 'params'), validate(v.exportSchema, 'query'), ctrl.exporter);

module.exports = router;
