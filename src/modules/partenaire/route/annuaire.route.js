'use strict';

const router = require('express').Router();
const ctrl = require('../controller/partenaire.controller.js');
const validate = require('../../../middlewares/validate.middleware.js');
const paginate = require('../../../middlewares/pagination.middleware.js');
const { requirePermission } = require('../../../middlewares/acces.middleware.js');
const { P } = require('../../../config/permissions.js');
const { paramId } = require('../../../validations/common.js');
const v = require('../validation/partenaire.validation.js');

// § 7 — rechercher un fournisseur (ou un client) parmi les entreprises inscrites, consulter son profil.
router.get('/', requirePermission(P.PARTENAIRES_LIRE), validate(v.annuaireSchema, 'query'), paginate(), ctrl.annuaire);
router.get('/:id', requirePermission(P.PARTENAIRES_LIRE), validate(paramId, 'params'), ctrl.profil);

module.exports = router;
