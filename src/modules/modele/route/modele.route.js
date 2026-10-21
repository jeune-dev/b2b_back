'use strict';

const router = require('express').Router();
const ctrl = require('../controller/modele.controller.js');
const validate = require('../../../middlewares/validate.middleware.js');
const { recevoirFichier } = require('../../../middlewares/upload.middleware.js');
const { rapportRateLimit } = require('../../../middlewares/rateLimit.middleware.js');
const { requirePermission } = require('../../../middlewares/acces.middleware.js');
const { exigerFonctionnalite } = require('../../../middlewares/abonnement.middleware.js');
const { P } = require('../../../config/permissions.js');
const { paramId } = require('../../../validations/common.js');
const v = require('../validation/modele.validation.js');

// § 15 — modèles de bon de commande et de facture (fonctionnalité du forfait).
router.use(requirePermission(P.MODELES_GERER), exigerFonctionnalite('modeles_documents'));
const id = validate(paramId, 'params');

router.get('/', validate(v.listeSchema, 'query'), ctrl.lister);
// Papier à en-tête facultatif : image A4 (JPEG, PNG ou WebP), champ « fichier ».
router.post('/', recevoirFichier('image', { obligatoire: false }), validate(v.creationSchema), ctrl.creer);
router.get('/:id', id, ctrl.detail);
router.get('/:id/apercu.pdf', rapportRateLimit, id, ctrl.apercu);
router.post('/:id/archiver', id, ctrl.archiver);
router.post('/:id/reactiver', id, ctrl.reactiver);

module.exports = router;
