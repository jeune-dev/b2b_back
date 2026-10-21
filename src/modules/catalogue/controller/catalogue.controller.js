'use strict';

const asyncHandler = require('../../../middlewares/asyncHandler.js');
const { ok, created, paginated } = require('../../../utils/response.js');
const Produits = require('../service/produit.service.js');
const Categories = require('../service/categorie.service.js');
const Listes = require('../service/listePrix.service.js');
const Stock = require('../service/stock.service.js');
const Import = require('../service/catalogueImport.service.js');
const { aujourdhui } = require('../../../utils/dates.js');

function envoyerCsv(res, nom, contenu) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  return res.send(contenu);
}

// ── Mon catalogue (fournisseur) ─────────────────────────────────────────────

exports.lister = asyncHandler(async (req, res) =>
  paginated(res, await Produits.lister(req.companyId, req.query, req.pagination), req.pagination));

exports.detail = asyncHandler(async (req, res) => ok(res, { product: await Produits.detail(req.params.id, req.companyId) }));

exports.creer = asyncHandler(async (req, res) =>
  created(res, { product: await Produits.creer(req.companyId, req.user, req.body) }, 'Produit ajouté'));

exports.modifier = asyncHandler(async (req, res) =>
  ok(res, { product: await Produits.modifier(req.params.id, req.companyId, req.body, req.user) }, 'Produit modifié'));

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

// ── Stock ───────────────────────────────────────────────────────────────────

exports.mouvementStock = asyncHandler(async (req, res) => {
  await Stock.ajuster(req.params.id, req.companyId, req.user, req.body);
  return created(res, { product: await Produits.detail(req.params.id, req.companyId) }, 'Stock mis à jour');
});

exports.mouvementsStock = asyncHandler(async (req, res) =>
  paginated(res, await Stock.mouvements(req.params.id, req.companyId, req.pagination), req.pagination));

exports.alertesStock = asyncHandler(async (req, res) => ok(res, { products: await Stock.alertes(req.companyId) }));

// ── Import / export CSV ─────────────────────────────────────────────────────

exports.exporter = asyncHandler(async (req, res) => envoyerCsv(res, `catalogue-${aujourdhui()}.csv`, await Import.exporter(req.companyId)));

exports.modeleImport = asyncHandler(async (req, res) => envoyerCsv(res, 'modele-import-catalogue.csv', Import.modele()));

exports.importer = asyncHandler(async (req, res) => {
  const resume = await Import.importer(req.companyId, req.user, req.fichier, { simulation: req.body.simulation === true });
  return ok(res, { import: resume }, resume.simulation
    ? `Simulation : ${resume.created} produit(s) à créer, ${resume.updated} à mettre à jour`
    : `Catalogue importé : ${resume.created} produit(s) créé(s), ${resume.updated} mis à jour`);
});

// ── Listes de prix (tarifs par client ou groupe de clients) ─────────────────

exports.listesPrix = asyncHandler(async (req, res) => ok(res, { price_lists: await Listes.lister(req.companyId) }));

exports.listePrix = asyncHandler(async (req, res) => ok(res, { price_list: await Listes.detail(req.params.id, req.companyId) }));

exports.creerListePrix = asyncHandler(async (req, res) =>
  created(res, { price_list: await Listes.creer(req.companyId, req.user, req.body) }, 'Liste de prix créée'));

exports.modifierListePrix = asyncHandler(async (req, res) =>
  ok(res, { price_list: await Listes.modifier(req.params.id, req.companyId, req.body) }, 'Liste de prix modifiée'));

exports.supprimerListePrix = asyncHandler(async (req, res) => {
  await Listes.supprimer(req.params.id, req.companyId);
  return ok(res, null, 'Liste de prix supprimée : ses clients reviennent au prix catalogue');
});

// ── Catalogue d'un fournisseur (acheteur) ───────────────────────────────────

exports.catalogueFournisseur = asyncHandler(async (req, res) =>
  paginated(res, await Produits.catalogueFournisseur(req.companyId, req.params.supplierId, req.query, req.pagination), req.pagination));

exports.produitFournisseur = asyncHandler(async (req, res) =>
  ok(res, { product: await Produits.produitFournisseur(req.companyId, req.params.supplierId, req.params.id) }));

exports.categoriesFournisseur = asyncHandler(async (req, res) =>
  ok(res, { categories: await Categories.listerPourAcheteur(req.companyId, req.params.supplierId) }));
