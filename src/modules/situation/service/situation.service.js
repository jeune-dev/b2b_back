'use strict';

const { QueryTypes } = require('sequelize');
const sequelize = require('../../../config/db.js');
const { Partnership, Company } = require('../../../models/index.js');
const { chargerPartage } = require('../../../utils/acces.js');
const { aujourdhui } = require('../../../utils/dates.js');

/**
 * Dettes et créances (§ 16) : « le solde est calculé à partir des factures et
 * paiements enregistrés » — jamais saisi.
 *
 *   facturé  = factures en vigueur (non annulées) ;
 *   payé     = paiements CONFIRMÉS (un paiement seulement déclaré par
 *              l'acheteur n'est pas encore compté) ;
 *   solde    = facturé − payé (négatif : avoir / acompte du client) ;
 *   en retard = reste dû des factures dont l'échéance est passée.
 *
 * Une requête d'agrégat par vue, regroupée par partenariat (jamais une
 * requête par partenaire).
 */

const REQUETE = (cote) => `
  WITH f AS (
    SELECT partnership_id,
           sum(total) AS facture,
           sum(total - amount_paid) FILTER (WHERE status IN ('emise', 'partiellement_payee', 'en_retard')) AS reste_du,
           sum(total - amount_paid) FILTER (WHERE status IN ('emise', 'partiellement_payee', 'en_retard') AND due_date < :jour) AS en_retard,
           count(*) FILTER (WHERE status IN ('emise', 'partiellement_payee', 'en_retard')) AS factures_ouvertes,
           count(*) FILTER (WHERE status = 'payee') AS factures_payees,
           min(due_date) FILTER (WHERE status IN ('emise', 'partiellement_payee', 'en_retard')) AS prochaine_echeance
      FROM invoices WHERE status <> 'annulee' GROUP BY partnership_id
  ), p AS (
    SELECT partnership_id,
           sum(amount) FILTER (WHERE status = 'confirme') AS paye,
           sum(amount) FILTER (WHERE status = 'declare') AS declare,
           max(paid_on) FILTER (WHERE status = 'confirme') AS dernier_paiement
      FROM payments GROUP BY partnership_id
  )
  SELECT ps.id AS partnership_id, ps.status, c.id AS partner_id, c.name AS partner_name, c.logo_document_id,
         coalesce(f.facture, 0) AS invoiced, coalesce(p.paye, 0) AS paid,
         coalesce(f.facture, 0) - coalesce(p.paye, 0) AS balance,
         coalesce(f.reste_du, 0) AS open_amount, coalesce(f.en_retard, 0) AS overdue,
         coalesce(p.declare, 0) AS declared_pending,
         coalesce(f.factures_ouvertes, 0)::int AS open_invoices, coalesce(f.factures_payees, 0)::int AS paid_invoices,
         f.prochaine_echeance::text AS next_due_date, p.dernier_paiement::text AS last_payment_on
    FROM partnerships ps
    JOIN companies c ON c.id = ps.${cote === 'acheteur' ? 'supplier_company_id' : 'buyer_company_id'}
    LEFT JOIN f ON f.partnership_id = ps.id
    LEFT JOIN p ON p.partnership_id = ps.id
   WHERE ps.${cote === 'acheteur' ? 'buyer_company_id' : 'supplier_company_id'} = :companyId
     AND (f.facture IS NOT NULL OR p.paye IS NOT NULL OR p.declare IS NOT NULL OR ps.status = 'actif')
   ORDER BY balance DESC, c.name ASC`;

function synthese(lignes) {
  const nombre = (v) => Number(v || 0);
  const parPartenaire = lignes.map((l) => ({
    partnership_id: l.partnership_id,
    partnership_status: l.status,
    partner: { id: l.partner_id, name: l.partner_name, logo_url: l.logo_document_id ? `/api/v1/documents/${l.logo_document_id}/fichier` : null },
    invoiced: nombre(l.invoiced),
    paid: nombre(l.paid),
    balance: nombre(l.balance),
    open_amount: nombre(l.open_amount),
    overdue: nombre(l.overdue),
    declared_pending: nombre(l.declared_pending),
    open_invoices: l.open_invoices,
    paid_invoices: l.paid_invoices,
    next_due_date: l.next_due_date,
    last_payment_on: l.last_payment_on,
  }));
  const somme = (champ) => parPartenaire.reduce((s, l) => s + l[champ], 0);
  return {
    totals: {
      invoiced: somme('invoiced'),
      paid: somme('paid'),
      balance: somme('balance'),
      overdue: somme('overdue'),
      declared_pending: somme('declared_pending'),
      partners_with_balance: parPartenaire.filter((l) => l.balance > 0).length,
    },
    partners: parPartenaire,
  };
}

/** § 16 côté acheteur — « ce qu'il doit à chaque fournisseur ». */
async function dettes(companyId) {
  const lignes = await sequelize.query(REQUETE('acheteur'), { replacements: { companyId, jour: aujourdhui() }, type: QueryTypes.SELECT });
  return synthese(lignes);
}

/** § 16 côté fournisseur — « ce que chaque client lui doit ». */
async function creances(companyId) {
  const lignes = await sequelize.query(REQUETE('fournisseur'), { replacements: { companyId, jour: aujourdhui() }, type: QueryTypes.SELECT });
  return synthese(lignes);
}

/**
 * Relevé de compte d'un partenariat : factures (débit) et paiements
 * confirmés (crédit) dans l'ordre chronologique, avec solde progressif et
 * solde d'ouverture avant la période.
 */
async function releve(partnershipId, companyId, { du = null, au = null } = {}) {
  const { ressource: partenariat, cote } = await chargerPartage(Partnership, partnershipId, companyId, {
    include: [
      { model: Company, as: 'buyer', attributes: ['id', 'name'], paranoid: false },
      { model: Company, as: 'supplier', attributes: ['id', 'name'], paranoid: false },
    ],
  }, 'Partenariat');
  const fin = au || aujourdhui();
  const mouvements = await sequelize.query(
    `SELECT * FROM (
       SELECT 'facture' AS type, id, number AS reference, issue_date::text AS date, total AS debit, 0 AS credit, status, due_date::text AS due_date, created_at
         FROM invoices WHERE partnership_id = :id AND status <> 'annulee'
       UNION ALL
       SELECT 'paiement' AS type, id, reference, paid_on::text AS date, 0 AS debit, amount AS credit, status, NULL::text AS due_date, created_at
         FROM payments WHERE partnership_id = :id AND status = 'confirme'
     ) m WHERE m.date <= :fin ORDER BY m.date ASC, m.created_at ASC, m.reference ASC`,
    { replacements: { id: partenariat.id, fin }, type: QueryTypes.SELECT }
  );
  let ouverture = 0;
  let solde = 0;
  const lignes = [];
  for (const m of mouvements) {
    const debit = Number(m.debit);
    const credit = Number(m.credit);
    if (du && m.date < du) {
      ouverture += debit - credit;
      solde = ouverture;
      continue;
    }
    solde += debit - credit;
    lignes.push({ type: m.type, id: m.id, reference: m.reference, date: m.date, debit, credit, balance: solde, status: m.status, due_date: m.due_date });
  }
  return {
    partnership_id: partenariat.id,
    side: cote,
    buyer: partenariat.buyer,
    supplier: partenariat.supplier,
    period: { start: du, end: fin },
    opening_balance: ouverture,
    closing_balance: solde,
    total_debit: lignes.reduce((s, l) => s + l.debit, 0),
    total_credit: lignes.reduce((s, l) => s + l.credit, 0),
    lines: lignes,
  };
}

module.exports = { dettes, creances, releve };
