'use strict';

const router = require('express').Router();
const plans = require('../controller/plans.controller.js');
const validate = require('../../../middlewares/validate.middleware.js');
const { requirePermission } = require('../../../middlewares/acces.middleware.js');
const { P } = require('../../../config/permissions.js');
const { paramId } = require('../../../validations/common.js');
const v = require('../validation/admin.validation.js');

// § 25 — forfaits : prix, période, limites, fonctionnalités, configurables depuis le Super Admin.
const p = requirePermission(P.ADMIN_PLANS);
router.get('/plans', p, validate(v.plansSchema, 'query'), plans.lister);
router.post('/plans', p, validate(v.planCreationSchema), plans.creer);
router.get('/plans/:id', p, validate(paramId, 'params'), plans.detail);
router.patch('/plans/:id', p, validate(paramId, 'params'), validate(v.planModificationSchema), plans.modifier);
router.post('/plans/:id/activer', p, validate(paramId, 'params'), plans.activer);
router.post('/plans/:id/desactiver', p, validate(paramId, 'params'), plans.desactiver);
router.delete('/plans/:id', p, validate(paramId, 'params'), plans.supprimer);

module.exports = router;
