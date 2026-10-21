'use strict';

const { QueryTypes } = require('sequelize');
const sequelize = require('../../../config/db.js');
const { Company } = require('../../../models/index.js');
const { parametresEntreprise, comptesComptables } = require('../../../config/parametres.js');
const { tableauCsv } = require('./csv.js');

/**
 * Export comptable (§ 27 « intégration comptable ») : écritures en partie
 * double au plan SYSCOHADA révisé, prêtes à importer dans Sage, Ciel, Odoo
 * ou un tableur — une ligne par écriture, chaque pièce équilibrée.
 *
 *   journal des VENTES (fournisseur) : factures émises
 *       411 Clients (débit TTC) / 701 Ventes (crédit HT) / 4431 TVA collectée (crédit)
 *     avoirs émis : écriture inverse sur 7019 Rabais, remises et ristournes accordés ;
 *   journal des ACHATS (acheteur) : factures reçues
 *       601 Achats (débit HT) / 4452 TVA récupérable (débit) / 401 Fournisseurs (crédit TTC)
 *     avoirs reçus : écriture inverse sur 6019 RRR obtenus ;
 *   journal de TRÉSORERIE : paiements confirmés reçus ou effectués, par
 *     caisse (espèces), mobile money (Wave, Orange Money, Free Money) ou banque.
 *
 * Les comptes sont surchargeables par l'entreprise (`accounting_accounts`).
 * Le compte de tiers est le code client du partenariat quand le fournisseur
 * l'a renseigné, sinon un code dérivé du nom.
 */

const ENTETES = ['Journal', 'Date', 'Pièce', 'Compte', 'Compte tiers', 'Libellé', 'Débit', 'Crédit', 'Échéance'];

const dateFr = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

