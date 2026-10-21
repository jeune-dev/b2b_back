'use strict';

const router = require('express').Router();
const ctrl = require('../controller/situation.controller.js');
const { requirePermission, requireProfil } = require('../../../middlewares/acces.middleware.js');
const { P } = require('../../../config/permissions.js');

// § 16 — dettes (ce que je dois à mes fournisseurs) et créances (ce que mes clients me doivent).
router.get('/dettes', requireProfil('acheteur'), requirePermission(P.FACTURES_LIRE), ctrl.dettes);
router.get('/creances', requireProfil('fournisseur'), requirePermission(P.FACTURES_LIRE), ctrl.creances);

module.exports = router;
