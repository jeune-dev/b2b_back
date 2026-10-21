'use strict';

const asyncHandler = require('../../../middlewares/asyncHandler.js');
const { ok, created, paginated } = require('../../../utils/response.js');
const S = require('../service/partenariat.service.js');
const Invitations = require('../service/invitationPartenaire.service.js');
const Annuaire = require('../service/annuaire.service.js');
const Situation = require('../../situation/service/situation.service.js');

exports.lister = asyncHandler(async (req, res) =>
  paginated(res, await S.lister(req.companyId, req.query, req.pagination), req.pagination));

exports.detail = asyncHandler(async (req, res) => ok(res, { partnership: await S.detail(req.params.id, req.companyId) }));

exports.demander = asyncHandler(async (req, res) =>
  created(res, { partnership: await S.demander(req.user, req.companyId, req.body) }, 'Demande de partenariat envoyée'));

exports.modifier = asyncHandler(async (req, res) =>
  ok(res, { partnership: await S.modifier(req.params.id, req.companyId, req.body) }, 'Partenariat mis à jour'));

exports.accepter = asyncHandler(async (req, res) =>
  ok(res, { partnership: await S.accepter(req.user, req.params.id, req.companyId) }, 'Partenariat accepté'));

exports.refuser = asyncHandler(async (req, res) =>
  ok(res, { partnership: await S.refuser(req.user, req.params.id, req.companyId, req.body) }, 'Demande refusée'));

exports.suspendre = asyncHandler(async (req, res) =>
  ok(res, { partnership: await S.suspendre(req.user, req.params.id, req.companyId, req.body) }, 'Partenariat suspendu'));

exports.reactiver = asyncHandler(async (req, res) =>
  ok(res, { partnership: await S.reactiver(req.user, req.params.id, req.companyId) }, 'Partenariat réactivé'));

exports.releve = asyncHandler(async (req, res) =>
  ok(res, { statement: await Situation.releve(req.params.id, req.companyId, req.query) }));

exports.invitations = asyncHandler(async (req, res) =>
  paginated(res, await Invitations.lister(req.companyId, req.query, req.pagination), req.pagination));

exports.inviter = asyncHandler(async (req, res) =>
  created(res, await Invitations.creer(req.user, req.companyId, req.body), 'Invitation envoyée'));

exports.annulerInvitation = asyncHandler(async (req, res) => {
  await Invitations.annuler(req.params.id, req.companyId);
  return ok(res, null, 'Invitation annulée');
});

exports.annuaire = asyncHandler(async (req, res) =>
  paginated(res, await Annuaire.rechercher(req.companyId, req.query, req.pagination), req.pagination));

exports.profil = asyncHandler(async (req, res) => ok(res, { company: await Annuaire.profil(req.params.id, req.companyId) }));
