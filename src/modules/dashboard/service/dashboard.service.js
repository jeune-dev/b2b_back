'use strict';

const { QueryTypes } = require('sequelize');
const sequelize = require('../../../config/db.js');
const { Company } = require('../../../models/index.js');
const { EVENEMENTS_INTERNES_ACHETEUR } = require('../../../config/enums.js');
const { aujourdhui, debutMois, ajouterMois } = require('../../../utils/dates.js');
const cache = require('../../../utils/cache.js');
const situation = require('../../situation/service/situation.service.js');

/**
 * Tableaux de bord (§ 18 acheteur, § 19 fournisseur).
 *
 * « L'acheteur doit pouvoir voir rapidement combien il doit à ses fournisseurs
 * et quelles commandes sont en cours. » « Le fournisseur doit pouvoir voir
 * rapidement quels clients lui doivent de l'argent et quelles commandes
 * doivent être traitées. »
 *
 * Une entreprise mixte reçoit les deux sections. Quelques requêtes
 * d'agrégat (FILTER), jamais une requête par commande ; résultat mis en
 * cache 30 s et INVALIDÉ à chaque changement d'une commande, facture ou
 * paiement de l'entreprise (`dashboard:*:<entreprise>`).
 */

const TTL_S = 30;
const cle = (companyId) => `dashboard:v1:${companyId}`;
const n = (v) => Number(v || 0);

async function sectionAcheteur(companyId, bornes) {
  const [[c], dettes] = await Promise.all([
    sequelize.query(
      `SELECT
         count(*) FILTER (WHERE status = 'brouillon')::int AS brouillons,
         count(*) FILTER (WHERE status IN ('envoyee', 'en_attente_validation'))::int AS en_attente_fournisseur,
         count(*) FILTER (WHERE status = 'proposition_modifiee')::int AS propositions_a_traiter,
         count(*) FILTER (WHERE status IN ('validee', 'en_preparation', 'prete'))::int AS en_preparation,
         count(*) FILTER (WHERE status IN ('livree', 'livree_partiellement'))::int AS a_receptionner,
         count(*) FILTER (WHERE status IN ('envoyee', 'en_attente_validation', 'proposition_modifiee', 'validee', 'en_preparation', 'prete', 'livree_partiellement', 'livree', 'reception_confirmee'))::int AS en_cours,
         count(*) FILTER (WHERE status = 'brouillon' AND approval_status = 'en_attente')::int AS en_approbation,
         (SELECT count(*)::int FROM claims WHERE buyer_company_id = :companyId AND status = 'ouvert') AS litiges_ouverts,
         (SELECT count(*)::int FROM invoices WHERE buyer_company_id = :companyId AND status <> 'annulee' AND match_status IN ('ecart', 'conteste')) AS factures_bloquees,
         coalesce(sum(total) FILTER (WHERE validated_at >= :debut), 0) AS achats_valides_mois,
         (SELECT count(*)::int FROM partnerships WHERE buyer_company_id = :companyId AND status = 'actif') AS fournisseurs,
         (SELECT count(*)::int FROM invoices WHERE buyer_company_id = :companyId AND status IN ('emise', 'partiellement_payee', 'en_retard')) AS factures_a_payer,
         (SELECT count(*)::int FROM invoices WHERE buyer_company_id = :companyId AND issue_date >= :debutJour) AS factures_recues_mois,
         (SELECT coalesce(sum(amount), 0) FROM payments WHERE buyer_company_id = :companyId AND status = 'confirme' AND paid_on >= :debutJour) AS paiements_mois
       FROM orders WHERE buyer_company_id = :companyId`,
      { replacements: { companyId, ...bornes }, type: QueryTypes.SELECT }
    ),
    situation.dettes(companyId),
  ]);
  return {
    orders: {
      drafts: c.brouillons,
      in_progress: c.en_cours,
      awaiting_supplier: c.en_attente_fournisseur,
      proposals_to_review: c.propositions_a_traiter,
      in_preparation: c.en_preparation,
      to_receive: c.a_receptionner,
      awaiting_internal_approval: c.en_approbation,
    },
    open_claims: c.litiges_ouverts,
    invoices_blocked: c.factures_bloquees,
    suppliers: c.fournisseurs,
    purchases_validated_this_month: n(c.achats_valides_mois),
    invoices: { to_pay: c.factures_a_payer, received_this_month: c.factures_recues_mois },
    amount_due: dettes.totals.balance,
    overdue: dettes.totals.overdue,
    payments_this_month: n(c.paiements_mois),
    top_suppliers_due: dettes.partners.filter((p) => p.balance > 0).slice(0, 5),
  };
}

