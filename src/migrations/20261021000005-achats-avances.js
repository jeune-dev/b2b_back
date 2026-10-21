'use strict';

const E = require('../config/enums.js');
const {
  dans, remplacerCheck, HORODATAGE, executer,
} = require('../database/migrationHelpers.js');

/**
 * Fonctionnalités avancées d'achat et de vente :
 *
 *   Catalogue et prix
 *     - products : multiple de commande, quantité maximale, stock réservé,
 *       seuil d'alerte de stock bas ;
 *     - product_price_tiers : remises par paliers de quantité ;
 *     - price_lists / price_list_items : tarifs propres à un client ou à un
 *       groupe de clients (la liste est affectée au partenariat) ;
 *     - stock_movements : historique du stock (entrées, ajustements,
 *       réservations, sorties à la livraison, retours).
 *
 *   Achats
 *     - partnerships : liste de prix, plafond de crédit, blocage en cas de
 *       retard de paiement ;
 *     - orders : circuit d'approbation interne, commande d'origine
 *       (recommander), liste d'achat d'origine, reliquat soldé ;
 *     - order_approvals : décisions des approbateurs, par tour ;
 *     - purchase_lists / purchase_list_items : listes d'achat habituelles
 *       avec quantité par défaut ou stock cible.
 *
 *   Livraison, réception, litiges
 *     - deliveries / delivery_lines : livraisons partielles successives
 *       (bons de livraison numérotés) et leur réception ;
 *     - claims / claim_lines : retours et litiges après livraison ;
 *     - credit_notes / credit_note_lines / credit_note_allocations : avoirs
 *       du fournisseur et leur imputation sur les factures.
 *
 *   Facturation
 *     - invoices : rapprochement commande / réception / facture (écart →
 *       paiement bloqué), part réglée par avoir, relances ;
 *     - invoice_reminders : relances graduées des factures impayées.
 */

const NOUVEAUX = Object.freeze({
  statutCommande: ['livree_partiellement'],
  evenements: ['soumission_approbation', 'approbation', 'rejet_approbation', 'livraison_partielle', 'reception_partielle', 'reliquat_solde', 'litige', 'avoir'],
  entites: ['claim'],
  notifications: ['approbation_requise', 'commande_approuvee', 'approbation_rejetee', 'livraison_partielle', 'litige', 'avoir', 'facture_ecart', 'relance_facture', 'stock_bas'],
});
const sans = (enumeration, retires) => E.codes(enumeration).filter((c) => !retires.includes(c));

