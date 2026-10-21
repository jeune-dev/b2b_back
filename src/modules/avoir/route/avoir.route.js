'use strict';

const router = require('express').Router();
const ctrl = require('../controller/avoir.controller.js');
const validate = require('../../../middlewares/validate.middleware.js');
const paginate = require('../../../middlewares/pagination.middleware.js');
const idempotence = require('../../../middlewares/idempotence.middleware.js');
const { rapportRateLimit } = require('../../../middlewares/rateLimit.middleware.js');
const { requirePermission, requireProfil } = require('../../../middlewares/acces.middleware.js');
const { P } = require('../../../config/permissions.js');
const { paramId } = require('../../../validations/common.js');
const v = require('../validation/avoir.validation.js');

// Avoirs : émis par le fournisseur (litige accepté, geste commercial), reçus par l'acheteur.
const lire = requirePermission(P.FACTURES_LIRE);
const emettre = [requireProfil('fournisseur'), requirePermission(P.FACTURES_EMETTRE)];
const id = validate(paramId, 'params');

router.get('/', lire, validate(v.listeSchema, 'query'), paginate(), ctrl.lister);
router.post('/', ...emettre, idempotence(), validate(v.emissionSchema), ctrl.emettre);
router.get('/:id', lire, id, ctrl.detail);
router.get('/:id/pdf', lire, rapportRateLimit, id, ctrl.pdf);
router.post('/:id/annuler', ...emettre, id, validate(v.annulationSchema), ctrl.annuler);

module.exports = router;
