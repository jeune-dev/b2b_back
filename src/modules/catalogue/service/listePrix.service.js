'use strict';

const { Op } = require('sequelize');
const sequelize = require('../../../config/db.js');
const {
  PriceList, PriceListItem, Product, Partnership, Company,
} = require('../../../models/index.js');
const { ConflictError, ValidationError } = require('../../../errors/AppError.js');
const { chargerPourEntreprise } = require('../../../utils/acces.js');
const { journaliser } = require('../../audit/service/audit.service.js');
const { synchroniser } = require('../../notification/service/notification.service.js');

/**
 * Listes de prix du fournisseur : tarifs propres à UN client ou à un GROUPE
 * de clients (« grossistes », « hôtels »…). Une liste porte :
 *   - des prix propres par produit ;
 *   - une remise globale appliquée aux produits sans prix propre.
 * Elle est affectée à un ou plusieurs partenariats (PATCH /partenariats/:id,
 * `price_list_id`) ; le client voit alors SES prix dans le catalogue et ses
 * bons de commande sont valorisés à ces prix.
 */

const ITEMS = {
  model: PriceListItem, as: 'items', separate: true, order: [['created_at', 'ASC']],
  include: [{ model: Product, as: 'product', attributes: ['id', 'reference', 'name', 'unit', 'price', 'is_active'], paranoid: false }],
};

const STAT_CLIENTS = [sequelize.literal('(SELECT count(*)::int FROM partnerships ps WHERE ps.price_list_id = "PriceList"."id")'), 'clients_count'];

function versApi(liste) {
  const l = liste.toJSON();
  return {
    ...l,
    discount_percent: Number(l.discount_percent),
    items: l.items?.map((i) => ({
      product_id: i.product_id,
      price: Number(i.price),
      product: i.product ? { ...i.product, catalog_price: Number(i.product.price) } : null,
    })),
  };
}

async function lister(companyId) {
  const listes = await PriceList.findAll({
    where: { company_id: companyId },
    attributes: { include: [STAT_CLIENTS, [sequelize.literal('(SELECT count(*)::int FROM price_list_items i WHERE i.price_list_id = "PriceList"."id")'), 'items_count']] },
    order: [['name', 'ASC']],
  });
  return listes.map(versApi);
}

async function detail(id, companyId) {
  const liste = await chargerPourEntreprise(PriceList, id, companyId, { attributes: { include: [STAT_CLIENTS] }, include: [ITEMS] }, 'Liste de prix');
  const clients = await Partnership.findAll({
    where: { price_list_id: id },
    attributes: ['id', 'status'],
    include: [{ model: Company, as: 'buyer', attributes: ['id', 'name', 'city'], paranoid: false }],
    order: [[{ model: Company, as: 'buyer' }, 'name', 'ASC']],
  });
  return { ...versApi(liste), clients: clients.map((c) => ({ partnership_id: c.id, status: c.status, company: c.buyer })) };
}

async function nomLibre(companyId, nom, sauf, t) {
  const pris = await PriceList.findOne({
    where: {
      company_id: companyId,
      [Op.and]: [sequelize.where(sequelize.fn('lower', sequelize.col('name')), nom.toLowerCase())],
      ...(sauf ? { id: { [Op.ne]: sauf } } : {}),
    },
    attributes: ['id'],
    transaction: t,
  });
  if (pris) throw new ConflictError(`Une liste de prix « ${nom} » existe déjà.`, 'LISTE_PRIX_EXISTANTE');
}

/** Prix propres : les produits doivent appartenir au catalogue du fournisseur. */
async function verifierProduits(companyId, items, t) {
  const ids = [...new Set(items.map((i) => i.product_id))];
  if (!ids.length) return;
  const produits = await Product.findAll({ where: { id: { [Op.in]: ids }, company_id: companyId }, attributes: ['id'], transaction: t });
  const connus = new Set(produits.map((p) => p.id));
  const inconnus = ids.filter((id) => !connus.has(id));
  if (inconnus.length) throw new ValidationError('Données invalides', inconnus.map((id) => `Produit ${id} introuvable dans votre catalogue`), 'PRODUIT_INVALIDE');
}

