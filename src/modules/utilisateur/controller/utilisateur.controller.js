'use strict';

const asyncHandler = require('../../../middlewares/asyncHandler.js');
const { ok, created, paginated } = require('../../../utils/response.js');
const S = require('../service/utilisateur.service.js');

exports.lister = asyncHandler(async (req, res) =>
  paginated(res, await S.lister(req.companyId, req.query, req.pagination), req.pagination));

exports.detail = asyncHandler(async (req, res) => ok(res, { member: await S.detail(req.params.id, req.companyId) }));

exports.changerRole = asyncHandler(async (req, res) =>
  ok(res, { member: await S.changerRole(req.user, req.params.id, req.companyId, req.body) }, 'Rôle modifié'));

exports.desactiver = asyncHandler(async (req, res) =>
  ok(res, { member: await S.desactiver(req.user, req.params.id, req.companyId, req.body) }, 'Utilisateur désactivé'));

exports.reactiver = asyncHandler(async (req, res) =>
  ok(res, { member: await S.reactiver(req.params.id, req.companyId) }, 'Utilisateur réactivé'));

exports.invitations = asyncHandler(async (req, res) =>
  paginated(res, await S.listerInvitations(req.companyId, req.query, req.pagination), req.pagination));

exports.inviter = asyncHandler(async (req, res) =>
  created(res, await S.inviter(req.user, req.companyId, req.body), 'Invitation envoyée'));

exports.renvoyer = asyncHandler(async (req, res) =>
  created(res, await S.renvoyerInvitation(req.user, req.params.id, req.companyId), 'Invitation renvoyée'));

exports.revoquer = asyncHandler(async (req, res) => {
  await S.revoquerInvitation(req.params.id, req.companyId);
  return ok(res, null, 'Invitation annulée');
});
