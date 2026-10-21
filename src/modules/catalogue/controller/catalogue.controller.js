'use strict';

const asyncHandler = require('../../../middlewares/asyncHandler.js');
const { ok, created, paginated } = require('../../../utils/response.js');
const Produits = require('../service/produit.service.js');
const Categories = require('../service/categorie.service.js');

// ── Mon catalogue (fournisseur) ─────────────────────────────────────────────

exports.lister = asyncHandler(async (req, res) =>
  paginated(res, await Produits.lister(req.companyId, req.query, req.pagination), req.pagination));

exports.detail = asyncHandler(async (req, res) => ok(res, { product: await Produits.detail(req.params.id, req.companyId) }));

exports.creer = asyncHandler(async (req, res) =>
  created(res, { product: await Produits.creer(req.companyId, req.user, req.body) }, 'Produit ajouté'));

exports.modifier = asyncHandler(async (req, res) =>
  ok(res, { product: await Produits.modifier(req.params.id, req.companyId, req.body) }, 'Produit modifié'));

exports.activer = asyncHandler(async (req, res) =>
  ok(res, { product: await Produits.changerActivation(req.params.id, req.companyId, true) }, 'Produit activé'));

exports.desactiver = asyncHandler(async (req, res) =>
  ok(res, { product: await Produits.changerActivation(req.params.id, req.companyId, false) }, 'Produit désactivé'));

exports.supprimer = asyncHandler(async (req, res) => {
  await Produits.supprimer(req.params.id, req.companyId);
  return ok(res, null, 'Produit supprimé');
});

exports.changerPhoto = asyncHandler(async (req, res) =>
  created(res, { product: await Produits.changerPhoto(req.params.id, req.companyId, req.user, req.fichier) }, 'Photo enregistrée'));

exports.supprimerPhoto = asyncHandler(async (req, res) =>
  ok(res, { product: await Produits.supprimerPhoto(req.params.id, req.companyId) }, 'Photo supprimée'));

exports.categories = asyncHandler(async (req, res) => ok(res, { categories: await Categories.lister(req.companyId) }));

exports.creerCategorie = asyncHandler(async (req, res) =>
  created(res, { category: await Categories.creer(req.companyId, req.body) }, 'Catégorie créée'));

exports.modifierCategorie = asyncHandler(async (req, res) =>
  ok(res, { category: await Categories.modifier(req.params.id, req.companyId, req.body) }, 'Catégorie modifiée'));

exports.supprimerCategorie = asyncHandler(async (req, res) => {
  await Categories.supprimer(req.params.id, req.companyId);
  return ok(res, null, 'Catégorie supprimée');
});

// ── Catalogue d'un fournisseur (acheteur) ───────────────────────────────────

exports.catalogueFournisseur = asyncHandler(async (req, res) =>
  paginated(res, await Produits.catalogueFournisseur(req.companyId, req.params.supplierId, req.query, req.pagination), req.pagination));

exports.produitFournisseur = asyncHandler(async (req, res) =>
  ok(res, { product: await Produits.produitFournisseur(req.companyId, req.params.supplierId, req.params.id) }));

exports.categoriesFournisseur = asyncHandler(async (req, res) =>
  ok(res, { categories: await Categories.listerPourAcheteur(req.companyId, req.params.supplierId) }));