async function remplacerPrix(t, listeId, items) {
  await PriceListItem.destroy({ where: { price_list_id: listeId }, transaction: t });
  if (items.length) {
    await PriceListItem.bulkCreate(items.map((i) => ({ price_list_id: listeId, product_id: i.product_id, price: i.price })), { transaction: t });
  }
}

/** Clients dont le catalogue affiché change (écrans ouverts rafraîchis). */
async function clientsDeLaListe(listeId, t) {
  const liens = await Partnership.findAll({ where: { price_list_id: listeId }, attributes: ['buyer_company_id'], transaction: t });
  return liens.map((l) => l.buyer_company_id);
}

async function creer(companyId, user, { items = [], ...donnees }) {
  const id = await sequelize.transaction(async (t) => {
    await nomLibre(companyId, donnees.name, null, t);
    await verifierProduits(companyId, items, t);
    const liste = await PriceList.create({ ...donnees, company_id: companyId, created_by: user.id }, { transaction: t });
    await remplacerPrix(t, liste.id, items);
    await journaliser({ action: 'liste_prix.creation', entityType: 'price_list', entityId: liste.id, companyId, details: { name: liste.name, produits: items.length, remise: donnees.discount_percent || 0 } }, t);
    return liste.id;
  });
  return detail(id, companyId);
}

/** Modification ; `items` fourni REMPLACE tous les prix propres de la liste. */
async function modifier(id, companyId, { items, ...donnees }) {
  await sequelize.transaction(async (t) => {
    const liste = await chargerPourEntreprise(PriceList, id, companyId, { transaction: t, lock: t.LOCK.UPDATE }, 'Liste de prix');
    if (donnees.name && donnees.name.toLowerCase() !== liste.name.toLowerCase()) await nomLibre(companyId, donnees.name, id, t);
    if (Object.keys(donnees).length) await liste.update(donnees, { transaction: t });
    if (items) {
      await verifierProduits(companyId, items, t);
      await remplacerPrix(t, id, items);
    }
    await journaliser({ action: 'liste_prix.modification', entityType: 'price_list', entityId: id, companyId, details: { champs: Object.keys(donnees), produits: items?.length ?? null } }, t);
    await synchroniser(t, [companyId, ...(await clientsDeLaListe(id, t))], 'produit', { supplier_company_id: companyId, price_list_id: id });
  });
  return detail(id, companyId);
}

/** Suppression logique : les clients qui l'utilisaient reviennent au prix catalogue. */
async function supprimer(id, companyId) {
  await sequelize.transaction(async (t) => {
    const liste = await chargerPourEntreprise(PriceList, id, companyId, { transaction: t, lock: t.LOCK.UPDATE }, 'Liste de prix');
    const clients = await clientsDeLaListe(id, t);
    await Partnership.update({ price_list_id: null }, { where: { price_list_id: id }, transaction: t });
    await liste.destroy({ transaction: t });
    await journaliser({ action: 'liste_prix.suppression', entityType: 'price_list', entityId: id, companyId, details: { name: liste.name, clients_detaches: clients.length } }, t);
    await synchroniser(t, [companyId, ...clients], 'produit', { supplier_company_id: companyId, price_list_id: id });
  });
}

/**
 * Affectation d'une liste à un partenariat (appelée par le module
 * partenaire) : la liste doit appartenir au fournisseur du partenariat.
 */
async function verifierAffectation(listeId, supplierId, t) {
  if (listeId === null) return;
  const liste = await PriceList.findByPk(listeId, { attributes: ['id', 'company_id', 'is_active'], transaction: t });
  if (!liste || liste.company_id !== supplierId) throw new ValidationError('Données invalides', ['Liste de prix introuvable dans votre catalogue'], 'LISTE_PRIX_INVALIDE');
}

module.exports = {
  lister, detail, creer, modifier, supprimer, verifierAffectation,
};
