'use strict';

const router = require('express').Router();
const asyncHandler = require('../../../middlewares/asyncHandler.js');
const { BadRequestError } = require('../../../errors/AppError.js');
const abonnement = require('../../abonnement/service/abonnement.service.js');

/**
 * Webhooks publics (routes.js : limite de débit dédiée, aucun jeton).
 *
 * § 25 — IPN PayDunya du paiement d'un abonnement (identifiants de la
 * plateforme). Corps x-www-form-urlencoded ; son contenu n'est PAS cru : la
 * facture est relue chez PayDunya (statut, montant, référence).
 */
router.post('/abonnement/paydunya', asyncHandler(async (req, res) => {
  const resultat = await abonnement.traiterIpnPaydunya(req.body);
  if (!resultat.ok) throw new BadRequestError('Notification refusée', 'NOTIFICATION_REFUSEE');
  res.json({ success: true, message: 'Notification traitée' });
}));

module.exports = router;
