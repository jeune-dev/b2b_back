'use strict';

const { QueryTypes } = require('sequelize');
const sequelize = require('../../../config/db.js');
const { aujourdhui, debutMois, finMois, ajouterMois } = require('../../../utils/dates.js');
const cache = require('../../../utils/cache.js');

/**
 * Tableau de bord et statistiques du Super Admin (§ 5.4 « consulter les
 * statistiques »).
 *
 * Agrégats de toute la plateforme (jamais une requête par entreprise), servis
 * depuis un cache de 60 s ; `volUnique` évite que plusieurs administrateurs
 * relancent le calcul ensemble à l'expiration du cache. Aucun montant
 * individuel d'une entreprise ne sort d'ici : seulement des totaux.
 */

const CLE = 'admin:dashboard';
const TTL_S = 60;

const entier = (v) => Number(v || 0);

/** Prix mensualisé d'un forfait (MRR) : un forfait annuel compte pour 1/12. */
const mensuel = (prix, periode) => (periode === 'annuel' ? Math.round(entier(prix) / 12) : entier(prix));

async function calculer() {
  const jour = aujourdhui();
  const debut = debutMois(jour);
  const fin = finMois(jour);
  const remplacements = { debut, fin, debutTs: new Date(`${debut}T00:00:00Z`), finTs: new Date(`${fin}T23:59:59.999Z`), jour };

  const [[comptes], abonnements] = await Promise.all([
    sequelize.query(
      `SELECT
         (SELECT count(*) FROM companies WHERE deleted_at IS NULL) AS companies,
         (SELECT count(*) FROM companies WHERE deleted_at IS NULL AND status = 'suspendu') AS companies_suspended,
         (SELECT count(*) FROM companies WHERE deleted_at IS NULL AND type = 'acheteur') AS buyers,
         (SELECT count(*) FROM companies WHERE deleted_at IS NULL AND type = 'fournisseur') AS suppliers,
         (SELECT count(*) FROM companies WHERE deleted_at IS NULL AND type = 'mixte') AS mixed,
         (SELECT count(*) FROM companies WHERE deleted_at IS NULL AND created_at >= :debutTs) AS companies_new,
         (SELECT count(*) FROM users WHERE deleted_at IS NULL AND role_code = 'utilisateur') AS users,
         (SELECT count(*) FROM users WHERE deleted_at IS NULL AND role_code = 'utilisateur' AND last_login_at >= :debutTs) AS users_active_month,
         (SELECT count(*) FROM partnerships WHERE status = 'actif') AS partnerships,
         (SELECT count(*) FROM products WHERE deleted_at IS NULL AND is_active) AS products,
         (SELECT count(*) FROM orders WHERE sent_at BETWEEN :debutTs AND :finTs) AS orders_sent,
         (SELECT count(*) FROM orders WHERE validated_at BETWEEN :debutTs AND :finTs) AS orders_validated,
         (SELECT coalesce(sum(total), 0) FROM orders WHERE validated_at BETWEEN :debutTs AND :finTs AND status NOT IN ('annulee', 'refusee')) AS orders_volume,
         (SELECT count(*) FROM invoices WHERE issue_date BETWEEN :debut AND :fin AND status <> 'annulee') AS invoices,
         (SELECT coalesce(sum(total), 0) FROM invoices WHERE issue_date BETWEEN :debut AND :fin AND status <> 'annulee') AS invoiced,
         (SELECT coalesce(sum(amount), 0) FROM payments WHERE paid_on BETWEEN :debut AND :fin AND status = 'confirme') AS payments`,
      { replacements: remplacements, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT s.status, p.code, p.name, p.price, p.billing_period,
              count(*) AS nombre,
              count(*) FILTER (WHERE s.status = 'actif' AND s.current_period_end >= :jour) AS payants
         FROM subscriptions s
         JOIN subscription_plans p ON p.id = s.plan_id
        GROUP BY s.status, p.code, p.name, p.price, p.billing_period`,
      { replacements: remplacements, type: QueryTypes.SELECT }
    ),
  ]);

  const parStatut = {};
  const parPlan = {};
  let mrr = 0;
  for (const l of abonnements) {
    parStatut[l.status] = (parStatut[l.status] || 0) + entier(l.nombre);
    if (['essai', 'actif', 'suspendu'].includes(l.status)) {
      parPlan[l.code] = parPlan[l.code] || { code: l.code, name: l.name, count: 0 };
      parPlan[l.code].count += entier(l.nombre);
    }
    mrr += entier(l.payants) * mensuel(l.price, l.billing_period);
  }
  const c = comptes;
  return {
    period: { start: debut, end: fin },
    companies: {
      total: entier(c.companies), suspended: entier(c.companies_suspended), new_this_month: entier(c.companies_new),
      by_type: { acheteur: entier(c.buyers), fournisseur: entier(c.suppliers), mixte: entier(c.mixed) },
    },
    users: { total: entier(c.users), active_this_month: entier(c.users_active_month) },
    partnerships: entier(c.partnerships),
    products: entier(c.products),
    orders: { sent: entier(c.orders_sent), validated: entier(c.orders_validated), volume: entier(c.orders_volume) },
    invoices: { count: entier(c.invoices), amount: entier(c.invoiced) },
    payments: entier(c.payments),
    subscriptions: { by_status: parStatut, by_plan: Object.values(parPlan), mrr },
    generated_at: new Date().toISOString(),
  };
}

async function tableauDeBord() {
  const enCache = await cache.lire(CLE);
  if (enCache) return enCache;
  return cache.volUnique(CLE, async () => {
    const resultat = await calculer();
    await cache.ecrire(CLE, resultat, TTL_S);
    return resultat;
  });
}

/** Activité de la plateforme par mois (12 derniers mois par défaut). */
async function statistiques({ du, au }) {
  const fin = au || aujourdhui();
  const debut = du || debutMois(ajouterMois(fin, -11));
  const remplacements = { debutTs: new Date(`${debut}T00:00:00Z`), finTs: new Date(`${fin}T23:59:59.999Z`), debut, fin };
  const [inscriptions, commandes, factures] = await Promise.all([
    sequelize.query(
      `SELECT to_char(created_at, 'YYYY-MM') AS month, type, count(*)::int AS count
         FROM companies WHERE created_at BETWEEN :debutTs AND :finTs GROUP BY 1, 2 ORDER BY 1, 2`,
      { replacements: remplacements, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT to_char(validated_at, 'YYYY-MM') AS month, count(*)::int AS count, coalesce(sum(total), 0) AS amount
         FROM orders WHERE validated_at BETWEEN :debutTs AND :finTs AND status NOT IN ('annulee', 'refusee') GROUP BY 1 ORDER BY 1`,
      { replacements: remplacements, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT to_char(issue_date, 'YYYY-MM') AS month, count(*)::int AS count, coalesce(sum(total), 0) AS amount, coalesce(sum(amount_paid), 0) AS paid
         FROM invoices WHERE issue_date BETWEEN :debut AND :fin AND status <> 'annulee' GROUP BY 1 ORDER BY 1`,
      { replacements: remplacements, type: QueryTypes.SELECT }
    ),
  ]);
  return {
    period: { start: debut, end: fin },
    signups: inscriptions,
    orders: commandes.map((l) => ({ ...l, amount: entier(l.amount) })),
    invoices: factures.map((l) => ({ ...l, amount: entier(l.amount), paid: entier(l.paid) })),
  };
}

module.exports = { tableauDeBord, calculer, statistiques };
