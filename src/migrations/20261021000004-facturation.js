'use strict';

const E = require('../config/enums.js');
const { dans, HORODATAGE, executer } = require('../database/migrationHelpers.js');

/**
 * Modèles de documents, facturation, paiements (§ 14 à § 16).
 *
 *   - document_templates : modèles de bon de commande et de facture propres à
 *     chaque entreprise, VERSIONNÉS (un document émis garde la version de
 *     modèle avec laquelle il a été produit, § 15).
 *   - invoices / invoice_lines : facture associée à UNE commande ; lignes
 *     figées (quantités réceptionnées).
 *   - payments / payment_allocations : paiements entre deux partenaires et
 *     leur imputation sur les factures. Le solde dû est calculé à partir des
 *     factures et des paiements (§ 16) — jamais saisi.
 */
module.exports = {
  async up(queryInterface) {
    await executer(queryInterface, [
      `CREATE TABLE document_templates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES companies(id),
        type varchar(15) NOT NULL ${dans('type', E.TYPE_MODELE_DOCUMENT)},
        version integer NOT NULL CHECK (version >= 1),
        status varchar(10) NOT NULL DEFAULT 'actif' ${dans('status', E.STATUT_MODELE_DOCUMENT)},
        name varchar(120) NOT NULL,
        accent_color char(7) NOT NULL DEFAULT '#0F4C81' CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
        header_text text,
        footer_text text,
        legal_mentions text,
        show_logo boolean NOT NULL DEFAULT true,
        background_document_id uuid REFERENCES documents(id),
        margin_top integer NOT NULL DEFAULT 50 CHECK (margin_top BETWEEN 20 AND 300),
        margin_bottom integer NOT NULL DEFAULT 60 CHECK (margin_bottom BETWEEN 20 AND 300),
        created_by uuid REFERENCES users(id),
        archived_at timestamptz,
        ${HORODATAGE},
        CONSTRAINT document_templates_version_uq UNIQUE (company_id, type, version)
      )`,
      // Un seul modèle ACTIF par entreprise et par type ; sans modèle actif,
      // le modèle standard de Pro2Link s'applique.
      "CREATE UNIQUE INDEX document_templates_actif_uq ON document_templates (company_id, type) WHERE status = 'actif'",

      'ALTER TABLE orders ADD COLUMN template_id uuid REFERENCES document_templates(id)',

      `CREATE TABLE invoices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        number varchar(40) NOT NULL,
        supplier_company_id uuid NOT NULL REFERENCES companies(id),
        buyer_company_id uuid NOT NULL REFERENCES companies(id),
        partnership_id uuid NOT NULL REFERENCES partnerships(id),
        order_id uuid NOT NULL REFERENCES orders(id),
        status varchar(20) NOT NULL DEFAULT 'emise' ${dans('status', E.STATUT_FACTURE)},
        source varchar(10) NOT NULL DEFAULT 'generee' ${dans('source', E.SOURCE_FACTURE)},
        issue_date date NOT NULL,
        due_date date NOT NULL,
        currency char(3) NOT NULL DEFAULT 'XOF',
        subtotal bigint NOT NULL CHECK (subtotal >= 0),
        tax_total bigint NOT NULL CHECK (tax_total >= 0),
        total bigint NOT NULL CHECK (total >= 0),
        amount_paid bigint NOT NULL DEFAULT 0,
        template_id uuid REFERENCES document_templates(id),
        file_document_id uuid REFERENCES documents(id),
        note text,
        due_soon_notified_at timestamptz,
        overdue_notified_at timestamptz,
        cancelled_at timestamptz,
        cancellation_reason text,
        created_by uuid REFERENCES users(id),
        ${HORODATAGE},
        CONSTRAINT invoices_numero_uq UNIQUE (supplier_company_id, number),
        CONSTRAINT invoices_totaux_ck CHECK (total = subtotal + tax_total),
        CONSTRAINT invoices_paye_ck CHECK (amount_paid >= 0 AND amount_paid <= total),
        CONSTRAINT invoices_echeance_ck CHECK (due_date >= issue_date),
        CONSTRAINT invoices_import_ck CHECK (source <> 'importee' OR file_document_id IS NOT NULL)
      )`,
      // § 14 — UNE facture en vigueur par commande (une facture annulée libère la commande).
      "CREATE UNIQUE INDEX invoices_commande_uq ON invoices (order_id) WHERE status <> 'annulee'",
      'CREATE INDEX invoices_supplier_idx ON invoices (supplier_company_id, status, issue_date DESC)',
      'CREATE INDEX invoices_buyer_idx ON invoices (buyer_company_id, status, issue_date DESC)',
      'CREATE INDEX invoices_partnership_idx ON invoices (partnership_id, status, due_date)',
      "CREATE INDEX invoices_echeance_idx ON invoices (due_date) WHERE status IN ('emise', 'partiellement_payee', 'en_retard')",

      `CREATE TABLE invoice_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        line_no integer NOT NULL CHECK (line_no >= 1),
        product_id uuid REFERENCES products(id),
        reference varchar(60),
        name varchar(200) NOT NULL,
        unit varchar(12) NOT NULL ${dans('unit', E.UNITE)},
        quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
        unit_price bigint NOT NULL CHECK (unit_price >= 0),
        tax_rate numeric(5,2) NOT NULL DEFAULT 0,
        line_subtotal bigint NOT NULL,
        line_tax bigint NOT NULL,
        line_total bigint NOT NULL,
        CONSTRAINT invoice_lines_uq UNIQUE (invoice_id, line_no),
        CONSTRAINT invoice_lines_totaux_ck CHECK (line_total = line_subtotal + line_tax)
      )`,

      `CREATE TABLE payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        reference varchar(40) NOT NULL,
        supplier_company_id uuid NOT NULL REFERENCES companies(id),
        buyer_company_id uuid NOT NULL REFERENCES companies(id),
        partnership_id uuid NOT NULL REFERENCES partnerships(id),
        amount bigint NOT NULL CHECK (amount > 0),
        allocated_amount bigint NOT NULL DEFAULT 0,
        currency char(3) NOT NULL DEFAULT 'XOF',
        method varchar(15) NOT NULL ${dans('method', E.MODE_PAIEMENT)},
        paid_on date NOT NULL,
        external_reference varchar(100),
        note text,
        status varchar(10) NOT NULL ${dans('status', E.STATUT_PAIEMENT)},
        recorded_by_side varchar(12) NOT NULL ${dans('recorded_by_side', E.COTE)},
        recorded_by uuid REFERENCES users(id),
        confirmed_at timestamptz,
        confirmed_by uuid REFERENCES users(id),
        rejected_at timestamptz,
        rejection_reason text,
        cancelled_at timestamptz,
        cancellation_reason text,
        proof_document_id uuid REFERENCES documents(id),
        ${HORODATAGE},
        CONSTRAINT payments_reference_uq UNIQUE (supplier_company_id, reference),
        CONSTRAINT payments_imputation_ck CHECK (allocated_amount >= 0 AND allocated_amount <= amount),
        -- Un paiement déclaré par le client n'est jamais « confirmé » sans le fournisseur.
        CONSTRAINT payments_confirmation_ck CHECK (status <> 'confirme' OR confirmed_at IS NOT NULL)
      )`,
      'CREATE INDEX payments_supplier_idx ON payments (supplier_company_id, status, paid_on DESC)',
      'CREATE INDEX payments_buyer_idx ON payments (buyer_company_id, status, paid_on DESC)',
      'CREATE INDEX payments_partnership_idx ON payments (partnership_id, status)',

      `CREATE TABLE payment_allocations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_id uuid NOT NULL REFERENCES payments(id),
        invoice_id uuid NOT NULL REFERENCES invoices(id),
        amount bigint NOT NULL CHECK (amount > 0),
        cancelled_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      'CREATE UNIQUE INDEX payment_allocations_actives_uq ON payment_allocations (payment_id, invoice_id) WHERE cancelled_at IS NULL',
      'CREATE INDEX payment_allocations_invoice_idx ON payment_allocations (invoice_id) WHERE cancelled_at IS NULL',
    ]);
  },

  async down(queryInterface) {
    await executer(queryInterface, [
      'DROP TABLE IF EXISTS payment_allocations, payments, invoice_lines, invoices CASCADE',
      'ALTER TABLE orders DROP COLUMN IF EXISTS template_id',
      'DROP TABLE IF EXISTS document_templates CASCADE',
    ]);
  },
};
