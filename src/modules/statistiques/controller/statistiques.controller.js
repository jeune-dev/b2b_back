'use strict';

const asyncHandler = require('../../../middlewares/asyncHandler.js');
const { ok } = require('../../../utils/response.js');
const { aujourdhui } = require('../../../utils/dates.js');
const S = require('../service/statistiques.service.js');

exports.achats = asyncHandler(async (req, res) => ok(res, { statistics: await S.achats(req.companyId, req.query) }));

exports.ventes = asyncHandler(async (req, res) => ok(res, { statistics: await S.ventes(req.companyId, req.query) }));

exports.exporter = asyncHandler(async (req, res) => {
  const csv = await S.exporter(req.companyId, req.params.type, req.query);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="pro2link-${req.params.type}-${aujourdhui()}.csv"`);
  res.setHeader('Cache-Control', 'private, no-store');
  return res.send(csv);
});
