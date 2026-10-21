'use strict';

const asyncHandler = require('../../../middlewares/asyncHandler.js');
const { ok, created } = require('../../../utils/response.js');
const S = require('../service/entreprise.service.js');

exports.detail = asyncHandler(async (req, res) => ok(res, await S.detail(req.companyId)));

exports.modifier = asyncHandler(async (req, res) =>
  ok(res, { company: await S.modifier(req.companyId, req.body) }, 'Entreprise mise à jour'));

exports.modifierParametres = asyncHandler(async (req, res) =>
  ok(res, { settings: await S.modifierParametres(req.companyId, req.body) }, 'Paramètres enregistrés'));

exports.changerLogo = asyncHandler(async (req, res) =>
  created(res, { logo: await S.changerLogo(req.companyId, req.user, req.fichier) }, 'Logo enregistré'));

exports.supprimerLogo = asyncHandler(async (req, res) => {
  await S.supprimerLogo(req.companyId);
  return ok(res, null, 'Logo supprimé');
});