async function sectionFournisseur(companyId, bornes) {
  const [[c], creances] = await Promise.all([
    sequelize.query(
      `SELECT
         count(*) FILTER (WHERE status = 'envoyee')::int AS nouvelles,
         count(*) FILTER (WHERE status IN ('envoyee', 'en_attente_validation'))::int AS a_traiter,
         count(*) FILTER (WHERE status = 'proposition_modifiee')::int AS en_attente_client,
         count(*) FILTER (WHERE status = 'validee')::int AS validees,
         count(*) FILTER (WHERE status = 'en_preparation')::int AS en_preparation,
         count(*) FILTER (WHERE status = 'prete')::int AS pretes,
         count(*) FILTER (WHERE status = 'livree_partiellement')::int AS livrees_partiellement,
         count(*) FILTER (WHERE status = 'livree')::int AS livrees,
         count(*) FILTER (WHERE status = 'reception_confirmee')::int AS a_facturer,
         coalesce(sum(total) FILTER (WHERE validated_at >= :debut), 0) AS ventes_mois,
         coalesce(sum(total) FILTER (WHERE validated_at >= :debutPrecedent AND validated_at < :debut), 0) AS ventes_mois_precedent,
         (SELECT count(*)::int FROM partnerships WHERE supplier_company_id = :companyId AND status = 'actif') AS clients,
         (SELECT count(*)::int FROM partnerships WHERE supplier_company_id = :companyId AND status = 'en_attente' AND requested_by_company_id <> :companyId) AS demandes_clients,
         (SELECT count(*)::int FROM invoices WHERE supplier_company_id = :companyId AND issue_date >= :debutJour AND status <> 'annulee') AS factures_emises_mois,
         (SELECT coalesce(sum(total), 0) FROM invoices WHERE supplier_company_id = :companyId AND issue_date >= :debutJour AND status <> 'annulee') AS montant_facture_mois,
         (SELECT coalesce(sum(amount), 0) FROM payments WHERE supplier_company_id = :companyId AND status = 'confirme' AND paid_on >= :debutJour) AS paiements_recus_mois,
         (SELECT count(*)::int FROM payments WHERE supplier_company_id = :companyId AND status = 'declare') AS paiements_a_confirmer,
         (SELECT count(*)::int FROM products WHERE company_id = :companyId AND is_active AND deleted_at IS NULL) AS produits_actifs,
         (SELECT count(*)::int FROM products WHERE company_id = :companyId AND is_active AND deleted_at IS NULL AND availability = 'rupture') AS produits_en_rupture,
         (SELECT count(*)::int FROM products WHERE company_id = :companyId AND is_active AND deleted_at IS NULL AND stock_quantity IS NOT NULL
             AND low_stock_threshold IS NOT NULL AND stock_quantity - stock_reserved <= low_stock_threshold) AS produits_stock_bas,
         (SELECT count(*)::int FROM claims WHERE supplier_company_id = :companyId AND status = 'ouvert') AS litiges_a_traiter
       FROM orders WHERE supplier_company_id = :companyId AND status <> 'brouillon'`,
      { replacements: { companyId, ...bornes }, type: QueryTypes.SELECT }
    ),
    situation.creances(companyId),
  ]);
  return {
    orders: {
      new: c.nouvelles,
      to_process: c.a_traiter,
      awaiting_client: c.en_attente_client,
      validated: c.validees,
      in_preparation: c.en_preparation,
      ready: c.pretes,
      partially_delivered: c.livrees_partiellement,
      delivered_awaiting_reception: c.livrees,
      to_invoice: c.a_facturer,
    },
    clients: c.clients,
    partnership_requests: c.demandes_clients,
    invoices_issued_this_month: { count: c.factures_emises_mois, amount: n(c.montant_facture_mois) },
    payments_received_this_month: n(c.paiements_recus_mois),
    payments_to_confirm: c.paiements_a_confirmer,
    receivables: creances.totals.balance,
    overdue: creances.totals.overdue,
    top_clients_owing: creances.partners.filter((p) => p.balance > 0).slice(0, 5),
    sales: { this_month: n(c.ventes_mois), previous_month: n(c.ventes_mois_precedent) },
    catalog: { active_products: c.produits_actifs, out_of_stock: c.produits_en_rupture, low_stock: c.produits_stock_bas },
    claims_to_handle: c.litiges_a_traiter,
  };
}

