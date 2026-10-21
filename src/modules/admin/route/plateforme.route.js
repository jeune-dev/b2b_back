'use strict';

const router = require('express').Router();
const ctrl = require('../controller/plateforme.controller.js');
const validate = require('../../../middlewares/validate.middleware.js');
const paginate = require('../../../middlewares/pagination.middleware.js');
const { requirePermission } = require('../../../middlewares/acces.middleware.js');
const { P } = require('../../../config/permissions.js');
const { Joi, pagination } = require('../../../validations/common.js');
const v = require('../validation/admin.validation.js');

// § 5.4 « gérer les paramètres de la plateforme » — le corps est validé par le schéma propre à la clé (service).
router.get('/parametres', requirePermission(P.ADMIN_PARAMETRES), ctrl.parametres);
router.put('/parametres/:cle', requirePermission(P.ADMIN_PARAMETRES), validate(v.cleParametre, 'params'), ctrl.modifierParametre);

// Messages d'information diffusés aux entreprises.
const notifications = requirePermission(P.ADMIN_NOTIFICATIONS);
router.post('/notifications', notifications, validate(v.diffusionSchema), ctrl.diffuser);
router.get('/notifications', notifications, validate(Joi.object(pagination), 'query'), paginate(), ctrl.diffusions);

// § 24 historique des actions ; rôles et permissions (lecture seule).
router.get('/journal-audit', requirePermission(P.ADMIN_AUDIT), validate(v.journalSchema, 'query'), paginate(), ctrl.journal);
router.get('/roles', requirePermission(P.ADMIN_ROLES), ctrl.roles);

module.exports = router;
