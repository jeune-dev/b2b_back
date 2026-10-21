'use strict';

const { Op } = require('sequelize');
const sequelize = require('../../../config/db.js');
const { ProductCategory, Product } = require('../../../models/index.js');
const { ConflictError } = require('../../../errors/AppError.js');
const { chargerPourEntreprise } = require('../../../utils/acces.js');
const partenariats = require('../../partenaire/service/partenariat.service.js');
const { journaliser, difference } = require('../../audit/service/audit.service.js');

/**
 * Catégories du catalogue d'un fournisseur (§ 8 « catégorie »). Le nombre de
 * produits actifs est calculé dans la requête (sous-requête indexée).
 */

const NB_PRODUITS = [
  sequelize.literal('(SELECT count(*)::int FROM products p WHERE p.category_id = "ProductCategory"."id" AND p.deleted_at IS NULL AND p.is_active)'),
  'products_count',
];

async function lister(companyId) {
  return ProductCategory.findAll({
    where: { company_id: companyId },
    attributes: { include: [NB_PRODUITS] },
    order: [['sort_order', 'ASC'], ['name', 'ASC']],
  });
}

/** Catégories d'un fournisseur, pour un acheteur au partenariat actif. */
async function listerPourAcheteur(buyerId, supplierId) {
  await partenariats.exigerActif(buyerId, supplierId);
  return lister(supplierId);
}

async function nomLibre(companyId, nom, sauf, t) {
  const pris = await ProductCategory.findOne({
    where: {
      company_id: companyId,
      [Op.and]: [sequelize.where(sequelize.fn('lower', sequelize.col('name')), nom.toLowerCase())],
      ...(sauf ? { id: { [Op.ne]: sauf } } : {}),
    },
    attributes: ['id'],
    transaction: t,
  });
  if (pris) throw new ConflictError('Une catégorie porte déjà ce nom.', 'CATEGORIE_EXISTANTE');
}

async function creer(companyId, donnees) {
  return sequelize.transaction(async (t) => {
    await nomLibre(companyId, donnees.name, null, t);
    const categorie = await ProductCategory.create({ ...donnees, company_id: companyId }, { transaction: t });
    await journaliser({ action: 'categorie_produit.creation', entityType: 'product_category', entityId: categorie.id, companyId, details: { name: categorie.name } }, t);
    return categorie;
  });
}

async function modifier(id, companyId, donnees) {
  return sequelize.transaction(async (t) => {
    const categorie = await chargerPourEntreprise(ProductCategory, id, companyId, { transaction: t, lock: t.LOCK.UPDATE }, 'Catégorie');
    if (donnees.name) await nomLibre(companyId, donnees.name, id, t);
    const avant = categorie.toJSON();
    await categorie.update(donnees, { transaction: t, fields: ['name', 'sort_order'] });
    await journaliser({ action: 'categorie_produit.modification', entityType: 'product_category', entityId: id, companyId, details: difference(avant, donnees, ['name', 'sort_order']) }, t);
    return categorie;
  });
}

/** Suppression d'une catégorie VIDE (sinon les produits perdraient leur rangement). */
async function supprimer(id, companyId) {
  await sequelize.transaction(async (t) => {
    const categorie = await chargerPourEntreprise(ProductCategory, id, companyId, { transaction: t, lock: t.LOCK.UPDATE }, 'Catégorie');
    const nb = await Product.count({ where: { category_id: id }, transaction: t });
    if (nb > 0) throw new ConflictError(`Cette catégorie contient ${nb} produit(s) : déplacez-les d'abord.`, 'CATEGORIE_NON_VIDE');
    await categorie.destroy({ transaction: t });
    await journaliser({ action: 'categorie_produit.suppression', entityType: 'product_category', entityId: id, companyId, details: { name: categorie.name } }, t);
  });
}

module.exports = { lister, listerPourAcheteur, creer, modifier, supprimer };
