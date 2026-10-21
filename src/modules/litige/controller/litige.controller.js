'use strict';

const asyncHandler = require('../../../middlewares/asyncHandler.js');
const { ok, created, paginated } = require('../../../utils/response.js');
const S = require('../service/litige.service.js');

exports.lister = asyncHandler(async (req, res) =>
  paginated(res, await S.lister(req.companyId, req.query, req.pagination), req.pagination));

exports.detail = asyncHandler(async (req, res) => ok(res, { claim: await S.detail(req.params.id, req.companyId) }));

exports.ouvrir = asyncHandler(async (req, res) =>
  created(res, { claim: await S.ouvrir(req.companyId, req.user, req.body) }, 'Litige ouvert : le fournisseur est averti'));

exports.accepter = asyncHandler(async (req, res) =>
  ok(res, { claim: await S.accepter(req.params.id, req.companyId, req.user, req.body) }, 'Litige accepté : avoir émis'));

exports.refuser = asyncHandler(async (req, res) =>
  ok(res, { claim: await S.refuser(req.params.id, req.companyId, req.user, req.body) }, 'Litige refusé'));

exports.annuler = asyncHandler(async (req, res) =>
  ok(res, { claim: await S.annuler(req.params.id, req.companyId, req.user, req.body) }, 'Litige retiré'));

exports.joindre = asyncHandler(async (req, res) =>
  created(res, { claim: await S.joindre(req.params.id, req.companyId, req.user, req.fichier) }, 'Pièce jointe ajoutée'));
