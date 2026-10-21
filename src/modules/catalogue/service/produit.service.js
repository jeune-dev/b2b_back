'use strict';

const { Op } = require('sequelize');
const sequelize = require('../../../config/db.js');
const {
  Product, ProductCategory, Document, Company, ProductPriceTier,
} = require('../../../models/index.js');
const { ConflictError, NotFoundError } = require('../../../errors/AppError.js');
const { chargerPourEntreprise, verifierReference } = require('../../../utils/acces.js');
const { ordre, rechercheTexte } = require('../../../utils/liste.js');
const { transactionAvecFichiers } = require('../../../database/transaction.js');
const droits = require('../../abonnement/service/droits.service.js');
const documents = require('../../document/service/document.service.js');
const partenariats = require('../../partenaire/service/partenariat.service.js');
const { journaliser, difference } = require('../../audit/service/audit.service.js');
const { synchroniser } = require('../../notification/service/notification.service.js');
const tarification = require('./tarification.service.js');
const stock = require('./stock.service.js');

/**
 * Catalogue produits (§ 8) : nom, référence, description, photo, unité, prix,
 * disponibilité, catégorie. Le fournisseur ajoute, modifie, désactive un
 * produit, change son prix et sa disponibilité ; l'acheteur consulte les
 * produits de ses fournisseurs (partenariat ACTIF exigé).
 *
 * Un produit n'est jamais supprimé physiquement : les commandes passées en
 * gardent un instantané (référence, désignation, prix) dans leurs lignes.
 */

const CHAMPS = [
  'category_id', 'reference', 'name', 'description', 'unit', 'packaging', 'price', 'tax_rate',
  'availability', 'stock_quantity', 'min_order_quantity', 'order_multiple', 'max_order_quantity', 'low_stock_threshold',
];

/** Données internes au fournisseur : jamais montrées à ses clients. */
const CHAMPS_INTERNES = ['created_by', 'stock_quantity', 'stock_reserved', 'low_stock_threshold', 'low_stock_notified_at'];

const INCLUDES = [
  { model: ProductCategory, as: 'category', attributes: ['id', 'name'] },
  {
    model: ProductPriceTier, as: 'priceTiers', attributes: ['min_quantity', 'discount_percent'], separate: true, order: [['min_quantity', 'ASC']],
  },
];

/** Représentation d'API (photo par URL authentifiée, jamais de clé de stockage). */
function versApi(produit) {
  const { priceTiers, ...p } = produit.toJSON();
  return {
    ...p,
    price_tiers: (priceTiers || []).map((t) => ({ min_quantity: Number(t.min_quantity), discount_percent: Number(t.discount_percent) })),
    ...(stock.estSuivi(p) && 'stock_reserved' in p ? { available_quantity: stock.disponible(p) } : {}),
    photo_url: p.photo_document_id ? `/api/v1/documents/${p.photo_document_id}/fichier` : null,
    photo_thumbnail_url: p.photo_document_id ? `/api/v1/documents/${p.photo_document_id}/fichier?taille=miniature` : null,
  };
}

function filtresListe(filtres) {
  const where = {};
  if (filtres.category_id) where.category_id = filtres.category_id;
  if (filtres.availability) where.availability = filtres.availability;
  const texte = rechercheTexte(filtres.q, ['name', 'reference', 'description']);
  if (texte) Object.assign(where, texte);
  return where;
}

// ── Catalogue du fournisseur ────────────────────────────────────────────────

async function lister(companyId, filtres, { limit, offset }) {
  const where = { company_id: companyId, ...filtresListe(filtres) };
  if (filtres.is_active !== undefined) where.is_active = filtres.is_active;
  const { rows, count } = await Product.findAndCountAll({
    where, include: INCLUDES, order: ordre(filtres.tri, 'name'), limit, offset,
  });
  return { rows: rows.map(versApi), count };
}

async function detail(id, companyId) {
  return versApi(await chargerPourEntreprise(Product, id, companyId, { include: INCLUDES }, 'Produit'));
}

async function referenceLibre(companyId, reference, sauf, t) {
  const pris = await Product.findOne({
    where: {
      company_id: companyId,
      [Op.and]: [sequelize.where(sequelize.fn('lower', sequelize.col('reference')), reference.toLowerCase())],
      ...(sauf ? { id: { [Op.ne]: sauf } } : {}),
    },
    attributes: ['id'],
    transaction: t,
  });
  if (pris) throw new ConflictError(`La référence « ${reference} » est déjà utilisée dans votre catalogue.`, 'REFERENCE_UTILISEE');
}

