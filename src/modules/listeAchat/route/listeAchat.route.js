'use strict';

const router = require('express').Router();
const ctrl = require('../controller/listeAchat.controller.js');
const validate = require('../../../middlewares/validate.middleware.js');
const paginate = require('../../../middlewares/pagination.middleware.js');
const idempotence = require('../../../middlewares/idempotence.middleware.js');
const { requirePermission, requireProfil } = require('../../../middlewares/acces.middleware.js');
const { P } = require('../../../config/permissions.js');
const { paramId } = require('../../../validations/common.js');
const v = require('../validation/listeAchat.validation.js');

// Listes d'achat habituelles de l'acheteur (profil acheteur ou mixte).
router.use(requireProfil('acheteur'));
const lire = requirePermission(P.ACHATS_LIRE);
const gerer = requirePermission(P.ACHATS_GERER);
const id = validate(paramId, 'params');

router.get('/', lire, validate(v.listeSchema, 'query'), paginate(), ctrl.lister);
router.post('/', gerer, validate(v.creationSchema), ctrl.creer);
router.get('/:id', lire, id, ctrl.detail);
router.patch('/:id', gerer, id, validate(v.modificationSchema), ctrl.modifier);
router.delete('/:id', gerer, id, ctrl.supprimer);
router.post('/:id/commander', gerer, id, idempotence(), validate(v.commandeListeSchema), ctrl.commander);

module.exports = router;
