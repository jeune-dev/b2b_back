'use strict';

const asyncHandler = require('../../../middlewares/asyncHandler.js');
const { ok, paginated } = require('../../../utils/response.js');
const S = require('../service/entreprises.service.js');

exports.lister = asyncHandler(async (req, res) =>
  paginated(res, await S.lister(req.query, req.pagination), req.pagination));

exports.detail = asyncHandler(async (req, res) => ok(res, { company: await S.detail(req.params.id) }));

exports.suspendre = asyncHandler(async (req, res) =>
  ok(res, { company: await S.suspendre(req.params.id, req.body) }, 'Entreprise suspendue'));

exports.reactiver = asyncHandler(async (req, res) =>
  ok(res, { company: await S.reactiver(req.params.id) }, 'Entreprise réactivée'));
