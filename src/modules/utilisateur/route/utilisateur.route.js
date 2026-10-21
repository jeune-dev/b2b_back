'use strict';

const router = require('express').Router();
const ctrl = require('../controller/utilisateur.controller.js');
const validate = require('../../../middlewares/validate.middleware.js');
const paginate = require('../../../middlewares/pagination.middleware.js');
const { requirePermission } = require('../../../middlewares/acces.middleware.js');
const { mutationRateLimit } = require('../../../middlewares/rateLimit.middleware.js');
const { P } = require('../../../config/permissions.js');
const { paramId } = require('../../../validations/common.js');
const v = require('../validation/utilisateur.validation.js');

// § 5.3 — utilisateurs internes et leurs rôles (permission « utilisateurs.gerer » : administrateur).
const gerer = requirePermission(P.UTILISATEURS_GERER);
const id = validate(paramId, 'params');

router.get('/', gerer, validate(v.listeSchema, 'query'), paginate(), ctrl.lister);
router.get('/invitations', gerer, validate(v.invitationsSchema, 'query'), paginate(), ctrl.invitations);
router.post('/invitations', gerer, mutationRateLimit, validate(v.invitationSchema), ctrl.inviter);
router.post('/invitations/:id/renvoyer', gerer, mutationRateLimit, id, ctrl.renvoyer);
router.delete('/invitations/:id', gerer, id, ctrl.revoquer);
router.get('/:id', gerer, id, ctrl.detail);
router.patch('/:id', gerer, id, validate(v.roleSchema), ctrl.changerRole);
router.post('/:id/desactiver', gerer, id, validate(v.motifSchema), ctrl.desactiver);
router.post('/:id/reactiver', gerer, id, ctrl.reactiver);

module.exports = router;
