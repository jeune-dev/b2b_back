'use strict';

const router = require('express').Router();
const ctrl = require('../controller/dashboard.controller.js');
const { requirePermission } = require('../../../middlewares/acces.middleware.js');
const { P } = require('../../../config/permissions.js');

// § 18 / § 19 — tableau de bord acheteur et/ou fournisseur (selon le profil de l'entreprise).
router.get('/', requirePermission(P.DASHBOARD_LIRE), ctrl.tableauDeBord);

module.exports = router;
