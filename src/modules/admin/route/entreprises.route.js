'use strict';

const router = require('express').Router();
const ctrl = require('../controller/entreprises.controller.js');
const abo = require('../controller/abonnements.controller.js');
const validate = require('../../../middlewares/validate.middleware.js');
const paginate = require('../../../middlewares/pagination.middleware.js');
const idempotence = require('../../../middlewares/idempotence.middleware.js');
const { requirePermission } = require('../../../middlewares/acces.middleware.js');
const { P } = require('../../../config/permissions.js');
const { paramId } = require('../../../validations/common.js');
const v = require('../validation/admin.validation.js');

// § 5.4 — gérer les entreprises, suspendre / réactiver des comptes.
const entreprises = requirePermission(P.ADMIN_ENTREPRISES);
router.get('/entreprises', entreprises, validate(v.entreprisesSchema, 'query'), paginate(), ctrl.lister);
router.get('/entreprises/:id', entreprises, validate(paramId, 'params'), ctrl.detail);
router.post('/entreprises/:id/suspendre', entreprises, validate(paramId, 'params'), validate(v.motifSchema), ctrl.suspendre);
router.post('/entreprises/:id/reactiver', entreprises, validate(paramId, 'params'), ctrl.reactiver);
// Activation manuelle d'un forfait (paiement hors ligne, geste commercial) : relève des abonnements.
router.post(
  '/entreprises/:companyId/abonnement/activer',
  requirePermission(P.ADMIN_ABONNEMENTS), idempotence(), validate(v.companyIdParam, 'params'), validate(v.activationSchema), abo.activer
);

module.exports = router;
