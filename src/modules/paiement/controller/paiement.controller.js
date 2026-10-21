'use strict';

const asyncHandler = require('../../../middlewares/asyncHandler.js');
const { ok, created, paginated } = require('../../../utils/response.js');
const S = require('../service/paiement.service.js');

exports.lister = asyncHandler(async (req, res) =>
  paginated(res, await S.lister(req.companyId, req.query, req.pagination), req.pagination));

exports.detail = asyncHandler(async (req, res) => ok(res, { payment: await S.detail(req.params.id, req.companyId) }));

exports.enregistrer = asyncHandler(async (req, res) =>
  created(res, { payment: await S.enregistrer(req.companyId, req.user, req.body) }, 'Paiement enregistré'));

exports.confirmer = asyncHandler(async (req, res) =>
  ok(res, { payment: await S.confirmer(req.params.id, req.companyId, req.user, req.body) }, 'Paiement confirmé'));

exports.rejeter = asyncHandler(async (req, res) =>
  ok(res, { payment: await S.rejeter(req.params.id, req.companyId, req.user, req.body) }, 'Paiement rejeté'));

exports.annuler = asyncHandler(async (req, res) =>
  ok(res, { payment: await S.annuler(req.params.id, req.companyId, req.user, req.body) }, 'Paiement annulé'));

exports.preuve = asyncHandler(async (req, res) =>
  created(res, { payment: await S.ajouterPreuve(req.params.id, req.companyId, req.user, req.fichier) }, 'Preuve de paiement ajoutée'));
