'use strict';

const { Op, QueryTypes } = require('sequelize');
const sequelize = require('../../../config/db.js');
const {
  Company, CompanyMember, User, Subscription, SubscriptionPlan,
} = require('../../../models/index.js');
const { NotFoundError, ConflictError } = require('../../../errors/AppError.js');
const { ordre, rechercheTexte } = require('../../../utils/liste.js');
const sessions = require('../../auth/service/session.service.js');
const { journaliser } = require('../../audit/service/audit.service.js');
const { notifierEntreprise } = require('../../notification/service/notification.service.js');
const cache = require('../../../utils/cache.js');

/**
 * Administration des entreprises (§ 5.4 « gérer les entreprises,
 * suspendre / réactiver des comptes »).
 *
 * Minimisation : l'administrateur voit ce dont il a besoin pour piloter et
 * assister — identité de l'entreprise, membres, abonnement, volumes — jamais
 * le contenu des commandes, les prix négociés ni les notes privées.
 * Compteurs calculés dans la requête de la page (sous-requêtes indexées).
 */

const COURANTS = "('essai', 'actif', 'suspendu')";

const stats = (alias) => [
  [sequelize.literal(`(SELECT count(*)::int FROM company_members m WHERE m.company_id = "${alias}"."id" AND m.status = 'actif')`), 'members_count'],
  [sequelize.literal(`(SELECT count(*)::int FROM partnerships p WHERE (p.buyer_company_id = "${alias}"."id" OR p.supplier_company_id = "${alias}"."id") AND p.status = 'actif')`), 'partners_count'],
  [sequelize.literal(`(SELECT count(*)::int FROM products pr WHERE pr.company_id = "${alias}"."id" AND pr.deleted_at IS NULL)`), 'products_count'],
  [sequelize.literal(`(SELECT count(*)::int FROM orders o WHERE (o.buyer_company_id = "${alias}"."id" OR (o.supplier_company_id = "${alias}"."id" AND o.status <> 'brouillon')))`), 'orders_count'],
  [sequelize.literal(`(SELECT s.status FROM subscriptions s WHERE s.company_id = "${alias}"."id" AND s.status IN ${COURANTS})`), 'subscription_status'],
  [sequelize.literal(`(SELECT pl.code FROM subscriptions s JOIN subscription_plans pl ON pl.id = s.plan_id WHERE s.company_id = "${alias}"."id" AND s.status IN ${COURANTS})`), 'plan_code'],
  [sequelize.literal(`(SELECT s.current_period_end FROM subscriptions s WHERE s.company_id = "${alias}"."id" AND s.status IN ${COURANTS})`), 'current_period_end'],
];

async function lister(filtres, { limit, offset }) {
  const conditions = [];
  const replacements = {};
  const texte = rechercheTexte(filtres.q, ['name', 'legal_name', 'ninea', 'email', 'phone', 'city']);
  if (texte) conditions.push(texte);
  if (filtres.status) conditions.push({ status: filtres.status });
  if (filtres.type) conditions.push({ type: filtres.type });
  if (filtres.sector) conditions.push({ sector: filtres.sector });
  if (filtres.plan) {
    conditions.push(sequelize.literal(`"Company"."id" IN (SELECT s.company_id FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id
      WHERE p.code = :plan AND s.status IN ${COURANTS})`));
    replacements.plan = filtres.plan;
  }
  if (filtres.abonnement === 'aucun') {
    conditions.push(sequelize.literal(`NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.company_id = "Company"."id" AND s.status IN ${COURANTS})`));
  } else if (filtres.abonnement) {
    conditions.push(sequelize.literal('"Company"."id" IN (SELECT s.company_id FROM subscriptions s WHERE s.status = :statutAbonnement)'));
    replacements.statutAbonnement = filtres.abonnement;
  }
  return Company.findAndCountAll({
    where: conditions.length ? { [Op.and]: conditions } : {},
    attributes: { exclude: ['settings', 'bank_details'], include: stats('Company') },
    replacements,
    order: ordre(filtres.tri, '-created_at'),
    limit,
    offset,
  });
}

