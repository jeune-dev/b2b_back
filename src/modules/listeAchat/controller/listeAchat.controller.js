'use strict';

const asyncHandler = require('../../../middlewares/asyncHandler.js');
const { ok, created, paginated } = require('../../../utils/response.js');
const S = require('../service/listeAchat.service.js');

exports.lister = asyncHandler(async (req, res) =>
  paginated(res, await S.lister(req.companyId, req.query, req.pagination), req.pagination));

exports.detail = asyncHandler(async (req, res) => ok(res, { purchase_list: await S.detail(req.params.id, req.companyId) }));

exports.creer = asyncHandler(async (req, res) =>
  created(res, { purchase_list: await S.creer(req.companyId, req.user, req.body) }, "Liste d'achat créée"));

exports.modifier = asyncHandler(async (req, res) =>
  ok(res, { purchase_list: await S.modifier(req.params.id, req.companyId, req.body) }, "Liste d'achat modifiée"));

exports.supprimer = asyncHandler(async (req, res) => {
  await S.supprimer(req.params.id, req.companyId);
  return ok(res, null, "Liste d'achat supprimée");
});

exports.commander = asyncHandler(async (req, res) => {
  const { commande, lignes_ecartees: ecartees } = await S.commander(req.params.id, req.companyId, req.user, req.body);
  return created(res, { order: commande, skipped_lines: ecartees }, ecartees.length
    ? `Bon de commande créé (${ecartees.length} produit(s) écarté(s))`
    : 'Bon de commande créé à partir de la liste');
});
