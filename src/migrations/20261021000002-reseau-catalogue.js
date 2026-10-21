'use strict';

const E = require('../config/enums.js');
const { dans, HORODATAGE, executer } = require('../database/migrationHelpers.js');

/**
 * Réseau d'affaires et catalogue (§ 7, § 8).
 *
 *   - partnerships : relation acheteur ↔ fournisseur entre deux entreprises
 *     de la plateforme. C'est elle qui ouvre l'accès au catalogue, aux
 *     commandes, aux factures et aux paiements entre les deux.
 *   - partnership_invitations : invitation d'un fournisseur ou d'un client
 *     qui n'est pas encore sur Pro2Link (« enregistrer ses fournisseurs »).
 *   - product_categories, products : catalogue d'un fournisseur.
 */
module.exports = {
  async up(queryInterface) {
    await executer(queryInterface, [
      `CREATE TABLE partnerships (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        buyer_company_id uuid NOT NULL REFERENCES companies(id),
        supplier_company_id uuid NOT NULL REFERENCES companies(id),
        status varchar(12) NOT NULL DEFAULT 'en_attente' ${dans('status', E.STATUT_PARTENARIAT)},
        requested_by_company_id uuid NOT NULL REFERENCES companies(id),
        requested_by uuid REFERENCES users(id),
        request_message text,
        responded_at timestamptz,
        responded_by uuid REFERENCES users(id),
        -- Conditions commerciales fixées par le fournisseur (§ 16 : délai de paiement).
        payment_terms_days integer NOT NULL DEFAULT 30 CHECK (payment_terms_days BETWEEN 0 AND 365),
        supplier_customer_code varchar(40),
        -- Notes PRIVÉES de chaque côté : jamais montrées à la contrepartie.
        buyer_notes text,
        supplier_notes text,
        suspended_by_company_id uuid REFERENCES companies(id),
        suspended_reason text,
        ${HORODATAGE},
        CONSTRAINT partnerships_uq UNIQUE (buyer_company_id, supplier_company_id),
        CONSTRAINT partnerships_distinctes_ck CHECK (buyer_company_id <> supplier_company_id),
        CONSTRAINT partnerships_demandeur_ck CHECK (requested_by_company_id IN (buyer_company_id, supplier_company_id))
      )`,
      'CREATE INDEX partnerships_supplier_idx ON partnerships (supplier_company_id, status)',
      'CREATE INDEX partnerships_buyer_idx ON partnerships (buyer_company_id, status)',

      `CREATE TABLE partnership_invitations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES companies(id),
        -- Rôle de l'entreprise INVITÉE vis-à-vis de l'invitante.
        relation varchar(12) NOT NULL ${dans('relation', E.RELATION)},
        email varchar(254) NOT NULL,
        company_name varchar(150),
        contact_name varchar(160),
        message text,
        token_hash char(64) NOT NULL UNIQUE,
        status varchar(12) NOT NULL DEFAULT 'en_attente' ${dans('status', E.STATUT_INVITATION_PARTENAIRE)},
        expires_at timestamptz NOT NULL,
        accepted_company_id uuid REFERENCES companies(id),
        accepted_at timestamptz,
        created_by uuid REFERENCES users(id),
        ${HORODATAGE}
      )`,
      "CREATE INDEX partnership_invitations_email_idx ON partnership_invitations (lower(email)) WHERE status = 'en_attente'",
      'CREATE INDEX partnership_invitations_company_idx ON partnership_invitations (company_id, created_at DESC)',

      `CREATE TABLE product_categories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES companies(id),
        name varchar(100) NOT NULL,
        sort_order integer NOT NULL DEFAULT 0,
        ${HORODATAGE}
      )`,
      'CREATE UNIQUE INDEX product_categories_nom_uq ON product_categories (company_id, lower(name))',

      `CREATE TABLE products (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES companies(id),
        category_id uuid REFERENCES product_categories(id),
        reference varchar(60) NOT NULL,
        name varchar(200) NOT NULL,
        description text,
        unit varchar(12) NOT NULL ${dans('unit', E.UNITE)},
        packaging varchar(100),
        -- Prix unitaire HORS TAXES en FCFA entiers.
        price bigint NOT NULL CHECK (price >= 0),
        tax_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
        availability varchar(15) NOT NULL DEFAULT 'disponible' ${dans('availability', E.DISPONIBILITE)},
        stock_quantity numeric(14,3) CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
        min_order_quantity numeric(14,3) NOT NULL DEFAULT 1 CHECK (min_order_quantity > 0),
        is_active boolean NOT NULL DEFAULT true,
        photo_document_id uuid REFERENCES documents(id),
        created_by uuid REFERENCES users(id),
        ${HORODATAGE},
        deleted_at timestamptz
      )`,
      'CREATE UNIQUE INDEX products_reference_uq ON products (company_id, lower(reference)) WHERE deleted_at IS NULL',
      'CREATE INDEX products_catalogue_idx ON products (company_id, is_active, name) WHERE deleted_at IS NULL',
      'CREATE INDEX products_categorie_idx ON products (category_id) WHERE deleted_at IS NULL',
      'CREATE INDEX products_nom_trgm_idx ON products USING gin (name gin_trgm_ops)',
    ]);
  },

  async down(queryInterface) {
    await executer(queryInterface, [
      'DROP TABLE IF EXISTS products, product_categories, partnership_invitations, partnerships CASCADE',
    ]);
  },
};
