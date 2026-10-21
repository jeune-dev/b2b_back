'use strict';

const router = require('express').Router();
const ctrl = require('../controller/catalogue.controller.js');
const validate = require('../../../middlewares/validate.middleware.js');
const paginate = require('../../../middlewares/pagination.middleware.js');
const idempotence = require('../../../middlewares/idempotence.middleware.js');
const { recevoirFichier } = require('../../../middlewares/upload.middleware.js');
const { rapportRateLimit } = require('../../../middlewares/rateLimit.middleware.js');
const { requirePermission, requireProfil } = require('../../../middlewares/acces.middleware.js');
const { P } = require('../../../config/permissions.js');
const { paramId } = require('../../../validations/common.js');
const v = require('../validation/catalogue.validation.js');

// § 8 — catalogue du fournisseur (profil fournisseur ou mixte).
router.use(requireProfil('fournisseur'));
const lire = requirePermission(P.CATALOGUE_LIRE);
const gerer = requirePermission(P.PRODUITS_GERER);
const id = validate(paramId, 'params');

router.get('/', lire, validate(v.listeSchema, 'query'), paginate(), ctrl.lister);
router.post('/', gerer, validate(v.creationSchema), ctrl.creer);
// Import / export du catalogue (CSV Excel) : la référence identifie le produit.
router.get('/export.csv', lire, rapportRateLimit, ctrl.exporter);
router.get('/import/modele.csv', gerer, ctrl.modeleImport);
router.post('/import', gerer, recevoirFichier('tableur'), validate(v.importSchema), idempotence(), ctrl.importer);
// Produits en rupture ou sous leur seuil d'alerte.
router.get('/stock/alertes', lire, ctrl.alertesStock);
router.get('/:id', lire, id, ctrl.detail);
router.patch('/:id', gerer, id, validate(v.modificationSchema), ctrl.modifier);
// Raccourcis mobiles : « modifier son prix », « modifier sa disponibilité ».
router.patch('/:id/prix', gerer, id, validate(v.prixSchema), ctrl.modifier);
router.patch('/:id/disponibilite', gerer, id, validate(v.disponibiliteSchema), ctrl.modifier);
router.post('/:id/activer', gerer, id, ctrl.activer);
router.post('/:id/desactiver', gerer, id, ctrl.desactiver);
router.post('/:id/photo', gerer, id, recevoirFichier('image'), ctrl.changerPhoto);
router.delete('/:id/photo', gerer, id, ctrl.supprimerPhoto);
// Stock : entrée, inventaire, historique des mouvements.
router.post('/:id/stock', gerer, id, idempotence(), validate(v.stockSchema), ctrl.mouvementStock);
router.get('/:id/mouvements-stock', lire, id, validate(v.mouvementsSchema, 'query'), paginate(), ctrl.mouvementsStock);
router.delete('/:id', gerer, id, ctrl.supprimer);

module.exports = router;
