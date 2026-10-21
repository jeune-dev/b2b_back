'use strict';

const { Op } = require('sequelize');
const sequelize = require('../../../config/db.js');
const {
  PurchaseList, PurchaseListItem, Product, Company, Partnership,
} = require('../../../models/index.js');
const { ConflictError, ValidationError, ForbiddenError } = require('../../../errors/AppError.js');
const { chargerPourEntreprise } = require('../../../utils/acces.js');
const { ordre } = require('../../../utils/liste.js');
const { formatQuantite } = require('../../../utils/montants.js');
const C = require('../../commande/service/commun.js');
const L = require('../../commande/service/lignes.service.js');
const commandes = require('../../commande/service/commande.service.js');
const tarification = require('../../catalogue/service/tarification.service.js');
const { journaliser } = require('../../audit/service/audit.service.js');

/**
 * Listes d'achat habituelles (« order guides ») : pour un fournisseur, les
 * produits commandés régulièrement, avec pour chacun
 *   - une quantité par défaut, OU
 *   - un STOCK CIBLE (par) : au moment de commander, l'acheteur saisit son
 *     stock constaté et Pro2Link commande la différence, arrondie au
 *     minimum et au multiple de commande du fournisseur.
 * Commander une liste crée un bon de commande BROUILLON aux prix actuels.
 */

const ITEMS = {
  model: PurchaseListItem, as: 'items', separate: true, order: [['sort_order', 'ASC'], ['created_at', 'ASC']],
  include: [{ model: Product, as: 'product', paranoid: false }],
};

const SUPPLIER = { model: Company, as: 'supplier', attributes: ['id', 'name', 'city', 'logo_document_id'], paranoid: false };

const commandable = (p) => p && !p.deleted_at && p.is_active && p.availability !== 'rupture';

function versApi(liste, ctx = null) {
  const { items, ...l } = liste.toJSON();
  return {
    ...l,
    ...(items ? {
      items: items.map((i) => ({
        product_id: i.product_id,
        quantity: i.quantity === null ? null : Number(i.quantity),
        par_level: i.par_level === null ? null : Number(i.par_level),
        sort_order: i.sort_order,
        product: i.product ? {
          id: i.product.id,
          reference: i.product.reference,
          name: i.product.name,
          unit: i.product.unit,
          availability: i.product.availability,
          min_order_quantity: Number(i.product.min_order_quantity),
          order_multiple: i.product.order_multiple === null ? null : Number(i.product.order_multiple),
          orderable: commandable(i.product),
          ...(ctx && commandable(i.product) ? { price: tarification.prixClient(i.product, ctx) } : {}),
        } : null,
      })),
    } : {}),
  };
}

async function lister(companyId, f, { limit, offset }) {
  const where = { company_id: companyId };
  if (f.supplier_id) where.supplier_company_id = f.supplier_id;
  const { rows, count } = await PurchaseList.findAndCountAll({
    where,
    attributes: { include: [[sequelize.literal('(SELECT count(*)::int FROM purchase_list_items i WHERE i.list_id = "PurchaseList"."id")'), 'items_count']] },
    include: [SUPPLIER],
    order: ordre(f.tri, 'name'),
    limit,
    offset,
  });
  return { rows: rows.map((r) => versApi(r)), count };
}

async function detail(id, companyId) {
  const liste = await chargerPourEntreprise(PurchaseList, id, companyId, { include: [SUPPLIER, ITEMS] }, "Liste d'achat");
  const ctx = await tarification.contexte(liste.supplier_company_id, companyId, liste.items.map((i) => i.product_id));
  return versApi(liste, ctx);
}

async function nomLibre(companyId, nom, sauf, t) {
  const pris = await PurchaseList.findOne({
    where: {
      company_id: companyId,
      [Op.and]: [sequelize.where(sequelize.fn('lower', sequelize.col('name')), nom.toLowerCase())],
      ...(sauf ? { id: { [Op.ne]: sauf } } : {}),
    },
    attributes: ['id'],
    transaction: t,
  });
  if (pris) throw new ConflictError(`Une liste d'achat « ${nom} » existe déjà.`, 'LISTE_ACHAT_EXISTANTE');
}

/**
 * Produits de la liste : du catalogue du fournisseur (identifiant ou
 * référence), une fois chacun.
 */
async function preparerItems(supplierId, items, t) {
  const resolus = await L.resoudreReferences(supplierId, items, t);
  await L.produitsDuFournisseur(supplierId, resolus.map((i) => i.product_id), t);
  if (new Set(resolus.map((i) => i.product_id)).size !== resolus.length) {
    throw new ValidationError('Données invalides', ['Un produit ne figure qu’une fois dans une liste d’achat'], 'LIGNES_INVALIDES');
  }
  return resolus.map((i, index) => ({
    product_id: i.product_id, quantity: i.quantity ?? null, par_level: i.par_level ?? null, sort_order: index,
  }));
}

async function remplacerItems(t, listeId, items) {
  await PurchaseListItem.destroy({ where: { list_id: listeId }, transaction: t });
  if (items.length) await PurchaseListItem.bulkCreate(items.map((i) => ({ ...i, list_id: listeId })), { transaction: t });
}

/** Lignes validées d'une commande passée de l'acheteur, en items de liste. */
async function itemsDepuisCommande(orderId, companyId, supplierId) {
  const { commande } = await C.charger(orderId, companyId, {}, { cote: 'acheteur' });
  if (commande.supplier_company_id !== supplierId) {
    throw new ValidationError('Données invalides', ['La commande d’origine concerne un autre fournisseur'], 'COMMANDE_INVALIDE');
  }
  const version = await C.version(commande.id, commande.validated_version_no || commande.current_version_no);
  return version.lines.filter((l) => l.product_id && Number(l.quantity) > 0).map((l) => ({ product_id: l.product_id, quantity: Number(l.quantity) }));
}

