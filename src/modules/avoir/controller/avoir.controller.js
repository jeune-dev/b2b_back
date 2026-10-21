'use strict';

const asyncHandler = require('../../../middlewares/asyncHandler.js');
const { ok, created, paginated } = require('../../../utils/response.js');
const S = require('../service/avoir.service.js');
const Rendu = require('../../modele/service/rendu.service.js');

exports.lister = asyncHandler(async (req, res) =>
  paginated(res, await S.lister(req.companyId, req.query, req.pagination), req.pagination));

exports.detail = asyncHandler(async (req, res) => ok(res, { credit_note: await S.detail(req.params.id, req.companyId) }));

exports.emettre = asyncHandler(async (req, res) =>
  created(res, { credit_note: await S.emettreSurFacture(req.companyId, req.user, req.body) }, 'Avoir émis et transmis au client'));

exports.annuler = asyncHandler(async (req, res) =>
  ok(res, { credit_note: await S.annuler(req.params.id, req.companyId, req.user, req.body) }, 'Avoir annulé'));

/** Avoir au format PDF, au modèle de facture du fournisseur. */
exports.pdf = asyncHandler(async (req, res) => {
  const { avoir, lignes } = await S.pourPdf(req.params.id, req.companyId);
  const { nom, contenu } = await Rendu.avoir(avoir, lignes);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nom}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  return res.send(contenu);
});