async function charger(id, options = {}) {
  const company = await Company.findByPk(id, options);
  if (!company) throw new NotFoundError('Entreprise introuvable');
  return company;
}

async function detail(id) {
  const company = await charger(id, { attributes: { exclude: ['bank_details'], include: stats('Company') } });
  const [abonnement, membres, [activite]] = await Promise.all([
    Subscription.findOne({
      where: { company_id: id, status: { [Op.in]: ['essai', 'actif', 'suspendu'] } },
      include: [{ model: SubscriptionPlan, as: 'plan', attributes: ['id', 'code', 'name', 'price', 'billing_period'] }],
    }),
    CompanyMember.findAll({
      where: { company_id: id },
      attributes: ['id', 'role_code', 'status', 'created_at'],
      include: [{ model: User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'email', 'phone', 'status', 'last_login_at'] }],
      order: [['created_at', 'ASC']],
    }),
    sequelize.query(
      `SELECT
         (SELECT count(*)::int FROM orders WHERE buyer_company_id = :id AND status NOT IN ('brouillon')) AS purchase_orders,
         (SELECT count(*)::int FROM orders WHERE supplier_company_id = :id AND status <> 'brouillon') AS sales_orders,
         (SELECT count(*)::int FROM invoices WHERE supplier_company_id = :id AND status <> 'annulee') AS invoices_issued,
         (SELECT max(created_at) FROM orders WHERE buyer_company_id = :id OR supplier_company_id = :id) AS last_order_at`,
      { replacements: { id }, type: QueryTypes.SELECT }
    ),
  ]);
  const { settings, ...donnees } = company.toJSON();
  return {
    ...donnees, settings_customized: Object.keys(settings || {}).length > 0, subscription: abonnement, members: membres, activity: activite,
  };
}

/**
 * Suspension d'une entreprise : `requireEntreprise` refuse toute requête
 * (403 ENTREPRISE_SUSPENDUE) et les sessions de tous ses membres sont
 * fermées. Les données sont conservées ; ses partenaires gardent l'accès à
 * l'historique commun (commandes, factures, paiements).
 */
async function suspendre(id, { reason }) {
  return sequelize.transaction(async (t) => {
    const company = await charger(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (company.status === 'suspendu') throw new ConflictError('Cette entreprise est déjà suspendue.', 'DEJA_SUSPENDU');
    await company.update({ status: 'suspendu', suspended_reason: reason }, { transaction: t });
    const membres = await CompanyMember.findAll({ where: { company_id: id }, attributes: ['user_id'], transaction: t });
    for (const m of membres) await sessions.revoquerToutesLesSessions(m.user_id, t);
    await journaliser({
      action: 'entreprise.changement_statut', entityType: 'company', entityId: id, companyId: id,
      details: { de: 'actif', a: 'suspendu', motif: reason, sessions_fermees: membres.length },
    }, t);
    t.afterCommit(() => cache.invalider(`dashboard:*:${id}`).catch(() => {}));
    return company;
  });
}

async function reactiver(id) {
  return sequelize.transaction(async (t) => {
    const company = await charger(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (company.status === 'actif') throw new ConflictError("Cette entreprise n'est pas suspendue.", 'NON_SUSPENDU');
    await company.update({ status: 'actif', suspended_reason: null }, { transaction: t });
    await journaliser({
      action: 'entreprise.changement_statut', entityType: 'company', entityId: id, companyId: id,
      details: { de: 'suspendu', a: 'actif' },
    }, t);
    await notifierEntreprise(t, id, null, {
      type: 'systeme',
      titre: 'Entreprise réactivée',
      corps: 'Votre espace Pro2Link a été réactivé. Vous pouvez de nouveau commander, vendre et facturer.',
    });
    return company;
  });
}

module.exports = { lister, detail, suspendre, reactiver };