/** Code tiers dérivé d'un nom : préfixe + 10 caractères alphanumériques majuscules. */
function codeTiers(prefixe, nom, code = null) {
  if (code) return code;
  const base = String(nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  return `${prefixe}${base || 'DIVERS'}`;
}

const MOBILE_MONEY = ['wave', 'orange_money', 'free_money'];

function tresorerie(methode, comptes) {
  if (methode === 'especes') return { journal: 'CA', compte: comptes.caisse };
  if (MOBILE_MONEY.includes(methode)) return { journal: 'MM', compte: comptes.mobile_money };
  return { journal: 'BQ', compte: comptes.banque };
}

/** Écriture : lignes non nulles seulement (une TVA à 0 n'est pas écrite). */
const ecriture = (lignes) => lignes.filter((l) => Number(l[6]) > 0 || Number(l[7]) > 0);

async function ventes(companyId, b, comptes) {
  const [factures, avoirs] = await Promise.all([
    sequelize.query(
      `SELECT i.number, i.issue_date::text AS date, i.due_date::text AS due, i.subtotal, i.tax_total, i.total,
              c.name AS client, ps.supplier_customer_code AS code
         FROM invoices i JOIN companies c ON c.id = i.buyer_company_id JOIN partnerships ps ON ps.id = i.partnership_id
        WHERE i.supplier_company_id = :companyId AND i.status <> 'annulee' AND i.issue_date BETWEEN :debut AND :fin
        ORDER BY i.issue_date, i.number`,
      { replacements: { companyId, ...b }, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT a.number, a.issue_date::text AS date, a.subtotal, a.tax_total, a.total, c.name AS client, ps.supplier_customer_code AS code
         FROM credit_notes a JOIN companies c ON c.id = a.buyer_company_id JOIN partnerships ps ON ps.id = a.partnership_id
        WHERE a.supplier_company_id = :companyId AND a.status = 'emis' AND a.issue_date BETWEEN :debut AND :fin
        ORDER BY a.issue_date, a.number`,
      { replacements: { companyId, ...b }, type: QueryTypes.SELECT }
    ),
  ]);
  const lignes = [];
  for (const f of factures) {
    const tiers = codeTiers('C', f.client, f.code);
    const libelle = `Facture ${f.number} ${f.client}`;
    lignes.push(...ecriture([
      ['VE', dateFr(f.date), f.number, comptes.clients, tiers, libelle, Number(f.total), 0, dateFr(f.due)],
      ['VE', dateFr(f.date), f.number, comptes.ventes, '', libelle, 0, Number(f.subtotal), ''],
      ['VE', dateFr(f.date), f.number, comptes.tva_collectee, '', libelle, 0, Number(f.tax_total), ''],
    ]));
  }
  for (const a of avoirs) {
    const tiers = codeTiers('C', a.client, a.code);
    const libelle = `Avoir ${a.number} ${a.client}`;
    lignes.push(...ecriture([
      ['VE', dateFr(a.date), a.number, comptes.rrr_accordes, '', libelle, Number(a.subtotal), 0, ''],
      ['VE', dateFr(a.date), a.number, comptes.tva_collectee, '', libelle, Number(a.tax_total), 0, ''],
      ['VE', dateFr(a.date), a.number, comptes.clients, tiers, libelle, 0, Number(a.total), ''],
    ]));
  }
  return lignes;
}

async function achats(companyId, b, comptes) {
  const [factures, avoirs] = await Promise.all([
    sequelize.query(
      `SELECT i.number, i.issue_date::text AS date, i.due_date::text AS due, i.subtotal, i.tax_total, i.total, c.name AS fournisseur
         FROM invoices i JOIN companies c ON c.id = i.supplier_company_id
        WHERE i.buyer_company_id = :companyId AND i.status <> 'annulee' AND i.issue_date BETWEEN :debut AND :fin
        ORDER BY i.issue_date, i.number`,
      { replacements: { companyId, ...b }, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT a.number, a.issue_date::text AS date, a.subtotal, a.tax_total, a.total, c.name AS fournisseur
         FROM credit_notes a JOIN companies c ON c.id = a.supplier_company_id
        WHERE a.buyer_company_id = :companyId AND a.status = 'emis' AND a.issue_date BETWEEN :debut AND :fin
        ORDER BY a.issue_date, a.number`,
      { replacements: { companyId, ...b }, type: QueryTypes.SELECT }
    ),
  ]);
  const lignes = [];
  for (const f of factures) {
    const tiers = codeTiers('F', f.fournisseur);
    const libelle = `Facture ${f.number} ${f.fournisseur}`;
    lignes.push(...ecriture([
      ['AC', dateFr(f.date), f.number, comptes.achats, '', libelle, Number(f.subtotal), 0, ''],
      ['AC', dateFr(f.date), f.number, comptes.tva_deductible, '', libelle, Number(f.tax_total), 0, ''],
      ['AC', dateFr(f.date), f.number, comptes.fournisseurs, tiers, libelle, 0, Number(f.total), dateFr(f.due)],
    ]));
  }
  for (const a of avoirs) {
    const tiers = codeTiers('F', a.fournisseur);
    const libelle = `Avoir ${a.number} ${a.fournisseur}`;
    lignes.push(...ecriture([
      ['AC', dateFr(a.date), a.number, comptes.fournisseurs, tiers, libelle, Number(a.total), 0, ''],
      ['AC', dateFr(a.date), a.number, comptes.rrr_obtenus, '', libelle, 0, Number(a.subtotal), ''],
      ['AC', dateFr(a.date), a.number, comptes.tva_deductible, '', libelle, 0, Number(a.tax_total), ''],
    ]));
  }
  return lignes;
}

async function reglements(companyId, b, comptes) {
  const paiements = await sequelize.query(
    `SELECT p.reference, p.paid_on::text AS date, p.amount, p.method, p.external_reference,
            p.supplier_company_id = :companyId AS recu, ach.name AS client, fou.name AS fournisseur, ps.supplier_customer_code AS code
       FROM payments p JOIN companies ach ON ach.id = p.buyer_company_id JOIN companies fou ON fou.id = p.supplier_company_id
       JOIN partnerships ps ON ps.id = p.partnership_id
      WHERE (p.supplier_company_id = :companyId OR p.buyer_company_id = :companyId) AND p.status = 'confirme'
        AND p.paid_on BETWEEN :debut AND :fin
      ORDER BY p.paid_on, p.reference`,
    { replacements: { companyId, ...b }, type: QueryTypes.SELECT }
  );
  const lignes = [];
  for (const p of paiements) {
    const { journal, compte } = tresorerie(p.method, comptes);
    const montant = Number(p.amount);
    const piece = p.reference;
    if (p.recu) {
      const libelle = `Règlement ${p.client}${p.external_reference ? ` ${p.external_reference}` : ''}`;
      lignes.push(
        [journal, dateFr(p.date), piece, compte, '', libelle, montant, 0, ''],
        [journal, dateFr(p.date), piece, comptes.clients, codeTiers('C', p.client, p.code), libelle, 0, montant, '']
      );
    } else {
      const libelle = `Paiement ${p.fournisseur}${p.external_reference ? ` ${p.external_reference}` : ''}`;
      lignes.push(
        [journal, dateFr(p.date), piece, comptes.fournisseurs, codeTiers('F', p.fournisseur), libelle, montant, 0, ''],
        [journal, dateFr(p.date), piece, compte, '', libelle, 0, montant, '']
      );
    }
  }
  return lignes;
}

const JOURNAUX = { journal_ventes: ventes, journal_achats: achats, journal_tresorerie: reglements };

/**
 * @param {'journal_ventes'|'journal_achats'|'journal_tresorerie'} type
 * @param {{ debut: string, fin: string }} bornes
 */
async function journal(companyId, type, bornes) {
  const company = await Company.findByPk(companyId, { attributes: ['settings'] });
  const comptes = comptesComptables(parametresEntreprise(company));
  const lignes = await JOURNAUX[type](companyId, { debut: bornes.debut, fin: bornes.fin }, comptes);
  return tableauCsv(ENTETES, lignes);
}

module.exports = { journal, JOURNAUX: Object.keys(JOURNAUX), codeTiers };
