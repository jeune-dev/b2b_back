'use strict';

const asyncHandler = require('../../../middlewares/asyncHandler.js');
const { ok, created } = require('../../../utils/response.js');
const S = require('../service/modele.service.js');
const Rendu = require('../service/rendu.service.js');

exports.lister = asyncHandler(async (req, res) => ok(res, { templates: await S.lister(req.companyId, req.query) }));

exports.detail = asyncHandler(async (req, res) => ok(res, { template: await S.detail(req.params.id, req.companyId) }));

exports.creer = asyncHandler(async (req, res) =>
  created(res, { template: await S.creer(req.companyId, req.user, req.body, req.fichier || null) }, 'Modèle enregistré : il sera utilisé pour vos prochains documents'));

exports.archiver = asyncHandler(async (req, res) =>
  ok(res, { template: await S.archiver(req.params.id, req.companyId) }, 'Modèle archivé : le modèle standard s’applique'));

exports.reactiver = asyncHandler(async (req, res) =>
  ok(res, { template: await S.reactiver(req.params.id, req.companyId) }, 'Modèle réactivé'));

exports.apercu = asyncHandler(async (req, res) => {
  const { nom, contenu } = await Rendu.apercu(req.params.id, req.companyId);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nom}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  return res.send(contenu);
});
