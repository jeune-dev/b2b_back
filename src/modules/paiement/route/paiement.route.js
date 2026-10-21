'use strict';

const router = require('express').Router();
const ctrl = require('../controller/paiement.controller.js');
const validate = require('../../../middlewares/validate.middleware.js');
const paginate = require('../../../middlewares/pagination.middleware.js');
const idempotence = require('../../../middlewares/idempotence.middleware.js');
const { recevoirFichier } = require('../../../middlewares/upload.middleware.js');
const { paiementRateLimit } = require('../../../middlewares/rateLimit.middleware.js');
const { requirePermission } = require('../../../middlewares/acces.middleware.js');
const { P } = require('../../../config/permissions.js');
const { paramId } = require('../../../validations/common.js');
const v = require('../validation/paiement.validation.js');

// § 16 — paiements reçus (fournisseur) et effectués (acheteur).
const lire = requirePermission(P.PAIEMENTS_LIRE);
const enregistrer = requirePermission(P.PAIEMENTS_ENREGISTRER);
const id = validate(paramId, 'params');

router.get('/', lire, validate(v.listeSchema, 'query'), paginate(), ctrl.lister);
// Mouvement d'argent : Idempotency-Key OBLIGATOIRE (double clic, renvoi après coupure réseau).
router.post('/', enregistrer, paiementRateLimit, idempotence({ obligatoire: true }), validate(v.enregistrementSchema), ctrl.enregistrer);
router.get('/:id', lire, id, ctrl.detail);
router.post('/:id/confirmer', enregistrer, id, idempotence(), validate(v.confirmationSchema), ctrl.confirmer);
router.post('/:id/rejeter', enregistrer, id, validate(v.motifSchema), ctrl.rejeter);
router.post('/:id/annuler', enregistrer, id, validate(v.motifSchema), ctrl.annuler);
router.post('/:id/preuve', enregistrer, id, recevoirFichier('justificatif'), ctrl.preuve);

module.exports = router;
