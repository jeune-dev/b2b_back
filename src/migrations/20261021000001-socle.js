'use strict';

const E = require('../config/enums.js');
const { dans, HORODATAGE, executer } = require('../database/migrationHelpers.js');

/**
 * Socle : rôles, utilisateurs, entreprises et leurs membres, invitations,
 * abonnements, sessions, notifications, documents, journal d'audit et tables
 * techniques. Cahier des charges § 5, § 6, § 17, § 24, § 25.
 */
module.exports = {
  async up(queryInterface) {
    await executer(queryInterface, [
      // pg_trgm accélère la recherche par nom (ILIKE '%…%') : annuaire,
      // catalogue, listes de commandes.
      'CREATE EXTENSION IF NOT EXISTS pg_trgm',

      `CREATE TABLE roles (
        code varchar(40) PRIMARY KEY,
        label varchar(100) NOT NULL,
        description text,
        permissions text[] NOT NULL DEFAULT '{}',
        is_system boolean NOT NULL DEFAULT false,
        ${HORODATAGE}
      )`,

      `CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        role_code varchar(40) NOT NULL REFERENCES roles(code) ON UPDATE CASCADE,
        first_name varchar(80) NOT NULL,
        last_name varchar(80) NOT NULL,
        email varchar(254),
        phone varchar(20),
        job_title varchar(100),
        password_hash varchar(100) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'actif' ${dans('status', E.STATUT_UTILISATEUR)},
        email_verified_at timestamptz,
        failed_login_attempts integer NOT NULL DEFAULT 0 CHECK (failed_login_attempts >= 0),
        locked_until timestamptz,
        token_version integer NOT NULL DEFAULT 0,
        must_change_password boolean NOT NULL DEFAULT false,
        last_login_at timestamptz,
        language varchar(5) NOT NULL DEFAULT 'fr',
        totp_secret text,
        totp_enabled_at timestamptz,
        totp_last_step bigint,
        mfa_recovery_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
        ${HORODATAGE},
        deleted_at timestamptz,
        CONSTRAINT users_identifiant_ck CHECK (email IS NOT NULL OR phone IS NOT NULL),
        CONSTRAINT users_totp_ck CHECK (totp_enabled_at IS NULL OR totp_secret IS NOT NULL)
      )`,
      'CREATE UNIQUE INDEX users_email_uq ON users (lower(email)) WHERE deleted_at IS NULL AND email IS NOT NULL',
      'CREATE UNIQUE INDEX users_phone_uq ON users (phone) WHERE deleted_at IS NULL AND phone IS NOT NULL',
      'CREATE INDEX users_role_status_idx ON users (role_code, status) WHERE deleted_at IS NULL',

      // § 6 — espace propre à chaque entreprise ; toutes les données métier
      // portent son identifiant (séparation des données, § 24).
      `CREATE TABLE companies (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(150) NOT NULL,
        legal_name varchar(200),
        type varchar(12) NOT NULL ${dans('type', E.TYPE_ENTREPRISE)},
        sector varchar(20) ${dans('sector', E.SECTEUR_ACTIVITE)},
        description text,
        address varchar(255),
        city varchar(100),
        country char(2) NOT NULL DEFAULT 'SN',
        phone varchar(20),
        email varchar(254),
        website varchar(255),
        ninea varchar(30),
        rccm varchar(60),
        tax_regime varchar(20) ${dans('tax_regime', E.REGIME_FISCAL)},
        vat_registered boolean NOT NULL DEFAULT false,
        default_tax_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (default_tax_rate >= 0 AND default_tax_rate <= 100),
        bank_details text,
        currency char(3) NOT NULL DEFAULT 'XOF',
        logo_document_id uuid,
        is_listed boolean NOT NULL DEFAULT true,
        settings jsonb NOT NULL DEFAULT '{}'::jsonb,
        status varchar(20) NOT NULL DEFAULT 'actif' ${dans('status', E.STATUT_ENTREPRISE)},
        suspended_reason text,
        created_by uuid REFERENCES users(id),
        ${HORODATAGE},
        deleted_at timestamptz
      )`,
      // NINEA : identifiant national unique d'une entreprise au Sénégal.
      'CREATE UNIQUE INDEX companies_ninea_uq ON companies (upper(ninea)) WHERE deleted_at IS NULL AND ninea IS NOT NULL',
      'CREATE INDEX companies_annuaire_idx ON companies (type, city) WHERE deleted_at IS NULL AND is_listed',
      'CREATE INDEX companies_nom_trgm_idx ON companies USING gin (name gin_trgm_ops)',

      // § 5.3 — utilisateurs internes d'une entreprise. En V1, un compte
      // appartient à UNE entreprise (index unique sur user_id).
      `CREATE TABLE company_members (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES companies(id),
        user_id uuid NOT NULL REFERENCES users(id),
        role_code varchar(40) NOT NULL REFERENCES roles(code) ON UPDATE CASCADE ${dans('role_code', E.ROLES_ENTREPRISE)},
        status varchar(20) NOT NULL DEFAULT 'actif' ${dans('status', E.STATUT_MEMBRE)},
        invited_by uuid REFERENCES users(id),
        ${HORODATAGE},
        CONSTRAINT company_members_user_uq UNIQUE (user_id)
      )`,
      'CREATE INDEX company_members_company_idx ON company_members (company_id, status)',

      // Invitation d'un collaborateur : lien (jeton) ou code à 8 chiffres,
      // jamais stockés en clair.
      `CREATE TABLE member_invitations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES companies(id),
        email varchar(254) NOT NULL,
        phone varchar(20),
        first_name varchar(80) NOT NULL,
        last_name varchar(80) NOT NULL,
        job_title varchar(100),
        role_code varchar(40) NOT NULL ${dans('role_code', E.ROLES_ENTREPRISE)},
        token_hash char(64) NOT NULL UNIQUE,
        code_hash char(64) NOT NULL,
        expires_at timestamptz NOT NULL,
        attempts smallint NOT NULL DEFAULT 0,
        used_at timestamptz,
        revoked_at timestamptz,
        created_by uuid REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      'CREATE INDEX member_invitations_email_idx ON member_invitations (lower(email)) WHERE used_at IS NULL AND revoked_at IS NULL',
      'CREATE INDEX member_invitations_company_idx ON member_invitations (company_id, created_at DESC)',

      `CREATE TABLE subscription_plans (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code varchar(30) NOT NULL UNIQUE,
        name varchar(80) NOT NULL,
        description text,
        price bigint NOT NULL CHECK (price >= 0),
        currency char(3) NOT NULL DEFAULT 'XOF',
        billing_period varchar(10) NOT NULL DEFAULT 'mensuel' ${dans('billing_period', E.PERIODE_FACTURATION)},
        max_users integer CHECK (max_users IS NULL OR max_users > 0),
        max_products integer CHECK (max_products IS NULL OR max_products > 0),
        max_partners integer CHECK (max_partners IS NULL OR max_partners > 0),
        max_orders_per_month integer CHECK (max_orders_per_month IS NULL OR max_orders_per_month > 0),
        features text[] NOT NULL DEFAULT '{}',
        status varchar(10) NOT NULL DEFAULT 'actif' ${dans('status', E.STATUT_PLAN)},
        sort_order integer NOT NULL DEFAULT 0,
        ${HORODATAGE}
      )`,

      `CREATE TABLE subscriptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES companies(id),
        plan_id uuid NOT NULL REFERENCES subscription_plans(id),
        status varchar(12) NOT NULL ${dans('status', E.STATUT_ABONNEMENT)},
        started_at timestamptz NOT NULL DEFAULT now(),
        current_period_start date NOT NULL,
        current_period_end date NOT NULL,
        trial_ends_at date,
        cancelled_at timestamptz,
        suspended_reason text,
        ${HORODATAGE},
        CONSTRAINT subscriptions_periode_ck CHECK (current_period_end >= current_period_start)
      )`,
      // Un seul abonnement « courant » par entreprise.
      "CREATE UNIQUE INDEX subscriptions_courant_uq ON subscriptions (company_id) WHERE status IN ('essai', 'actif', 'suspendu')",
      'CREATE INDEX subscriptions_fin_idx ON subscriptions (status, current_period_end)',

      `CREATE TABLE subscription_payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES companies(id),
        subscription_id uuid REFERENCES subscriptions(id),
        plan_id uuid NOT NULL REFERENCES subscription_plans(id),
        amount bigint NOT NULL CHECK (amount >= 0),
        currency char(3) NOT NULL DEFAULT 'XOF',
        months smallint NOT NULL DEFAULT 1 CHECK (months BETWEEN 1 AND 24),
        provider varchar(20) NOT NULL CHECK (provider IN ('paydunya', 'manuel')),
        reference varchar(64) NOT NULL UNIQUE,
        provider_transaction_id varchar(128),
        status varchar(10) NOT NULL DEFAULT 'initie' ${dans('status', E.STATUT_PAIEMENT_ABONNEMENT)},
        checkout_url text,
        paid_at timestamptz,
        recorded_by uuid REFERENCES users(id),
        note text,
        raw_payload jsonb,
        ${HORODATAGE}
      )`,
      'CREATE UNIQUE INDEX subscription_payments_fournisseur_uq ON subscription_payments (provider, provider_transaction_id) WHERE provider_transaction_id IS NOT NULL',
      'CREATE INDEX subscription_payments_company_idx ON subscription_payments (company_id, created_at DESC)',

      `CREATE TABLE refresh_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash char(64) NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz,
        revoked_reason varchar(20) CHECK (revoked_reason IN ('rotation', 'deconnexion', 'plafond', 'distante', 'globale', 'rejeu', 'expiration')),
        session_started_at timestamptz NOT NULL DEFAULT now(),
        device_name varchar(120),
        platform varchar(10),
        ip varchar(64),
        user_agent varchar(300),
        last_used_at timestamptz,
        ${HORODATAGE}
      )`,
      'CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id, expires_at)',

      `CREATE TABLE password_resets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        otp_hash char(64) NOT NULL,
        expires_at timestamptz NOT NULL,
        attempts smallint NOT NULL DEFAULT 0,
        used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      'CREATE INDEX password_resets_user_idx ON password_resets (user_id, created_at DESC)',

      `CREATE TABLE device_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token varchar(512) NOT NULL UNIQUE,
        platform varchar(10) NOT NULL ${dans('platform', E.PLATEFORME_APPAREIL)},
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        ${HORODATAGE}
      )`,
      'CREATE INDEX device_tokens_user_idx ON device_tokens (user_id)',

      `CREATE TABLE platform_settings (
        key varchar(80) PRIMARY KEY,
        value jsonb NOT NULL,
        description text,
        updated_by uuid,
        ${HORODATAGE}
      )`,

      // Idempotence des requêtes mutantes (double clic, renvoi après coupure
      // réseau mobile, synchronisation différée — § 23).
      `CREATE TABLE idempotency_keys (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        key varchar(128) NOT NULL,
        method varchar(8) NOT NULL,
        path varchar(300) NOT NULL,
        request_hash char(64) NOT NULL,
        status varchar(10) NOT NULL DEFAULT 'en_cours' CHECK (status IN ('en_cours', 'termine')),
        response_status integer,
        response_body jsonb,
        expires_at timestamptz NOT NULL,
        ${HORODATAGE},
        CONSTRAINT idempotency_keys_uq UNIQUE (user_id, key)
      )`,
      'CREATE INDEX idempotency_keys_expiration_idx ON idempotency_keys (expires_at)',

      // Numérotation lisible et sans trou (BC-2026-00042, FAC-2026-00007…).
      `CREATE TABLE counters (
        scope varchar(160) PRIMARY KEY,
        value bigint NOT NULL DEFAULT 0
      )`,

      // § 24 « historique des actions » : jamais de clé étrangère, pour
      // survivre à toute évolution des lignes qu'il décrit.
      `CREATE TABLE audit_logs (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id uuid,
        company_id uuid,
        actor_role varchar(40),
        action varchar(80) NOT NULL,
        entity_type varchar(40),
        entity_id varchar(64),
        details jsonb,
        ip varchar(64),
        user_agent varchar(300),
        request_id varchar(128),
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      'CREATE INDEX audit_logs_company_idx ON audit_logs (company_id, created_at DESC)',
      'CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id)',
      'CREATE INDEX audit_logs_user_idx ON audit_logs (user_id, created_at DESC)',
      'CREATE INDEX audit_logs_action_idx ON audit_logs (action, created_at DESC)',
      // Journal en AJOUT SEUL : un déclencheur refuse toute modification,
      // suppression ou vidange, quel que soit le rôle qui la tente.
      `CREATE OR REPLACE FUNCTION audit_logs_ajout_seul() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         RAISE EXCEPTION 'Le journal d''audit est en ajout seul : % interdit', TG_OP
           USING ERRCODE = 'insufficient_privilege';
       END $$`,
      `CREATE TRIGGER audit_logs_ajout_seul
         BEFORE UPDATE OR DELETE ON audit_logs
         FOR EACH ROW EXECUTE FUNCTION audit_logs_ajout_seul()`,
      `CREATE TRIGGER audit_logs_ajout_seul_vidange
         BEFORE TRUNCATE ON audit_logs
         FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_ajout_seul()`,

      `CREATE TABLE notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        company_id uuid REFERENCES companies(id),
        type varchar(30) NOT NULL ${dans('type', E.TYPE_NOTIFICATION)},
        title varchar(150) NOT NULL,
        body text NOT NULL,
        data jsonb NOT NULL DEFAULT '{}'::jsonb,
        read_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      'CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC)',
      'CREATE INDEX notifications_non_lues_idx ON notifications (user_id) WHERE read_at IS NULL',

      // Stockage objet : seule la RÉFÉRENCE est en base. `partner_company_id`
      // désigne la contrepartie qui peut aussi lire le document (visibilité
      // « partenaire »).
      `CREATE TABLE documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid REFERENCES companies(id),
        partner_company_id uuid REFERENCES companies(id),
        entity_type varchar(30) NOT NULL ${dans('entity_type', E.ENTITE_DOCUMENT)},
        entity_id uuid NOT NULL,
        category varchar(20) NOT NULL ${dans('category', E.CATEGORIE_DOCUMENT)},
        visibility varchar(12) NOT NULL DEFAULT 'prive' ${dans('visibility', E.VISIBILITE_DOCUMENT)},
        storage_key varchar(300) NOT NULL,
        thumbnail_key varchar(300),
        mime_type varchar(100) NOT NULL,
        size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
        original_name varchar(255),
        checksum char(64),
        uploaded_by uuid REFERENCES users(id),
        ${HORODATAGE},
        deleted_at timestamptz,
        CONSTRAINT documents_partenaire_ck CHECK (visibility <> 'partenaire' OR partner_company_id IS NOT NULL)
      )`,
      'CREATE INDEX documents_entity_idx ON documents (entity_type, entity_id) WHERE deleted_at IS NULL',
      'CREATE INDEX documents_company_idx ON documents (company_id, created_at DESC) WHERE deleted_at IS NULL',
      'CREATE INDEX documents_partner_idx ON documents (partner_company_id) WHERE deleted_at IS NULL AND partner_company_id IS NOT NULL',
      'ALTER TABLE companies ADD CONSTRAINT companies_logo_fk FOREIGN KEY (logo_document_id) REFERENCES documents(id)',
    ]);
  },

  async down(queryInterface) {
    await executer(queryInterface, [
      'ALTER TABLE IF EXISTS companies DROP CONSTRAINT IF EXISTS companies_logo_fk',
      'DROP TABLE IF EXISTS documents, notifications, audit_logs, counters, idempotency_keys, platform_settings, device_tokens, password_resets, refresh_tokens, subscription_payments, subscriptions, subscription_plans, member_invitations, company_members, companies, users, roles CASCADE',
      'DROP FUNCTION IF EXISTS audit_logs_ajout_seul()',
    ]);
  },
};
