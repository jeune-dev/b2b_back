'use strict';

const { pipeline } = require('stream');
const asyncHandler = require('../../../middlewares/asyncHandler.js');
const { ok, created, paginated } = require('../../../utils/response.js');
const logger = require('../../../utils/logger.js');
const S = require('../service/facture.service.js');
const Relances = require('../service/relance.service.js');
const Rendu = require('../../modele/service/rendu.service.js');
const Documents = require('../../document/service/document.service.js');

exports.lister = asyncHandler(async (req, res) =>
  paginated(res, await S.lister(req.companyId, req.query, req.pagination), req.pagination));

exports.detail = asyncHandler(async (req, res) => ok(res, { invoice: await S.detail(req.params.id, req.companyId) }));

exports.emettre = asyncHandler(async (req, res) => {
  const facture = await S.emettre(req.companyId, req.user, req.body, req.fichier || null);
  return created(res, { invoice: facture }, facture.match_status === 'ecart'
    ? 'Facture émise avec un écart de rapprochement : son paiement attend la validation du client'
    : 'Facture émise et transmise au client');
});

exports.annuler = asyncHandler(async (req, res) =>
  ok(res, { invoice: await S.annuler(req.params.id, req.companyId, req.user, req.body) }, 'Facture annulée'));

exports.accepterEcart = asyncHandler(async (req, res) =>
  ok(res, { invoice: await S.deciderEcart(req.params.id, req.companyId, req.user, { ...req.body, decision: 'accepte' }) }, 'Écart accepté : la facture est payable'));

exports.contester = asyncHandler(async (req, res) =>
  ok(res, { invoice: await S.deciderEcart(req.params.id, req.companyId, req.user, { ...req.body, decision: 'conteste' }) }, 'Facture contestée : le fournisseur est averti'));

exports.relances = asyncHandler(async (req, res) => ok(res, await Relances.historique(req.params.id, req.companyId)));

exports.relancer = asyncHandler(async (req, res) =>
  created(res, await Relances.relancer(req.params.id, req.companyId, req.user), 'Relance envoyée au client'));

/**
 * § 14 « consulter la facture, télécharger la facture » : PDF généré au
 * modèle du fournisseur, ou fichier transmis par le fournisseur.
 */
exports.pdf = asyncHandler(async (req, res) => {
  const resultat = await Rendu.facture(req.params.id, req.companyId);
  res.setHeader('Cache-Control', 'private, no-store');
  if (resultat.importee) {
    const { objet, mime, disposition } = await Documents.ouvrirFichier(resultat.importee, req.companyId);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', disposition);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return pipeline(objet.stream, res, (err) => {
      if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') logger.warn('[facture] Transfert interrompu', { invoice_id: req.params.id, error: err.message });
    });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${resultat.nom}"`);
  return res.send(resultat.contenu);
});