/** Clients actifs du fournisseur : leurs écrans de catalogue ouverts sont rafraîchis (§ 23). */
async function clientsActifs(companyId, t) {
  const [lignes] = await sequelize.query(
    "SELECT buyer_company_id FROM partnerships WHERE supplier_company_id = :companyId AND status = 'actif'",
    { replacements: { companyId }, transaction: t }
  );
  return lignes.map((l) => l.buyer_company_id);
}

/** Remises par paliers de quantité : la liste fournie REMPLACE les paliers existants. */
async function remplacerPaliers(t, produitId, paliers) {
  await ProductPriceTier.destroy({ where: { product_id: produitId }, transaction: t });
  if (paliers.length) {
    await ProductPriceTier.bulkCreate(paliers.map((p) => ({ product_id: produitId, min_quantity: p.min_quantity, discount_percent: p.discount_percent })), { transaction: t });
  }
}

async function creer(companyId, user, { price_tiers: paliers = [], ...donnees }) {
  return sequelize.transaction(async (t) => {
    await droits.verifierLimite(companyId, 'products', t);
    await verifierReference(ProductCategory, donnees.category_id, companyId, 'Catégorie', { transaction: t });
    await referenceLibre(companyId, donnees.reference, null, t);
    if (donnees.tax_rate === undefined) {
      const company = await Company.findByPk(companyId, { attributes: ['default_tax_rate'], transaction: t });
      donnees.tax_rate = Number(company.default_tax_rate);
    }
    const produit = await Product.create({ ...donnees, company_id: companyId, created_by: user.id }, { transaction: t });
    await remplacerPaliers(t, produit.id, paliers);
    await stock.tracerChangementFiche(t, produit, null, user);
    await stock.apresVariation(t, produit);
    await journaliser({
      action: 'produit.creation', entityType: 'product', entityId: produit.id, companyId,
      details: { reference: produit.reference, name: produit.name, price: Number(produit.price) },
    }, t);
    await synchroniser(t, [companyId, ...(await clientsActifs(companyId, t))], 'produit', { product_id: produit.id, supplier_company_id: companyId });
    return produit.id;
  }).then((id) => detail(id, companyId));
}

/**
 * Modification. Le prix et la disponibilité ont leur action d'audit propre
 * (§ 8 « modifier son prix », « modifier sa disponibilité ») : l'historique
 * des prix d'un produit se relit dans le journal.
 */
async function modifier(id, companyId, { price_tiers: paliers, ...donnees }, user = null) {
  await sequelize.transaction(async (t) => {
    const produit = await chargerPourEntreprise(Product, id, companyId, { transaction: t, lock: t.LOCK.UPDATE }, 'Produit');
    if (donnees.category_id) await verifierReference(ProductCategory, donnees.category_id, companyId, 'Catégorie', { transaction: t });
    if (donnees.reference && donnees.reference.toLowerCase() !== produit.reference.toLowerCase()) {
      await referenceLibre(companyId, donnees.reference, id, t);
    }
    const avant = { ...produit.toJSON(), price: Number(produit.price), tax_rate: Number(produit.tax_rate) };
    const stockAvant = stock.estSuivi(produit) ? Number(produit.stock_quantity) : null;
    await produit.update(donnees, { transaction: t, fields: CHAMPS });
    if ('stock_quantity' in donnees || 'low_stock_threshold' in donnees || 'availability' in donnees) {
      await stock.tracerChangementFiche(t, produit, stockAvant, user);
      await stock.apresVariation(t, produit);
    }
    if (paliers) {
      await remplacerPaliers(t, id, paliers);
      await journaliser({ action: 'produit.modification_prix', entityType: 'product', entityId: id, companyId, details: { paliers } }, t);
    }
    const diff = difference(avant, donnees, CHAMPS);
    if (diff.price || diff.tax_rate) {
      await journaliser({ action: 'produit.modification_prix', entityType: 'product', entityId: id, companyId, details: { price: diff.price, tax_rate: diff.tax_rate } }, t);
    }
    if (diff.availability) {
      await journaliser({ action: 'produit.modification_disponibilite', entityType: 'product', entityId: id, companyId, details: diff.availability }, t);
    }
    const autres = Object.fromEntries(Object.entries(diff).filter(([c]) => !['price', 'tax_rate', 'availability'].includes(c)));
    if (Object.keys(autres).length) {
      await journaliser({ action: 'produit.modification', entityType: 'product', entityId: id, companyId, details: autres }, t);
    }
    await synchroniser(t, [companyId, ...(await clientsActifs(companyId, t))], 'produit', { product_id: id, supplier_company_id: companyId });
  });
  return detail(id, companyId);
}