module.exports = {
  async up(queryInterface) {
    await executer(queryInterface, [
      // ── Énumérations élargies ─────────────────────────────────────────────
      ...remplacerCheck('orders', 'status', E.STATUT_COMMANDE),
      ...remplacerCheck('order_events', 'type', E.EVENEMENT_COMMANDE),
      ...remplacerCheck('documents', 'entity_type', E.ENTITE_DOCUMENT),
      ...remplacerCheck('notifications', 'type', E.TYPE_NOTIFICATION),

      // ── Catalogue : minimums, stock ───────────────────────────────────────
      `ALTER TABLE products
         ADD COLUMN order_multiple numeric(14,3) CHECK (order_multiple IS NULL OR order_multiple > 0),
         ADD COLUMN max_order_quantity numeric(14,3) CHECK (max_order_quantity IS NULL OR max_order_quantity > 0),
         ADD COLUMN stock_reserved numeric(14,3) NOT NULL DEFAULT 0 CHECK (stock_reserved >= 0),
         ADD COLUMN low_stock_threshold numeric(14,3) CHECK (low_stock_threshold IS NULL OR low_stock_threshold >= 0),
         ADD COLUMN low_stock_notified_at timestamptz,
         ADD CONSTRAINT products_quantites_ck CHECK (max_order_quantity IS NULL OR max_order_quantity >= min_order_quantity)`,

      `CREATE TABLE product_price_tiers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        min_quantity numeric(14,3) NOT NULL CHECK (min_quantity > 0),
        discount_percent numeric(5,2) NOT NULL CHECK (discount_percent > 0 AND discount_percent < 100),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT product_price_tiers_uq UNIQUE (product_id, min_quantity)
      )`,

      `CREATE TABLE price_lists (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES companies(id),
        name varchar(100) NOT NULL,
        description text,
        -- Remise appliquée aux produits SANS prix propre dans la liste.
        discount_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent < 100),
        is_active boolean NOT NULL DEFAULT true,
        created_by uuid REFERENCES users(id),
        ${HORODATAGE},
        deleted_at timestamptz
      )`,
      'CREATE UNIQUE INDEX price_lists_nom_uq ON price_lists (company_id, lower(name)) WHERE deleted_at IS NULL',

      `CREATE TABLE price_list_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        price_list_id uuid NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
        product_id uuid NOT NULL REFERENCES products(id),
        -- Prix unitaire HT propre à la liste, en FCFA entiers.
        price bigint NOT NULL CHECK (price >= 0),
        ${HORODATAGE},
        CONSTRAINT price_list_items_uq UNIQUE (price_list_id, product_id)
      )`,
      'CREATE INDEX price_list_items_product_idx ON price_list_items (product_id)',

      `CREATE TABLE stock_movements (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        company_id uuid NOT NULL REFERENCES companies(id),
        product_id uuid NOT NULL REFERENCES products(id),
        type varchar(15) NOT NULL ${dans('type', E.TYPE_MOUVEMENT_STOCK)},
        -- Variation : du stock physique (entrée, ajustement, sortie, retour)
        -- ou du stock réservé (réservation, libération).
        quantity numeric(14,3) NOT NULL CHECK (quantity <> 0),
        stock_after numeric(14,3),
        reserved_after numeric(14,3) NOT NULL,
        order_id uuid REFERENCES orders(id),
        note text,
        created_by uuid REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      'CREATE INDEX stock_movements_product_idx ON stock_movements (product_id, created_at DESC)',

      // ── Partenariats : conditions commerciales ────────────────────────────
      `ALTER TABLE partnerships
         ADD COLUMN price_list_id uuid REFERENCES price_lists(id),
         ADD COLUMN credit_limit bigint CHECK (credit_limit IS NULL OR credit_limit >= 0),
         ADD COLUMN block_on_overdue boolean NOT NULL DEFAULT false`,
      'CREATE INDEX partnerships_price_list_idx ON partnerships (price_list_id) WHERE price_list_id IS NOT NULL',

      // ── Listes d'achat habituelles ────────────────────────────────────────
      `CREATE TABLE purchase_lists (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES companies(id),
        supplier_company_id uuid NOT NULL REFERENCES companies(id),
        name varchar(100) NOT NULL,
        notes text,
        last_ordered_at timestamptz,
        created_by uuid REFERENCES users(id),
        ${HORODATAGE},
        deleted_at timestamptz,
        CONSTRAINT purchase_lists_distinctes_ck CHECK (company_id <> supplier_company_id)
      )`,
      'CREATE UNIQUE INDEX purchase_lists_nom_uq ON purchase_lists (company_id, lower(name)) WHERE deleted_at IS NULL',

      `CREATE TABLE purchase_list_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        list_id uuid NOT NULL REFERENCES purchase_lists(id) ON DELETE CASCADE,
        product_id uuid NOT NULL REFERENCES products(id),
        -- Quantité commandée par défaut, OU stock cible (« par ») : la
        -- quantité commandée est alors stock cible − stock constaté.
        quantity numeric(14,3) CHECK (quantity IS NULL OR quantity > 0),
        par_level numeric(14,3) CHECK (par_level IS NULL OR par_level > 0),
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT purchase_list_items_uq UNIQUE (list_id, product_id),
        CONSTRAINT purchase_list_items_quantite_ck CHECK (quantity IS NOT NULL OR par_level IS NOT NULL)
      )`,

      // ── Commandes : approbation, origine, livraisons, reliquat ────────────
      `ALTER TABLE orders
         ADD COLUMN approval_status varchar(12) NOT NULL DEFAULT 'non_requise' ${dans('approval_status', E.STATUT_APPROBATION)},
         ADD COLUMN approvals_required smallint NOT NULL DEFAULT 0 CHECK (approvals_required BETWEEN 0 AND 3),
         ADD COLUMN approval_round integer NOT NULL DEFAULT 0,
         ADD COLUMN approval_requested_at timestamptz,
         ADD COLUMN approval_requested_by uuid REFERENCES users(id),
         ADD COLUMN approved_at timestamptz,
         ADD COLUMN source_order_id uuid REFERENCES orders(id),
         ADD COLUMN purchase_list_id uuid REFERENCES purchase_lists(id),
         ADD COLUMN deliveries_count integer NOT NULL DEFAULT 0,
         ADD COLUMN backorder_closed_at timestamptz,
         ADD COLUMN backorder_closed_by_side varchar(12) ${dans('backorder_closed_by_side', E.COTE)},
         ADD COLUMN backorder_close_reason text`,
      "CREATE INDEX orders_approbation_idx ON orders (buyer_company_id) WHERE approval_status = 'en_attente'",

      `ALTER TABLE order_lines
         ADD COLUMN base_unit_price bigint CHECK (base_unit_price IS NULL OR base_unit_price >= 0),
         ADD COLUMN discount_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent < 100),
         ADD COLUMN delivered_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK (delivered_quantity >= 0),
         ADD COLUMN stock_reserved numeric(14,3) NOT NULL DEFAULT 0 CHECK (stock_reserved >= 0)`,

      `CREATE TABLE order_approvals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        round integer NOT NULL CHECK (round >= 1),
        user_id uuid NOT NULL REFERENCES users(id),
        decision varchar(10) NOT NULL ${dans('decision', E.DECISION_APPROBATION)},
        comment text,
        order_total bigint NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        -- Un approbateur ne compte qu'une fois par tour.
        CONSTRAINT order_approvals_uq UNIQUE (order_id, round, user_id)
      )`,

      `CREATE TABLE deliveries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        number varchar(40) NOT NULL,
        order_id uuid NOT NULL REFERENCES orders(id),
        supplier_company_id uuid NOT NULL REFERENCES companies(id),
        buyer_company_id uuid NOT NULL REFERENCES companies(id),
        delivery_no integer NOT NULL CHECK (delivery_no >= 1),
        status varchar(15) NOT NULL DEFAULT 'expediee' ${dans('status', E.STATUT_LIVRAISON)},
        note text,
        carrier varchar(120),
        shipped_at timestamptz NOT NULL DEFAULT now(),
        document_id uuid REFERENCES documents(id),
        received_at timestamptz,
        received_by uuid REFERENCES users(id),
        reception_note text,
        with_reserves boolean NOT NULL DEFAULT false,
        created_by uuid REFERENCES users(id),
        ${HORODATAGE},
        CONSTRAINT deliveries_ordre_uq UNIQUE (order_id, delivery_no),
        CONSTRAINT deliveries_numero_uq UNIQUE (supplier_company_id, number),
        CONSTRAINT deliveries_reception_ck CHECK (status <> 'receptionnee' OR received_at IS NOT NULL)
      )`,
      'CREATE INDEX deliveries_order_idx ON deliveries (order_id, delivery_no)',

      `CREATE TABLE delivery_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        delivery_id uuid NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
        -- Ligne de la version VALIDÉE de la commande.
        line_no integer NOT NULL CHECK (line_no >= 1),
        product_id uuid REFERENCES products(id),
        reference varchar(60),
        name varchar(200) NOT NULL,
        unit varchar(12) NOT NULL ${dans('unit', E.UNITE)},
        quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
        received_quantity numeric(14,3) CHECK (received_quantity IS NULL OR (received_quantity >= 0 AND received_quantity <= quantity)),
        CONSTRAINT delivery_lines_uq UNIQUE (delivery_id, line_no)
      )`,

      // ── Avoirs ────────────────────────────────────────────────────────────
      `CREATE TABLE credit_notes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        number varchar(40) NOT NULL,
        supplier_company_id uuid NOT NULL REFERENCES companies(id),
        buyer_company_id uuid NOT NULL REFERENCES companies(id),
        partnership_id uuid NOT NULL REFERENCES partnerships(id),
        order_id uuid REFERENCES orders(id),
        invoice_id uuid REFERENCES invoices(id),
        claim_id uuid,
        status varchar(10) NOT NULL DEFAULT 'emis' ${dans('status', E.STATUT_AVOIR)},
        issue_date date NOT NULL,
        reason text NOT NULL,
        subtotal bigint NOT NULL CHECK (subtotal >= 0),
        tax_total bigint NOT NULL CHECK (tax_total >= 0),
        total bigint NOT NULL CHECK (total > 0),
        amount_allocated bigint NOT NULL DEFAULT 0,
        template_id uuid REFERENCES document_templates(id),
        created_by uuid REFERENCES users(id),
        cancelled_at timestamptz,
        cancellation_reason text,
        ${HORODATAGE},
        CONSTRAINT credit_notes_numero_uq UNIQUE (supplier_company_id, number),
        CONSTRAINT credit_notes_totaux_ck CHECK (total = subtotal + tax_total),
        CONSTRAINT credit_notes_imputation_ck CHECK (amount_allocated >= 0 AND amount_allocated <= total)
      )`,
      'CREATE INDEX credit_notes_partnership_idx ON credit_notes (partnership_id, status)',

      `CREATE TABLE credit_note_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        credit_note_id uuid NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
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
        CONSTRAINT credit_note_lines_uq UNIQUE (credit_note_id, line_no),
        CONSTRAINT credit_note_lines_totaux_ck CHECK (line_total = line_subtotal + line_tax)
      )`,

      `CREATE TABLE credit_note_allocations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        credit_note_id uuid NOT NULL REFERENCES credit_notes(id),
        invoice_id uuid NOT NULL REFERENCES invoices(id),
        amount bigint NOT NULL CHECK (amount > 0),
        cancelled_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      'CREATE UNIQUE INDEX credit_note_allocations_actives_uq ON credit_note_allocations (credit_note_id, invoice_id) WHERE cancelled_at IS NULL',
      'CREATE INDEX credit_note_allocations_invoice_idx ON credit_note_allocations (invoice_id) WHERE cancelled_at IS NULL',

      // ── Litiges ───────────────────────────────────────────────────────────
      `CREATE TABLE claims (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        number varchar(40) NOT NULL,
        order_id uuid NOT NULL REFERENCES orders(id),
        buyer_company_id uuid NOT NULL REFERENCES companies(id),
        supplier_company_id uuid NOT NULL REFERENCES companies(id),
        partnership_id uuid NOT NULL REFERENCES partnerships(id),
        delivery_id uuid REFERENCES deliveries(id),
        type varchar(20) NOT NULL ${dans('type', E.TYPE_LITIGE)},
        status varchar(10) NOT NULL DEFAULT 'ouvert' ${dans('status', E.STATUT_LITIGE)},
        description text NOT NULL,
        subtotal bigint NOT NULL DEFAULT 0,
        tax_total bigint NOT NULL DEFAULT 0,
        total bigint NOT NULL DEFAULT 0,
        response text,
        restock boolean NOT NULL DEFAULT false,
        credit_note_id uuid REFERENCES credit_notes(id),
        opened_by uuid REFERENCES users(id),
        resolved_at timestamptz,
        resolved_by uuid REFERENCES users(id),
        ${HORODATAGE},
        CONSTRAINT claims_numero_uq UNIQUE (buyer_company_id, number),
        CONSTRAINT claims_avoir_ck CHECK (status <> 'accepte' OR credit_note_id IS NOT NULL)
      )`,
      'CREATE INDEX claims_order_idx ON claims (order_id)',
      'CREATE INDEX claims_supplier_idx ON claims (supplier_company_id, status, created_at DESC)',
      'CREATE INDEX claims_buyer_idx ON claims (buyer_company_id, status, created_at DESC)',
      'ALTER TABLE credit_notes ADD CONSTRAINT credit_notes_claim_fk FOREIGN KEY (claim_id) REFERENCES claims(id)',

      `CREATE TABLE claim_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        claim_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
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
        comment varchar(500),
        CONSTRAINT claim_lines_uq UNIQUE (claim_id, line_no)
      )`,

      // ── Factures : rapprochement, avoirs, relances ────────────────────────
      `ALTER TABLE invoices
         ADD COLUMN amount_credited bigint NOT NULL DEFAULT 0,
         ADD COLUMN match_status varchar(10) NOT NULL DEFAULT 'conforme' ${dans('match_status', E.STATUT_RAPPROCHEMENT)},
         ADD COLUMN match_details jsonb,
         ADD COLUMN match_decided_at timestamptz,
         ADD COLUMN match_decided_by uuid REFERENCES users(id),
         ADD COLUMN match_comment text,
         ADD COLUMN reminders_count integer NOT NULL DEFAULT 0,
         ADD COLUMN last_reminder_at timestamptz,
         ADD CONSTRAINT invoices_avoir_ck CHECK (amount_credited >= 0 AND amount_credited <= amount_paid)`,
      "CREATE INDEX invoices_bloquees_idx ON invoices (buyer_company_id) WHERE match_status IN ('ecart', 'conteste')",

      `CREATE TABLE invoice_reminders (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        invoice_id uuid NOT NULL REFERENCES invoices(id),
        level smallint NOT NULL CHECK (level >= 0),
        channel varchar(10) NOT NULL ${dans('channel', E.CANAL_RELANCE)},
        days_overdue integer NOT NULL,
        amount_due bigint NOT NULL,
        emailed boolean NOT NULL DEFAULT false,
        sent_by uuid REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      // Une relance AUTOMATIQUE par palier et par facture (rejouer la tâche ne double rien).
      "CREATE UNIQUE INDEX invoice_reminders_auto_uq ON invoice_reminders (invoice_id, level) WHERE channel = 'auto'",
      'CREATE INDEX invoice_reminders_invoice_idx ON invoice_reminders (invoice_id, created_at DESC)',
    ]);
  },

  async down(queryInterface) {
    await executer(queryInterface, [
      'DROP TABLE IF EXISTS invoice_reminders, claim_lines, credit_note_allocations, credit_note_lines CASCADE',
      'ALTER TABLE credit_notes DROP CONSTRAINT IF EXISTS credit_notes_claim_fk',
      'DROP TABLE IF EXISTS claims, credit_notes, delivery_lines, deliveries, order_approvals CASCADE',
      `ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_avoir_ck,
         DROP COLUMN IF EXISTS amount_credited, DROP COLUMN IF EXISTS match_status, DROP COLUMN IF EXISTS match_details,
         DROP COLUMN IF EXISTS match_decided_at, DROP COLUMN IF EXISTS match_decided_by, DROP COLUMN IF EXISTS match_comment,
         DROP COLUMN IF EXISTS reminders_count, DROP COLUMN IF EXISTS last_reminder_at`,
      `ALTER TABLE order_lines DROP COLUMN IF EXISTS base_unit_price, DROP COLUMN IF EXISTS discount_percent,
         DROP COLUMN IF EXISTS delivered_quantity, DROP COLUMN IF EXISTS stock_reserved`,
      `ALTER TABLE orders DROP COLUMN IF EXISTS approval_status, DROP COLUMN IF EXISTS approvals_required, DROP COLUMN IF EXISTS approval_round,
         DROP COLUMN IF EXISTS approval_requested_at, DROP COLUMN IF EXISTS approval_requested_by, DROP COLUMN IF EXISTS approved_at,
         DROP COLUMN IF EXISTS source_order_id, DROP COLUMN IF EXISTS purchase_list_id, DROP COLUMN IF EXISTS deliveries_count,
         DROP COLUMN IF EXISTS backorder_closed_at, DROP COLUMN IF EXISTS backorder_closed_by_side, DROP COLUMN IF EXISTS backorder_close_reason`,
      'DROP TABLE IF EXISTS purchase_list_items, purchase_lists CASCADE',
      'ALTER TABLE partnerships DROP COLUMN IF EXISTS price_list_id, DROP COLUMN IF EXISTS credit_limit, DROP COLUMN IF EXISTS block_on_overdue',
      'DROP TABLE IF EXISTS stock_movements, price_list_items, price_lists, product_price_tiers CASCADE',
      `ALTER TABLE products DROP CONSTRAINT IF EXISTS products_quantites_ck,
         DROP COLUMN IF EXISTS order_multiple, DROP COLUMN IF EXISTS max_order_quantity, DROP COLUMN IF EXISTS stock_reserved,
         DROP COLUMN IF EXISTS low_stock_threshold, DROP COLUMN IF EXISTS low_stock_notified_at`,
      ...remplacerCheck('notifications', 'type', sans(E.TYPE_NOTIFICATION, NOUVEAUX.notifications)),
      ...remplacerCheck('documents', 'entity_type', sans(E.ENTITE_DOCUMENT, NOUVEAUX.entites)),
      ...remplacerCheck('order_events', 'type', sans(E.EVENEMENT_COMMANDE, NOUVEAUX.evenements)),
      ...remplacerCheck('orders', 'status', sans(E.STATUT_COMMANDE, NOUVEAUX.statutCommande)),
    ]);
  },
};
