'use strict';

const router = require('express').Router();
const ctrl = require('../controller/partenaire.controller.js');
const validate = require('../../../middlewares/validate.middleware.js');
const paginate = require('../../../middlewares/pagination.middleware.js');
const { requirePermission } = require('../../../middlewares/acces.middleware.js');
const { mutationRateLimit } = require('../../../middlewares/rateLimit.middleware.js');
const { P } = require('../../../config/permissions.js');
const { paramId } = require('../../../validations/common.js');
const v = require('../validation/partenaire.validation.js');

// § 7 — fournisseurs et clients : liste, demande, réponse, suspension, relevé.
const lire = requirePermission(P.PARTENAIRES_LIRE);
const gerer = requirePermission(P.PARTENAIRES_GERER);
const id = validate(paramId, 'params');

router.get('/', lire, validate(v.listeSchema, 'query'), paginate(), ctrl.lister);
router.post('/', gerer, validate(v.demandeSchema), ctrl.demander);
// Invitation d'une entreprise qui n'est pas encore sur Pro2Link (lien d'inscription par e-mail).
router.get('/invitations', gerer, validate(v.invitationsSchema, 'query'), paginate(), ctrl.invitations);
router.post('/invitations', gerer, mutationRateLimit, validate(v.invitationSchema), ctrl.inviter);
router.delete('/invitations/:id', gerer, id, ctrl.annulerInvitation);
router.get('/:id', lire, id, ctrl.detail);
router.patch('/:id', gerer, id, validate(v.modificationSchema), ctrl.modifier);
router.post('/:id/accepter', gerer, id, ctrl.accepter);
router.post('/:id/refuser', gerer, id, validate(v.motifFacultatifSchema), ctrl.refuser);
router.post('/:id/suspendre', gerer, id, validate(v.motifSchema), ctrl.suspendre);
router.post('/:id/reactiver', gerer, id, ctrl.reactiver);
// § 16 — relevé de compte : factures et paiements, solde progressif.
router.get('/:id/releve', requirePermission(P.FACTURES_LIRE), id, validate(v.releveSchema, 'query'), ctrl.releve);

module.exports = router;
