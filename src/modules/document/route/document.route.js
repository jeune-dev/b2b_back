'use strict';

const router = require('express').Router();
const ctrl = require('../controller/document.controller.js');
const validate = require('../../../middlewares/validate.middleware.js');
const paginate = require('../../../middlewares/pagination.middleware.js');
const { requirePermission } = require('../../../middlewares/acces.middleware.js');
const { P } = require('../../../config/permissions.js');
const { paramId } = require('../../../validations/common.js');
const v = require('../validation/document.validation.js');

/**
 * Documents — monté dans l'espace entreprise (routes.js). Le même document
 * peut être lu par les DEUX parties d'une commande, d'une facture ou d'un
 * paiement : le service applique la visibilité du document à chaque lecture.
 * Les téléversements passent par la route de leur ressource (logo, photo de
 * produit, pièce jointe de commande, preuve de paiement…).
 */
const id = validate(paramId, 'params');

router.get('/', requirePermission(P.DOCUMENTS_LIRE), validate(v.listeSchema, 'query'), paginate(), ctrl.lister);
router.get('/:id/fichier', requirePermission(P.DOCUMENTS_LIRE), id, validate(v.fichierSchema, 'query'), ctrl.fichier);
router.get('/:id/lien', requirePermission(P.DOCUMENTS_LIRE), id, validate(v.fichierSchema, 'query'), ctrl.lien);
router.delete('/:id', requirePermission(P.DOCUMENTS_ECRIRE), id, ctrl.supprimer);

module.exports = router;
