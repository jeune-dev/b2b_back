'use strict';

const asyncHandler = require('../../../middlewares/asyncHandler.js');
const { ok } = require('../../../utils/response.js');
const S = require('../service/situation.service.js');

exports.dettes = asyncHandler(async (req, res) => ok(res, { payables: await S.dettes(req.companyId) }));

exports.creances = asyncHandler(async (req, res) => ok(res, { receivables: await S.creances(req.companyId) }));
