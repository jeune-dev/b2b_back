'use strict';

const router = require('express').Router();
const ctrl = require('../controller/facture.controller.js');
const validate = require('../../../middlewares/validate.middleware.js');
const paginate = require('../../../middlewares/pagination.middleware.js');
const idempotence = require('../../../middlewares/idempotence.middleware.js');
const { recevoirFichier } = require('../../../middlewares/upload.middleware.js');
const { rapportRateLimit } = require('../../../middlewares/rateLimit.middleware.js');
const { requirePermission, requireProfil } = require('../../../middlewares/acces.middleware.js');
const { P } = require('../../../config/permissions.js');
const { paramId } = require('../../../validations/common.js');
const v = require('../validation/facture.validation.js');

// § 14 — factures émises (fournisseur) et reçues (acheteur).
const lire = requirePermission(P.FACTURES_LIRE);
const emettre = [requireProfil('fournisseur'), requirePermission(P.FACTURES_EMETTRE)];
const id = validate(paramId, 'params');

router.get('/', lire, validate(v.listeSchema, 'query'), paginate(), ctrl.lister);
// Facture générée (JSON) ou transmise (multipart avec le fichier du fournisseur, champ « fichier »).
router.post('/', ...emettre, recevoirFichier('justificatif', { obligatoire: false }), validate(v.emissionSchema), idempotence(), ctrl.emettre);
router.get('/:id', lire, id, ctrl.detail);
router.get('/:id/pdf', lire, rapportRateLimit, id, ctrl.pdf);
router.post('/:id/annuler', ...emettre, id, validate(v.annulationSchema), ctrl.annuler);

module.exports = router;
