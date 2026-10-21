'use strict';

const router = require('express').Router();
const ctrl = require('../controller/commande.controller.js');
const validate = require('../../../middlewares/validate.middleware.js');
const paginate = require('../../../middlewares/pagination.middleware.js');
const idempotence = require('../../../middlewares/idempotence.middleware.js');
const { recevoirFichier } = require('../../../middlewares/upload.middleware.js');
const { rapportRateLimit } = require('../../../middlewares/rateLimit.middleware.js');
const { requirePermission, requireProfil } = require('../../../middlewares/acces.middleware.js');
const { P } = require('../../../config/permissions.js');
const { paramId } = require('../../../validations/common.js');
const v = require('../validation/commande.validation.js');

/**
 * Commandes côté FOURNISSEUR (§ 10, § 12, § 13, § 19). Profil fournisseur
 * (ou mixte) exigé ; chaque commande désignée doit être une commande reçue
 * par l'entreprise (`req.cote`). Un brouillon de client n'existe pas ici.
 */
router.use(requireProfil('fournisseur'), (req, res, next) => { req.cote = 'fournisseur'; next(); });
const lire = requirePermission(P.VENTES_LIRE);
const traiter = requirePermission(P.VENTES_TRAITER);
const id = validate(paramId, 'params');

router.get('/', lire, validate(v.listeVentesSchema, 'query'), paginate(), ctrl.listerVentes);
router.get('/:id', lire, id, ctrl.detail);
router.get('/:id/versions', lire, id, ctrl.versions);
router.get('/:id/historique', lire, id, ctrl.historique);
router.get('/:id/bon-de-commande.pdf', lire, rapportRateLimit, id, validate(v.pdfSchema, 'query'), ctrl.pdf);
router.post('/:id/prendre-en-charge', traiter, id, validate(v.revisionSchema), ctrl.prendreEnCharge);
// § 10 option 1 — accepter telle quelle ; option 2 — proposer une version modifiée.
router.post('/:id/accepter', traiter, id, idempotence(), validate(v.acceptationSchema), ctrl.accepter);
router.post('/:id/proposer', traiter, id, idempotence(), validate(v.propositionSchema), ctrl.proposer);
router.post('/:id/refuser', traiter, id, validate(v.motifSchema), ctrl.refuser);
// § 12 — statuts opérationnels : en préparation, prête.
router.post('/:id/statut', traiter, id, validate(v.statutSchema), ctrl.statut);
// § 13 — livraison, avec bon de livraison facultatif (photo ou PDF).
router.post('/:id/livrer', traiter, id, recevoirFichier('justificatif', { obligatoire: false }), validate(v.livraisonSchema), idempotence(), ctrl.livrer);
router.post('/:id/annuler', traiter, id, validate(v.motifSchema), ctrl.annuler);
router.post('/:id/commentaires', lire, id, validate(v.commentaireSchema), ctrl.commenter);
router.post('/:id/pieces-jointes', requirePermission(P.DOCUMENTS_ECRIRE), id, recevoirFichier('document'), validate(v.pieceJointeSchema), idempotence(), ctrl.joindre);

module.exports = router;
