'use strict';

/**
 * Forfaits initiaux (§ 25 : « les tarifs et forfaits seront définis
 * ultérieurement »). Ces valeurs sont un POINT DE DÉPART : prix, limites et
 * fonctionnalités se règlent depuis le Super Admin et ne sont jamais codés en
 * dur ailleurs. `ON CONFLICT DO NOTHING` : relancer le seeder n'écrase jamais
 * un forfait modifié en production.
 */
const TOUTES = ['modeles_documents', 'statistiques', 'exports'];

const FORFAITS = [
  {
    code: 'ESSENTIEL', name: 'Essentiel', price: 10000, max_users: 3, max_products: 100, max_partners: 15, max_orders_per_month: 100,
    features: [], sort_order: 1, description: 'Pour démarrer : commandes, factures et suivi des paiements.',
  },
  {
    code: 'BUSINESS', name: 'Business', price: 25000, max_users: 10, max_products: 1000, max_partners: 100, max_orders_per_month: 1000,
    features: TOUTES, sort_order: 2, description: 'Modèles de documents personnalisés, statistiques et exports.',
  },
  {
    code: 'ENTREPRISE', name: 'Entreprise', price: 60000, max_users: null, max_products: null, max_partners: null, max_orders_per_month: null,
    features: TOUTES, sort_order: 3, description: 'Sans limite d’utilisateurs, de produits ni de commandes.',
  },
];

module.exports = {
  async up(queryInterface) {
    for (const f of FORFAITS) {
      await queryInterface.sequelize.query(
        `INSERT INTO subscription_plans (code, name, description, price, currency, billing_period, max_users, max_products, max_partners, max_orders_per_month, features, status, sort_order)
         VALUES (:code, :name, :description, :price, 'XOF', 'mensuel', :max_users, :max_products, :max_partners, :max_orders_per_month,
                 ${f.features.length ? 'ARRAY[:features]::text[]' : "'{}'::text[]"}, 'actif', :sort_order)
         ON CONFLICT (code) DO NOTHING`,
        { replacements: f }
      );
    }
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query("DELETE FROM subscription_plans WHERE code IN ('ESSENTIEL', 'BUSINESS', 'ENTREPRISE') AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.plan_id = subscription_plans.id)");
  },
};
