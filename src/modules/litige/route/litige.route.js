'use strict';

const router = require('express').Router();
const ctrl = require('../controller/litige.controller.js');
const validate = require('../../../middlewares/validate.middleware.js');
const paginate = require('../../../middlewares/pagination.middleware.js');
const idempotence = require('../../../middlewares/idempotence.middleware.js');
const { recevoirFichier } = require('../../../middlewares/upload.middleware.js');
const { requirePermission, requireProfil } = require('../../../middlewares/acces.middleware.js');
const { P } = require('../../../config/permissions.js');
const { paramId } = require('../../../validations/common.js');
const v = require('../validation/litige.validation.js');

/**
 * Retours et litiges : ouverts par l'acheteur (qui réceptionne ou gère les
 * achats), traités par le fournisseur — l'acceptation émet un avoir, elle
 * relève donc de la facturation.
 */
const lire = requirePermission(P.ACHATS_LIRE, P.VENTES_LIRE);
const ouvrir = [requireProfil('acheteur'), requirePermission(P.RECEPTION_CONFIRMER, P.ACHATS_GERER)];
const id = validate(paramId, 'params');

router.get('/', lire, validate(v.listeSchema, 'query'), paginate(), ctrl.lister);
router.post('/', ...ouvrir, idempotence(), validate(v.ouvertureSchema), ctrl.ouvrir);
router.get('/:id', lire, id, ctrl.detail);
router.post('/:id/accepter', requireProfil('fournisseur'), requirePermission(P.FACTURES_EMETTRE), id, idempotence(), validate(v.acceptationSchema), ctrl.accepter);
router.post('/:id/refuser', requireProfil('fournisseur'), requirePermission(P.VENTES_TRAITER, P.FACTURES_EMETTRE), id, validate(v.refusSchema), ctrl.refuser);
router.post('/:id/annuler', ...ouvrir, id, validate(v.annulationSchema), ctrl.annuler);
router.post('/:id/pieces-jointes', requirePermission(P.DOCUMENTS_ECRIRE), id, recevoirFichier('justificatif'), idempotence(), ctrl.joindre);

module.exports = router;
