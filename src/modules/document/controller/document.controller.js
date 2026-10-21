'use strict';

const { pipeline } = require('stream');
const asyncHandler = require('../../../middlewares/asyncHandler.js');
const { ok, paginated } = require('../../../utils/response.js');
const logger = require('../../../utils/logger.js');
const S = require('../service/document.service.js');

exports.lister = asyncHandler(async (req, res) =>
  paginated(res, await S.lister(req.companyId, req.query, req.pagination), req.pagination));

/**
 * Flux du fichier. Les en-têtes interdisent toute mise en cache partagée
 * (facture, preuve de paiement) et le « sniffing » du type par le navigateur
 * — le type servi est celui détecté à la réception par la signature binaire,
 * jamais celui annoncé par le client.
 */
exports.fichier = asyncHandler(async (req, res) => {
  const { objet, mime, disposition } = await S.ouvrirFichier(req.params.id, req.companyId, { miniature: req.query.taille === 'miniature' });
  res.status(200);
  res.setHeader('Content-Type', mime);
  if (Number.isFinite(objet.taille)) res.setHeader('Content-Length', String(objet.taille));
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', disposition);
  pipeline(objet.stream, res, (err) => {
    // En-têtes déjà partis : la réponse ne peut plus devenir une erreur JSON,
    // la connexion est simplement coupée (le client voit un transfert incomplet).
    if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
      logger.warn('[document] Transfert de fichier interrompu', { document_id: req.params.id, error: err.message });
    }
  });
});

exports.lien = asyncHandler(async (req, res) =>
  ok(res, await S.lienTemporaire(req.params.id, req.companyId, { miniature: req.query.taille === 'miniature' })));

exports.supprimer = asyncHandler(async (req, res) => {
  await S.supprimer(req.params.id, req.companyId);
  return ok(res, null, 'Document supprimé');
});
