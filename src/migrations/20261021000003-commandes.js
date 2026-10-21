'use strict';

const E = require('../config/enums.js');
const { dans, HORODATAGE, executer } = require('../database/migrationHelpers.js');

/**
 * Commandes (§ 9 à § 13, § 20).
 *
 *   - orders : le bon de commande et son cycle de vie ; les totaux sont ceux
 *     de la version COURANTE.
 *   - order_versions : chaque proposition (bon initial de l'acheteur,
 *     proposition modifiée du fournisseur, contre-proposition) est une
 *     version FIGÉE. La version acceptée devient la référence officielle
 *     commune aux deux parties (§ 11).
 *   - order_lines : lignes d'une version — instantané du produit (référence,
 *     désignation, unité, prix, TVA) au moment de la proposition : modifier
 *     le catalogue ne réécrit jamais une commande passée.
 *   - order_events : historique « qui a fait quoi et à quel moment » (§ 20).
 */
module.exports = {
  async up(queryInterface) {
    await executer(queryInterface, [
      `CREATE TABLE orders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        number varchar(40) NOT NULL,
        buyer_company_id uuid NOT NULL REFERENCES companies(id),
        supplier_company_id uuid NOT NULL REFERENCES companies(id),
        partnership_id uuid NOT NULL REFERENCES partnerships(id),
        status varchar(25) NOT NULL DEFAULT 'brouillon' ${dans('status', E.STATUT_COMMANDE)},
        -- Compteur de révision (concurrence optimiste web / mobile, § 23).
        revision integer NOT NULL DEFAULT 1,
        current_version_no integer NOT NULL DEFAULT 1,
        validated_version_no integer,
        buyer_reference varchar(60),
        delivery_address text,
        requested_delivery_date date,
        conditions text,
        currency char(3) NOT NULL DEFAULT 'XOF',
        subtotal bigint NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
        tax_total bigint NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
        total bigint NOT NULL DEFAULT 0 CHECK (total >= 0),
        lines_count integer NOT NULL DEFAULT 0,
        delivery_note text,
        reception_note text,
        reception_with_reserves boolean NOT NULL DEFAULT false,
        cancellation_reason text,
        refusal_reason text,
        cancelled_by_side varchar(12) ${dans('cancelled_by_side', E.COTE)},
        created_by uuid REFERENCES users(id),
        sent_at timestamptz,
        acknowledged_at timestamptz,
        validated_at timestamptz,
        preparation_at timestamptz,
        ready_at timestamptz,
        delivered_at timestamptz,
        received_at timestamptz,
        invoiced_at timestamptz,
        completed_at timestamptz,
        refused_at timestamptz,
        cancelled_at timestamptz,
        ${HORODATAGE},
        CONSTRAINT orders_numero_uq UNIQUE (buyer_company_id, number),
        CONSTRAINT orders_distinctes_ck CHECK (buyer_company_id <> supplier_company_id),
        CONSTRAINT orders_totaux_ck CHECK (total = subtotal + tax_total)
      )`,
      'CREATE INDEX orders_buyer_idx ON orders (buyer_company_id, status, created_at DESC)',
      // Un brouillon n'existe pas pour le fournisseur : index partiel.
      "CREATE INDEX orders_supplier_idx ON orders (supplier_company_id, status, sent_at DESC) WHERE status <> 'brouillon'",
      'CREATE INDEX orders_partnership_idx ON orders (partnership_id, created_at DESC)',
      'CREATE INDEX orders_maj_idx ON orders (updated_at)',

      `CREATE TABLE order_versions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        version_no integer NOT NULL CHECK (version_no >= 1),
        proposed_by_side varchar(12) NOT NULL ${dans('proposed_by_side', E.COTE)},
        proposed_by uuid REFERENCES users(id),
        status varchar(12) NOT NULL ${dans('status', E.STATUT_VERSION)},
        comment text,
        subtotal bigint NOT NULL DEFAULT 0,
        tax_total bigint NOT NULL DEFAULT 0,
        total bigint NOT NULL DEFAULT 0,
        lines_count integer NOT NULL DEFAULT 0,
        decided_at timestamptz,
        decided_by uuid REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT order_versions_uq UNIQUE (order_id, version_no)
      )`,

      `CREATE TABLE order_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        version_id uuid NOT NULL REFERENCES order_versions(id) ON DELETE CASCADE,
        line_no integer NOT NULL CHECK (line_no >= 1),
        product_id uuid REFERENCES products(id),
        reference varchar(60),
        name varchar(200) NOT NULL,
        unit varchar(12) NOT NULL ${dans('unit', E.UNITE)},
        quantity numeric(14,3) NOT NULL CHECK (quantity >= 0),
        unit_price bigint NOT NULL CHECK (unit_price >= 0),
        tax_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
        line_subtotal bigint NOT NULL CHECK (line_subtotal >= 0),
        line_tax bigint NOT NULL CHECK (line_tax >= 0),
        line_total bigint NOT NULL CHECK (line_total >= 0),
        change_type varchar(20) NOT NULL DEFAULT 'inchangee' ${dans('change_type', E.CHANGEMENT_LIGNE)},
        original_quantity numeric(14,3),
        original_unit_price bigint,
        substitute_for_line_no integer,
        comment varchar(500),
        received_quantity numeric(14,3) CHECK (received_quantity IS NULL OR received_quantity >= 0),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT order_lines_uq UNIQUE (version_id, line_no),
        CONSTRAINT order_lines_totaux_ck CHECK (line_total = line_subtotal + line_tax),
        -- Une ligne indisponible ne porte aucune quantité.
        CONSTRAINT order_lines_indisponible_ck CHECK (change_type <> 'indisponible' OR quantity = 0)
      )`,
      'CREATE INDEX order_lines_order_idx ON order_lines (order_id)',
      'CREATE INDEX order_lines_product_idx ON order_lines (product_id) WHERE product_id IS NOT NULL',

      `CREATE TABLE order_events (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        type varchar(30) NOT NULL ${dans('type', E.EVENEMENT_COMMANDE)},
        from_status varchar(25),
        to_status varchar(25),
        version_no integer,
        actor_user_id uuid REFERENCES users(id),
        actor_company_id uuid REFERENCES companies(id),
        actor_side varchar(12) ${dans('actor_side', E.COTE)},
        message text,
        details jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      'CREATE INDEX order_events_order_idx ON order_events (order_id, created_at)',
      'CREATE INDEX order_events_company_idx ON order_events (actor_company_id, created_at DESC)',
    ]);
  },

  async down(queryInterface) {
    await executer(queryInterface, [
      'DROP TABLE IF EXISTS order_events, order_lines, order_versions, orders CASCADE',
    ]);
  },
};
