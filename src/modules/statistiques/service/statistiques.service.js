'use strict';

const { QueryTypes } = require('sequelize');
const sequelize = require('../../../config/db.js');
const { STATUT_COMMANDE, STATUT_FACTURE, MODE_PAIEMENT, STATUT_PAIEMENT } = require('../../../config/enums.js');
const { aujourdhui, debutMois, ajouterMois } = require('../../../utils/dates.js');
const { versCsv } = require('./csv.js');

/**
 * Statistiques (§ 21) et exports CSV (§ 27 « intégration comptable » : une
 * entreprise reprend ses achats, ventes, factures et paiements dans son
 * logiciel ou son tableur).
 *
 * Achats et ventes sont la même mesure vue de chaque côté : commandes
 * VALIDÉES (la référence officielle, § 11) sur la période, par mois, par
 * partenaire, par produit. Période par défaut : les 12 derniers mois.
 */

const EXPORT_MAX = parseInt(process.env.EXPORT_MAX_LIGNES || '10000', 10);

function bornes({ du, au }) {
  const fin = au || aujourdhui();
  const debut = du || debutMois(ajouterMois(fin, -11));
  return { debut, fin, debutTs: new Date(`${debut}T00:00:00Z`), finTs: new Date(`${fin}T23:59:59.999Z`) };
}

/**
 * @param {'acheteur'|'fournisseur'} cote
 */