/** Activation / désactivation : un produit désactivé disparaît du catalogue des clients. */
async function changerActivation(id, companyId, actif) {
  await sequelize.transaction(async (t) => {
    const produit = await chargerPourEntreprise(Product, id, companyId, { transaction: t, lock: t.LOCK.UPDATE }, 'Produit');
    if (produit.is_active === actif) {
      throw new ConflictError(actif ? 'Ce produit est déjà actif.' : 'Ce produit est déjà désactivé.', 'STATUT_INCHANGE');
    }
    if (actif) await droits.verifierLimite(companyId, 'products', t);
    await produit.update({ is_active: actif }, { transaction: t });
    await journaliser({ action: 'produit.changement_statut', entityType: 'product', entityId: id, companyId, details: { is_active: actif } }, t);
    await synchroniser(t, [companyId, ...(await clientsActifs(companyId, t))], 'produit', { product_id: id, supplier_company_id: companyId });
  });
  return detail(id, companyId);
}

/** Suppression LOGIQUE : les lignes de commande passées gardent leur instantané. */
async function supprimer(id, companyId) {
  await sequelize.transaction(async (t) => {
    const produit = await chargerPourEntreprise(Product, id, companyId, { transaction: t, lock: t.LOCK.UPDATE }, 'Produit');
    await produit.destroy({ transaction: t });
    await journaliser({ action: 'produit.suppression', entityType: 'product', entityId: id, companyId, details: { reference: produit.reference, name: produit.name } }, t);
    await synchroniser(t, [companyId, ...(await clientsActifs(companyId, t))], 'produit', { product_id: id, supplier_company_id: companyId });
  });
}

/** Photo du produit (§ 8) : visible des clients au partenariat actif. */
async function changerPhoto(id, companyId, user, fichier) {
  await transactionAvecFichiers(async (t) => {
    const produit = await chargerPourEntreprise(Product, id, companyId, { transaction: t, lock: t.LOCK.UPDATE }, 'Produit');
    const document = await documents.creerDocument({
      companyId, entityType: 'product', entityId: id, category: 'photo', visibility: 'catalogue', fichier, uploadedBy: user.id,
    }, t);
    if (produit.photo_document_id) await Document.destroy({ where: { id: produit.photo_document_id }, transaction: t });
    await produit.update({ photo_document_id: document.id }, { transaction: t });
  });
  return detail(id, companyId);
}

async function supprimerPhoto(id, companyId) {
  await sequelize.transaction(async (t) => {
    const produit = await chargerPourEntreprise(Product, id, companyId, { transaction: t, lock: t.LOCK.UPDATE }, 'Produit');
    if (!produit.photo_document_id) return;
    const ancienne = produit.photo_document_id;
    await produit.update({ photo_document_id: null }, { transaction: t });
    await Document.destroy({ where: { id: ancienne }, transaction: t });
    await journaliser({ action: 'produit.suppression_photo', entityType: 'product', entityId: id, companyId, details: { document_id: ancienne } }, t);
  });
  return detail(id, companyId);
}

// ── Catalogue d'un fournisseur, vu par un acheteur ─────────────────────────

/**
 * § 8 « L'acheteur peut consulter les produits proposés par ses
 * fournisseurs » : produits ACTIFS d'un fournisseur au partenariat actif.
 */
/** Produit vu par un client : SES prix (liste de prix, paliers), sans données internes. */
function versApiClient(produit, ctx) {
  // Les paliers bruts sont remplacés par les paliers AU PRIX du client.
  const p = versApi(produit);
  delete p.price_tiers;
  return { ...p, ...tarification.prixAffiches(produit, ctx) };
}

async function catalogueFournisseur(buyerId, supplierId, filtres, { limit, offset }) {
  await partenariats.exigerActif(buyerId, supplierId);
  const where = { company_id: supplierId, is_active: true, ...filtresListe(filtres) };
  const { rows, count } = await Product.findAndCountAll({
    where,
    attributes: { exclude: CHAMPS_INTERNES },
    include: INCLUDES,
    order: ordre(filtres.tri, 'name'),
    limit,
    offset,
  });
  const ctx = await tarification.contexte(supplierId, buyerId, rows.map((r) => r.id));
  return { rows: rows.map((r) => versApiClient(r, ctx)), count };
}

async function produitFournisseur(buyerId, supplierId, id) {
  await partenariats.exigerActif(buyerId, supplierId);
  const produit = await Product.findOne({
    where: { id, company_id: supplierId, is_active: true },
    attributes: { exclude: CHAMPS_INTERNES },
    include: INCLUDES,
  });
  if (!produit) throw new NotFoundError('Produit introuvable');
  const ctx = await tarification.contexte(supplierId, buyerId, [produit.id]);
  return versApiClient(produit, ctx);
}

module.exports = {
  lister, detail, creer, modifier, changerActivation, supprimer, changerPhoto, supprimerPhoto,
  catalogueFournisseur, produitFournisseur, versApi, remplacerPaliers, referenceLibre, clientsActifs, CHAMPS,
};