/** Dernières activités sur les commandes de l'entreprise (§ 18 « dernières activités »). */
async function activites(companyId) {
  return sequelize.query(
    `SELECT e.id, e.type, e.from_status, e.to_status, e.message, e.created_at, e.actor_side,
            o.id AS order_id, o.number, o.status AS order_status,
            ac.name AS actor_company, u.first_name || ' ' || u.last_name AS actor_name
       FROM order_events e
       JOIN orders o ON o.id = e.order_id
       LEFT JOIN companies ac ON ac.id = e.actor_company_id
       LEFT JOIN users u ON u.id = e.actor_user_id
      WHERE (o.buyer_company_id = :companyId OR (o.supplier_company_id = :companyId AND o.status <> 'brouillon' AND e.type NOT IN (:internes)))
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT 10`,
    { replacements: { companyId, internes: EVENEMENTS_INTERNES_ACHETEUR }, type: QueryTypes.SELECT }
  );
}

async function calculer(companyId) {
  const company = await Company.findByPk(companyId, { attributes: ['id', 'name', 'type'] });
  const jour = aujourdhui();
  const debutJour = debutMois(jour);
  const bornes = {
    debutJour,
    debut: new Date(`${debutJour}T00:00:00Z`),
    debutPrecedent: new Date(`${ajouterMois(debutJour, -1)}T00:00:00Z`),
  };
  const [acheteur, fournisseur, activite] = await Promise.all([
    ['acheteur', 'mixte'].includes(company.type) ? sectionAcheteur(companyId, bornes) : null,
    ['fournisseur', 'mixte'].includes(company.type) ? sectionFournisseur(companyId, bornes) : null,
    activites(companyId),
  ]);
  return {
    company: { id: company.id, name: company.name, type: company.type },
    buyer: acheteur,
    supplier: fournisseur,
    recent_activity: activite,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Le compteur de notifications non lues est PROPRE à l'utilisateur : il est
 * lu hors cache (requête indexée) et ajouté à la réponse.
 */
async function tableauDeBord(companyId, userId) {
  let donnees = await cache.lire(cle(companyId));
  if (!donnees) {
    donnees = await cache.volUnique(cle(companyId), async () => {
      const r = await calculer(companyId);
      await cache.ecrire(cle(companyId), r, TTL_S);
      return r;
    });
  }
  const [[{ non_lues: nonLues }]] = await sequelize.query(
    'SELECT count(*)::int AS non_lues FROM notifications WHERE user_id = :userId AND read_at IS NULL',
    { replacements: { userId } }
  );
  return { ...donnees, unread_notifications: nonLues };
}

module.exports = { tableauDeBord, calculer };
