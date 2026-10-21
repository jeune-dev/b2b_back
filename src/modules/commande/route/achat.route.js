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
const { Joi, paramId, pagination } = require('../../../validations/common.js');
const v = require('../validation/commande.validation.js');

/**
 * Commandes côté ACHETEUR (§ 9, § 11, § 13, § 18). Profil acheteur (ou mixte)
 * exigé ; chaque commande désignée doit être une commande de l'entreprise EN
 * TANT QU'ACHETEUSE (`req.cote`).
 */
router.use(requireProfil('acheteur'), (req, res, next) => { req.cote = 'acheteur'; next(); });
const lire = requirePermission(P.ACHATS_LIRE);
const gerer = requirePermission(P.ACHATS_GERER);
const approuver = requirePermission(P.ACHATS_APPROUVER);
// § 13 — réception : responsable achats ou réceptionnaire.
const reception = requirePermission(P.RECEPTION_CONFIRMER);
const id = validate(paramId, 'params');
const livraison = validate(v.paramLivraison, 'params');

router.get('/', lire, validate(v.listeAchatsSchema, 'query'), paginate(), ctrl.listerAchats);
// Idempotence : un double envoi depuis le mobile ne crée pas deux bons de commande.
router.post('/', gerer, idempotence(), validate(v.creationSchema), ctrl.creer);
// Saisie accélérée : bon de commande importé d'un CSV « référence ; quantité ».
router.post('/import', gerer, recevoirFichier('tableur'), validate(v.importSchema), idempotence(), ctrl.importer);
// Circuit d'approbation interne : bons attendant MA décision.
router.get('/approbations', approuver, validate(Joi.object(pagination), 'query'), paginate(), ctrl.aApprouver);
router.get('/:id', lire, id, ctrl.detail);
router.patch('/:id', gerer, id, validate(v.modificationSchema), ctrl.modifier);
router.get('/:id/versions', lire, id, ctrl.versions);
router.get('/:id/historique', lire, id, ctrl.historique);
router.get('/:id/bon-de-commande.pdf', lire, rapportRateLimit, id, validate(v.pdfSchema, 'query'), ctrl.pdf);
router.post('/:id/envoyer', gerer, id, idempotence(), validate(v.revisionSchema), ctrl.envoyer);
router.post('/:id/approuver', approuver, id, idempotence(), validate(v.approbationSchema), ctrl.approuver);
router.post('/:id/rejeter-approbation', approuver, id, validate(v.rejetApprobationSchema), ctrl.rejeterApprobation);
router.post('/:id/recommander', gerer, id, idempotence(), ctrl.recommander);
router.post('/:id/accepter-proposition', gerer, id, idempotence(), validate(v.revisionSchema), ctrl.accepterProposition);
router.post('/:id/refuser-proposition', gerer, id, validate(v.motifSchema), ctrl.refuserProposition);
router.post('/:id/demander-modification', gerer, id, validate(v.demandeModificationSchema), ctrl.demanderModification);
router.post('/:id/annuler', gerer, id, validate(v.motifSchema), ctrl.annuler);
router.post('/:id/confirmer-reception', reception, id, idempotence(), validate(v.receptionSchema), ctrl.confirmerReception);
// Livraisons partielles : réception livraison par livraison, bon de livraison, reliquat.
router.get('/:id/livraisons', lire, id, ctrl.livraisons);
router.post('/:id/livraisons/:livraisonId/reception', reception, livraison, idempotence(), validate(v.receptionSchema), ctrl.receptionnerLivraison);
router.get('/:id/livraisons/:livraisonId/bon-de-livraison.pdf', lire, rapportRateLimit, livraison, ctrl.pdfLivraison);
router.post('/:id/solder-reliquat', gerer, id, validate(v.motifSchema), ctrl.solderReliquat);
router.post('/:id/commentaires', lire, id, validate(v.commentaireSchema), ctrl.commenter);
router.post('/:id/pieces-jointes', requirePermission(P.DOCUMENTS_ECRIRE), id, recevoirFichier('document'), validate(v.pieceJointeSchema), idempotence(), ctrl.joindre);

module.exports = router;
