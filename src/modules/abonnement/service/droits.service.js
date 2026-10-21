'use strict';

const { Op, QueryTypes } = require('sequelize');
const sequelize = require('../../../config/db.js');
const { Subscription, SubscriptionPlan, Company } = require('../../../models/index.js');
const { PaymentRequiredError, ForbiddenError } = require('../../../errors/AppError.js');
const { aujourdhui, debutMois } = require('../../../utils/dates.js');
const cache = require('../../../utils/cache.js');

/**
 * Droits d'une entreprise selon son abonnement (§ 25) : état, limites du
 * forfait (utilisateurs, produits, partenaires, commandes par mois) et
 * fonctionnalités.
 *
 * Abonnement expiré ou suspendu : l'espace passe en LECTURE SEULE —
 * l'entreprise consulte toujours ses commandes, factures et soldes, mais ne
 * peut plus rien créer ni modifier tant qu'elle n'a pas renouvelé.
 */

const TTL_S = 30;
const cleCache = (companyId) => `abonnement:${companyId}`;

/**
 * @returns {Promise<{ abonnement: object|null, plan: object|null, actif: boolean }>}
 */
async function etat(companyId) {
  const enCache = await cache.lire(cleCache(companyId));
  if (enCache) return enCache;

  const abonnement = await Subscription.findOne({
    where: { company_id: companyId, status: { [Op.in]: ['essai', 'actif', 'suspendu'] } },
    include: [{ model: SubscriptionPlan, as: 'plan' }],
  });
  const jour = aujourdhui();
  const actif = Boolean(abonnement)
    && ['essai', 'actif'].includes(abonnement.status)
    && abonnement.current_period_end >= jour;

  const resultat = {
    abonnement: abonnement ? {
      id: abonnement.id,
      status: abonnement.status,
      current_period_end: abonnement.current_period_end,
      trial_ends_at: abonnement.trial_ends_at,
    } : null,
    plan: abonnement?.plan ? {
      code: abonnement.plan.code,
      name: abonnement.plan.name,
      max_users: abonnement.plan.max_users,
      max_products: abonnement.plan.max_products,
      max_partners: abonnement.plan.max_partners,
      max_orders_per_month: abonnement.plan.max_orders_per_month,
      features: abonnement.plan.features,
    } : null,
    actif,
  };
  await cache.ecrire(cleCache(companyId), resultat, TTL_S);
  return resultat;
}

async function invalider(companyId) {
  await cache.invalider(cleCache(companyId));
}

function exigerActif(droits) {
  if (!droits.actif) {
    throw new PaymentRequiredError(
      'Votre abonnement est expiré ou suspendu : votre espace est en lecture seule. Renouvelez-le pour continuer.',
      'ABONNEMENT_REQUIS',
      { abonnement: droits.abonnement }
    );
  }
}

/**
 * Compteurs d'usage (une requête). `orders_month` : bons de commande ENVOYÉS
 * ce mois-ci par l'entreprise (un brouillon ne compte pas).
 */
const REQUETES_USAGE = {
  users: "SELECT count(*)::int AS n FROM company_members WHERE company_id = :companyId AND status = 'actif'",
  products: 'SELECT count(*)::int AS n FROM products WHERE company_id = :companyId AND deleted_at IS NULL',
  partners: "SELECT count(*)::int AS n FROM partnerships WHERE (buyer_company_id = :companyId OR supplier_company_id = :companyId) AND status IN ('actif', 'en_attente', 'suspendu')",
  orders_month: 'SELECT count(*)::int AS n FROM orders WHERE buyer_company_id = :companyId AND sent_at >= :debut',
};

const LIMITES = {
  users: { cle: 'max_users', libelle: 'utilisateurs' },
  products: { cle: 'max_products', libelle: 'produits' },
  partners: { cle: 'max_partners', libelle: 'partenaires' },
  orders_month: { cle: 'max_orders_per_month', libelle: 'bons de commande ce mois-ci' },
};

async function usage(companyId, ressource, transaction) {
  const [{ n }] = await sequelize.query(REQUETES_USAGE[ressource], {
    replacements: { companyId, debut: new Date(`${debutMois(aujourdhui())}T00:00:00Z`) },
    type: QueryTypes.SELECT,
    transaction,
  });
  return n;
}

/**
 * Vérifie une limite quantitative AVANT une création, dans la transaction de
 * la création : un verrou sur la ligne de l'entreprise sérialise deux
 * créations simultanées, qui ne peuvent pas franchir la limite ensemble.
 * @param {'users'|'products'|'partners'|'orders_month'} ressource
 */
async function verifierLimite(companyId, ressource, transaction) {
  const droits = await etat(companyId);
  exigerActif(droits);
  const { cle, libelle } = LIMITES[ressource];
  const max = droits.plan?.[cle];
  if (max === null || max === undefined) return;
  if (transaction) await Company.findByPk(companyId, { attributes: ['id'], lock: transaction.LOCK.UPDATE, transaction });
  const nombre = await usage(companyId, ressource, transaction);
  if (nombre >= max) {
    throw new ForbiddenError(
      `Limite de votre forfait atteinte (${max} ${libelle}). Passez à un forfait supérieur.`,
      'LIMITE_ABONNEMENT',
      { ressource, max }
    );
  }
}

/**
 * Fonctionnalités du DERNIER abonnement, quel que soit son statut : un espace
 * échu reste consultable avec ce que son forfait incluait.
 */
async function fonctionnalitesDuDernierPlan(companyId) {
  const dernier = await Subscription.findOne({
    where: { company_id: companyId },
    include: [{ model: SubscriptionPlan, as: 'plan', attributes: ['features'] }],
    order: [['created_at', 'DESC'], ['id', 'DESC']],
  });
  return dernier?.plan ? dernier.plan.features || [] : null;
}

/**
 * La fonctionnalité doit être incluse dans le forfait.
 *   - ÉCRITURE : abonnement actif exigé (402 sinon) ;
 *   - LECTURE (`lecture: true`) : un abonnement échu ou suspendu laisse
 *     l'espace en lecture seule — seule l'inclusion dans le forfait compte.
 */
async function exigerFonctionnalite(companyId, code, { lecture = false } = {}) {
  const droits = await etat(companyId);
  let fonctionnalites = droits.plan?.features;
  if (lecture) {
    if (!fonctionnalites) fonctionnalites = await fonctionnalitesDuDernierPlan(companyId);
    if (!fonctionnalites) exigerActif(droits);
  } else {
    exigerActif(droits);
  }
  if (!fonctionnalites?.includes(code)) {
    throw new ForbiddenError("Cette fonctionnalité n'est pas incluse dans votre forfait.", 'FONCTIONNALITE_NON_INCLUSE', { fonctionnalite: code });
  }
}

module.exports = {
  etat, invalider, exigerActif, verifierLimite, usage, exigerFonctionnalite, REQUETES_USAGE,
};