async function creer(companyId, user, {
  supplier_id: supplierId, name, notes = null, items = [], from_order_id: depuis = null,
}) {
  const lien = await Partnership.findOne({ where: { buyer_company_id: companyId, supplier_company_id: supplierId }, attributes: ['status'] });
  if (!lien || !['actif', 'suspendu'].includes(lien.status)) {
    throw new ForbiddenError('Ce fournisseur ne fait pas partie de vos fournisseurs.', 'PARTENARIAT_INACTIF');
  }
  const source = depuis ? await itemsDepuisCommande(depuis, companyId, supplierId) : items;
  const id = await sequelize.transaction(async (t) => {
    await nomLibre(companyId, name, null, t);
    const prepares = await preparerItems(supplierId, source, t);
    const liste = await PurchaseList.create({
      company_id: companyId, supplier_company_id: supplierId, name, notes, created_by: user.id,
    }, { transaction: t });
    await remplacerItems(t, liste.id, prepares);
    await journaliser({ action: 'liste_achat.creation', entityType: 'purchase_list', entityId: liste.id, companyId, details: { name, fournisseur: supplierId, produits: prepares.length, depuis } }, t);
    return liste.id;
  });
  return detail(id, companyId);
}

/** Modification ; `items` fourni REMPLACE le contenu de la liste. */
async function modifier(id, companyId, { items, ...donnees }) {
  await sequelize.transaction(async (t) => {
    const liste = await chargerPourEntreprise(PurchaseList, id, companyId, { transaction: t, lock: t.LOCK.UPDATE }, "Liste d'achat");
    if (donnees.name && donnees.name.toLowerCase() !== liste.name.toLowerCase()) await nomLibre(companyId, donnees.name, id, t);
    if (Object.keys(donnees).length) await liste.update(donnees, { transaction: t });
    if (items) await remplacerItems(t, id, await preparerItems(liste.supplier_company_id, items, t));
    await journaliser({ action: 'liste_achat.modification', entityType: 'purchase_list', entityId: id, companyId, details: { champs: Object.keys(donnees), produits: items?.length ?? null } }, t);
  });
  return detail(id, companyId);
}

async function supprimer(id, companyId) {
  await sequelize.transaction(async (t) => {
    const liste = await chargerPourEntreprise(PurchaseList, id, companyId, { transaction: t, lock: t.LOCK.UPDATE }, "Liste d'achat");
    await liste.destroy({ transaction: t });
    await journaliser({ action: 'liste_achat.suppression', entityType: 'purchase_list', entityId: id, companyId, details: { name: liste.name } }, t);
  });
}

/** Quantité arrondie AU-DESSUS au minimum et au multiple de commande du fournisseur. */
function arrondir(produit, quantite) {
  let q = Math.max(quantite, Number(produit.min_order_quantity));
  if (produit.order_multiple) {
    const m = Number(produit.order_multiple);
    q = Math.ceil(Math.round((q / m) * 1e6) / 1e6) * m;
  }
  return Math.round(q * 1000) / 1000;
}

/**
 * Commander la liste : bon de commande BROUILLON.
 * @param {{ stocks?: Array<{ product_id: string, on_hand: number }>, lines?: Array<{ product_id: string, quantity: number }> }} donnees
 *   `stocks` : stock constaté des produits à stock cible ; `lines` : quantités
 *   imposées pour cette fois (0 = ne pas commander ce produit).
 */
async function commander(id, companyId, user, { stocks = [], lines = [], ...entete }) {
  const liste = await chargerPourEntreprise(PurchaseList, id, companyId, { include: [ITEMS] }, "Liste d'achat");
  const constate = new Map(stocks.map((s) => [s.product_id, s.on_hand]));
  const imposees = new Map(lines.map((l) => [l.product_id, l.quantity]));
  const ecartees = [];
  const saisies = [];
  for (const item of liste.items) {
    const p = item.product;
    let quantite;
    if (imposees.has(item.product_id)) quantite = imposees.get(item.product_id);
    else if (item.par_level !== null) quantite = Number(item.par_level) - (constate.get(item.product_id) ?? 0);
    else quantite = Number(item.quantity);
    if (!(quantite > 0)) continue;
    if (!commandable(p)) {
      ecartees.push({ product_id: item.product_id, name: p?.name || null, reason: !p || p.deleted_at || !p.is_active ? 'produit retiré du catalogue' : 'produit indisponible' });
      continue;
    }
    const arrondie = imposees.has(item.product_id) ? quantite : arrondir(p, quantite);
    const regles = L.erreursQuantite(p, arrondie, 'Quantité');
    if (regles.length) {
      ecartees.push({ product_id: p.id, name: p.name, reason: regles.join(' ; ') });
      continue;
    }
    saisies.push({ product_id: p.id, quantity: arrondie, comment: arrondie !== quantite ? `Arrondi de ${formatQuantite(quantite)} à ${formatQuantite(arrondie)} (minimum / multiple du fournisseur)` : null });
  }
  if (!saisies.length) {
    throw new ConflictError('Rien à commander : aucun produit de la liste n’est à réapprovisionner ou commandable.', 'RIEN_A_COMMANDER', { lignes_ecartees: ecartees });
  }
  const commande = await commandes.creer(companyId, user, { ...entete, supplier_id: liste.supplier_company_id, lines: saisies }, { purchaseListId: liste.id, origine: 'liste_achat' });
  await PurchaseList.update({ last_ordered_at: new Date() }, { where: { id: liste.id } });
  return { commande, lignes_ecartees: ecartees };
}

module.exports = {
  lister, detail, creer, modifier, supprimer, commander, arrondir,
};
