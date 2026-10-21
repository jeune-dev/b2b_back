'use strict';

const asyncHandler = require('../../../middlewares/asyncHandler.js');
const { ok } = require('../../../utils/response.js');
const S = require('../service/dashboard.service.js');

exports.tableauDeBord = asyncHandler(async (req, res) => ok(res, { dashboard: await S.tableauDeBord(req.companyId, req.user.id) }));
