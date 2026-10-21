'use strict';

const router = require('express').Router();
const ctrl = require('../controller/facture.controller.js');
const validate = require('../../../middlewares/validate.middleware.js');
const paginate = require('../../../middlewares/pagination.middleware.js');
const idempotence = require('../../../middlewares/idempotence.middleware.js');
const { recevoirFichier } = require('../../../middlewares/upload.middleware.js');
const { rapportRateLimit, mutationRateLimit } = require('../../../middlewares/rateLimit.middleware.js');
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
// Rapprochement commande / réception / facture : décision de l'acheteur sur un écart.
const deciderEcart = [requireProfil('acheteur'), requirePermission(P.PAIEMENTS_ENREGISTRER)];
router.post('/:id/accepter-ecart', ...deciderEcart, id, validate(v.ecartSchema), ctrl.accepterEcart);
router.post('/:id/contester', ...deciderEcart, id, validate(v.contestationSchema), ctrl.contester);
// Relances des impayés : historique (deux parties), relance manuelle (fournisseur).
router.get('/:id/relances', lire, id, ctrl.relances);
router.post('/:id/relancer', ...emettre, mutationRateLimit, id, ctrl.relancer);

module.exports = router;
