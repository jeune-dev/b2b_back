'use strict';

const asyncHandler = require('../../../middlewares/asyncHandler.js');
const { ok, created, paginated } = require('../../../utils/response.js');
const S = require('../service/plateforme.service.js');

exports.parametres = asyncHandler(async (req, res) => ok(res, { settings: await S.listerParametres() }));

exports.modifierParametre = asyncHandler(async (req, res) =>
  ok(res, { setting: await S.modifierParametre(req.user, req.params.cle, req.body) }, 'Paramètre modifié'));

exports.diffuser = asyncHandler(async (req, res) =>
  created(res, { diffusion: await S.diffuser(req.body) }, 'Notification diffusée'));

exports.diffusions = asyncHandler(async (req, res) =>
  paginated(res, await S.historiqueDiffusions(req.pagination), req.pagination));

exports.journal = asyncHandler(async (req, res) =>
  paginated(res, await S.journal(req.query, req.pagination), req.pagination));

exports.roles = asyncHandler(async (req, res) => ok(res, await S.roles()));