async function analyse(companyId, cote, filtres) {
  const b = bornes(filtres);
  const moi = cote === 'acheteur' ? 'buyer_company_id' : 'supplier_company_id';
  const autre = cote === 'acheteur' ? 'supplier_company_id' : 'buyer_company_id';
  const remplacements = { companyId, ...b };
  const valides = `o.${moi} = :companyId AND o.validated_at BETWEEN :debutTs AND :finTs
    AND o.status NOT IN ('annulee', 'refusee')`;

  const [parMois, parPartenaire, parProduit, [synthese]] = await Promise.all([
    sequelize.query(
      `SELECT to_char(o.validated_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month, count(*)::int AS orders, coalesce(sum(o.total), 0) AS amount
         FROM orders o WHERE ${valides} GROUP BY 1 ORDER BY 1`,
      { replacements: remplacements, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT c.id AS partner_id, c.name AS partner_name, count(*)::int AS orders, coalesce(sum(o.total), 0) AS amount,
              coalesce(avg(o.total), 0)::bigint AS average_order
         FROM orders o JOIN companies c ON c.id = o.${autre}
        WHERE ${valides} GROUP BY c.id, c.name ORDER BY amount DESC LIMIT 50`,
      { replacements: remplacements, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT l.product_id, l.reference, l.name, l.unit, sum(coalesce(l.received_quantity, l.quantity)) AS quantity,
              coalesce(sum(l.line_subtotal), 0) AS amount, count(DISTINCT o.id)::int AS orders
         FROM orders o
         JOIN order_versions v ON v.order_id = o.id AND v.version_no = o.validated_version_no
         JOIN order_lines l ON l.version_id = v.id
        WHERE ${valides} AND l.quantity > 0
        GROUP BY l.product_id, l.reference, l.name, l.unit ORDER BY amount DESC LIMIT 20`,
      { replacements: remplacements, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT
         (SELECT count(*)::int FROM orders o WHERE ${valides}) AS orders,
         (SELECT coalesce(sum(o.total), 0) FROM orders o WHERE ${valides}) AS amount,
         (SELECT count(*)::int FROM orders o WHERE o.${moi} = :companyId AND o.status IN ('annulee', 'refusee')
            AND coalesce(o.cancelled_at, o.refused_at) BETWEEN :debutTs AND :finTs) AS cancelled_or_refused,
         (SELECT coalesce(sum(i.total), 0) FROM invoices i WHERE i.${moi} = :companyId AND i.status <> 'annulee' AND i.issue_date BETWEEN :debut AND :fin) AS invoiced,
         (SELECT coalesce(sum(p.amount), 0) FROM payments p WHERE p.${moi} = :companyId AND p.status = 'confirme' AND p.paid_on BETWEEN :debut AND :fin) AS paid,
         (SELECT avg(EXTRACT(EPOCH FROM (o.validated_at - o.sent_at)) / 3600) FROM orders o WHERE ${valides} AND o.sent_at IS NOT NULL) AS avg_validation_hours,
         (SELECT count(*)::int FROM orders o WHERE ${valides} AND o.validated_version_no > 1) AS negotiated_orders`,
      { replacements: remplacements, type: QueryTypes.SELECT }
    ),
  ]);
  const nb = (v) => Number(v || 0);
  return {
    period: { start: b.debut, end: b.fin },
    summary: {
      orders: synthese.orders,
      amount: nb(synthese.amount),
      average_order: synthese.orders ? Math.round(nb(synthese.amount) / synthese.orders) : 0,
      cancelled_or_refused: synthese.cancelled_or_refused,
      negotiated_orders: synthese.negotiated_orders,
      invoiced: nb(synthese.invoiced),
      paid: nb(synthese.paid),
      avg_validation_hours: synthese.avg_validation_hours === null ? null : Math.round(Number(synthese.avg_validation_hours) * 10) / 10,
    },
    by_month: parMois.map((m) => ({ month: m.month, orders: m.orders, amount: nb(m.amount) })),
    by_partner: parPartenaire.map((p) => ({ partner_id: p.partner_id, partner_name: p.partner_name, orders: p.orders, amount: nb(p.amount), average_order: nb(p.average_order) })),
    top_products: parProduit.map((p) => ({ product_id: p.product_id, reference: p.reference, name: p.name, unit: p.unit, quantity: nb(p.quantity), amount: nb(p.amount), orders: p.orders })),
  };
}

const achats = (companyId, filtres) => analyse(companyId, 'acheteur', filtres);
const ventes = (companyId, filtres) => analyse(companyId, 'fournisseur', filtres);

// ── Exports CSV ─────────────────────────────────────────────────────────────

/** Côté(s) de l'entreprise : « achats » / « ventes » ; sans précision, les deux. */
const conditionSens = (sens, alias) => {
  if (sens === 'achats') return `${alias}.buyer_company_id = :companyId`;
  if (sens === 'ventes') return `${alias}.supplier_company_id = :companyId`;
  return `(${alias}.buyer_company_id = :companyId OR ${alias}.supplier_company_id = :companyId)`;
};

async function exporter(companyId, type, filtres) {
  const b = bornes(filtres);
  const remplacements = { companyId, ...b, max: EXPORT_MAX };
  if (type === 'commandes') {
    const lignes = await sequelize.query(
      `SELECT o.number, to_char(o.created_at, 'YYYY-MM-DD') AS created, to_char(o.sent_at, 'YYYY-MM-DD') AS sent,
              to_char(o.validated_at, 'YYYY-MM-DD') AS validated, o.status, ach.name AS acheteur, fou.name AS fournisseur,
              o.buyer_reference, o.subtotal, o.tax_total, o.total, o.lines_count,
              CASE WHEN o.buyer_company_id = :companyId THEN 'achat' ELSE 'vente' END AS sens
         FROM orders o JOIN companies ach ON ach.id = o.buyer_company_id JOIN companies fou ON fou.id = o.supplier_company_id
        WHERE ${conditionSens(filtres.sens, 'o')} AND NOT (o.supplier_company_id = :companyId AND o.status = 'brouillon')
          AND o.created_at BETWEEN :debutTs AND :finTs
        ORDER BY o.created_at DESC LIMIT :max`,
      { replacements: remplacements, type: QueryTypes.SELECT }
    );
    return versCsv([{
      titre: `Commandes du ${b.debut} au ${b.fin}`,
      entetes: ['Numéro', 'Sens', 'Créée le', 'Envoyée le', 'Validée le', 'Statut', 'Acheteur', 'Fournisseur', 'Référence acheteur', 'Lignes', 'Total HT', 'TVA', 'Total TTC'],
      lignes: lignes.map((l) => [l.number, l.sens, l.created, l.sent, l.validated, STATUT_COMMANDE[l.status], l.acheteur, l.fournisseur, l.buyer_reference, l.lines_count, Number(l.subtotal), Number(l.tax_total), Number(l.total)]),
    }]);
  }
  if (type === 'factures') {
    const lignes = await sequelize.query(
      `SELECT i.number, i.issue_date::text AS issue, i.due_date::text AS due, i.status, fou.name AS fournisseur, ach.name AS acheteur,
              o.number AS commande, i.subtotal, i.tax_total, i.total, i.amount_paid,
              CASE WHEN i.buyer_company_id = :companyId THEN 'reçue' ELSE 'émise' END AS sens
         FROM invoices i JOIN companies ach ON ach.id = i.buyer_company_id JOIN companies fou ON fou.id = i.supplier_company_id
         JOIN orders o ON o.id = i.order_id
        WHERE ${conditionSens(filtres.sens, 'i')} AND i.issue_date BETWEEN :debut AND :fin
        ORDER BY i.issue_date DESC, i.number DESC LIMIT :max`,
      { replacements: remplacements, type: QueryTypes.SELECT }
    );
    return versCsv([{
      titre: `Factures du ${b.debut} au ${b.fin}`,
      entetes: ['Numéro', 'Sens', 'Date', 'Échéance', 'Statut', 'Fournisseur', 'Client', 'Commande', 'Total HT', 'TVA', 'Total TTC', 'Payé', 'Reste dû'],
      lignes: lignes.map((l) => [l.number, l.sens, l.issue, l.due, STATUT_FACTURE[l.status], l.fournisseur, l.acheteur, l.commande, Number(l.subtotal), Number(l.tax_total), Number(l.total), Number(l.amount_paid), l.status === 'annulee' ? 0 : Number(l.total) - Number(l.amount_paid)]),
    }]);
  }
  const lignes = await sequelize.query(
    `SELECT p.reference, p.paid_on::text AS paid_on, p.method, p.status, p.amount, p.allocated_amount, p.external_reference,
            fou.name AS fournisseur, ach.name AS acheteur,
            CASE WHEN p.buyer_company_id = :companyId THEN 'effectué' ELSE 'reçu' END AS sens
       FROM payments p JOIN companies ach ON ach.id = p.buyer_company_id JOIN companies fou ON fou.id = p.supplier_company_id
      WHERE ${conditionSens(filtres.sens, 'p')} AND p.paid_on BETWEEN :debut AND :fin
      ORDER BY p.paid_on DESC, p.reference DESC LIMIT :max`,
    { replacements: remplacements, type: QueryTypes.SELECT }
  );
  return versCsv([{
    titre: `Paiements du ${b.debut} au ${b.fin}`,
    entetes: ['Référence', 'Sens', 'Date', 'Mode', 'Statut', 'Fournisseur', 'Client', 'Montant', 'Imputé', 'Référence externe'],
    lignes: lignes.map((l) => [l.reference, l.sens, l.paid_on, MODE_PAIEMENT[l.method], STATUT_PAIEMENT[l.status], l.fournisseur, l.acheteur, Number(l.amount), Number(l.allocated_amount), l.external_reference]),
  }]);
}

module.exports = { achats, ventes, exporter, bornes };
