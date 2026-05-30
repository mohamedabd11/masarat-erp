-- =============================================================================
-- Migration 001: Initial Schema — Masarat ERP PostgreSQL
-- =============================================================================
-- تاريخ: 2026-01-01
-- الوصف: الهجرة الكاملة من Firestore إلى PostgreSQL
--
-- ترتيب التنفيذ مهم جداً (foreign key dependencies):
-- 1. Enums
-- 2. agencies
-- 3. users (يعتمد على agencies)
-- 4. customers (يعتمد على agencies, users)
-- 5. bookings (يعتمد على customers, users)
-- 6. accounting (يعتمد على agencies, bookings)
-- 7. payments (يعتمد على bookings, invoices)
-- 8. suppliers & operations
-- 9. RLS Policies
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECTION 1: EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- للبحث النصي السريع

-- =============================================================================
-- SECTION 2: ENUMS
-- =============================================================================

CREATE TYPE user_role AS ENUM ('admin', 'agent', 'accountant', 'viewer');
CREATE TYPE subscription_plan AS ENUM ('trial', 'starter', 'professional', 'enterprise');
CREATE TYPE subscription_status AS ENUM ('active', 'trial', 'suspended', 'cancelled', 'past_due');
CREATE TYPE booking_type AS ENUM ('flight', 'hotel', 'package', 'umrah', 'hajj', 'insurance', 'visa', 'transport');
CREATE TYPE booking_status AS ENUM ('draft', 'pending_approval', 'confirmed', 'ticketed', 'completed', 'cancelled', 'refunded');
CREATE TYPE payment_status AS ENUM ('unpaid', 'partial', 'fully_paid', 'refunded');
CREATE TYPE revenue_model AS ENUM ('agent', 'principal');
CREATE TYPE passenger_type AS ENUM ('adult', 'child', 'infant');
CREATE TYPE gender AS ENUM ('male', 'female');
CREATE TYPE booking_source AS ENUM ('web', 'mobile', 'api');
CREATE TYPE customer_type AS ENUM ('individual', 'company', 'sub_agent');
CREATE TYPE customer_tier AS ENUM ('standard', 'silver', 'gold', 'platinum');
CREATE TYPE invoice_type AS ENUM ('tax_invoice', 'credit_note', 'debit_note');
CREATE TYPE invoice_status AS ENUM ('draft', 'issued', 'cancelled', 'credited');
CREATE TYPE zatca_invoice_type_code AS ENUM ('388', '381', '383');
CREATE TYPE zatca_submission_status AS ENUM ('not_submitted', 'pending', 'submitted', 'reported', 'cleared', 'rejected', 'failed');
CREATE TYPE zatca_transaction_type AS ENUM ('B2B', 'B2C');
CREATE TYPE account_type AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');
CREATE TYPE account_side AS ENUM ('debit', 'credit');
CREATE TYPE journal_entry_type AS ENUM ('payment_received', 'ticket_issued', 'package_revenue_recognized', 'refund_payment', 'manual_adjustment', 'opening_balance', 'bank_reconciliation');
CREATE TYPE journal_entry_status AS ENUM ('draft', 'posted', 'reversed');
CREATE TYPE vat_category AS ENUM ('S', 'Z', 'E', 'O');
CREATE TYPE payment_method AS ENUM ('cash', 'bank_transfer', 'credit_card', 'mada', 'apple_pay', 'stc_pay', 'tamara', 'tabby', 'cheque');
CREATE TYPE cheque_status AS ENUM ('pending', 'deposited', 'cleared', 'bounced', 'cancelled');
CREATE TYPE employee_status AS ENUM ('active', 'inactive', 'on_leave', 'terminated');
CREATE TYPE zatca_queue_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'dead_letter');

-- =============================================================================
-- SECTION 3: AGENCIES (Tenants)
-- =============================================================================

CREATE TABLE agencies (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name_ar               VARCHAR(200) NOT NULL,
    name_en               VARCHAR(200) NOT NULL,
    cr_number             VARCHAR(20),
    vat_number            VARCHAR(15),
    address               JSONB,
    subscription_plan     subscription_plan NOT NULL DEFAULT 'trial',
    subscription_status   subscription_status NOT NULL DEFAULT 'trial',
    trial_ends_at         TIMESTAMPTZ,
    subscription_ends_at  TIMESTAMPTZ,
    max_users             INTEGER NOT NULL DEFAULT 2,
    max_bookings_per_month INTEGER,
    is_active             BOOLEAN NOT NULL DEFAULT true,
    logo_url              TEXT,
    primary_color         VARCHAR(7) DEFAULT '#1a56db',
    firebase_admin_uid    VARCHAR(128),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX agencies_subscription_status_idx ON agencies(subscription_status);
CREATE INDEX agencies_cr_number_idx ON agencies(cr_number);

-- =============================================================================
-- SECTION 4: AGENCY CONFIGS
-- =============================================================================

CREATE TABLE agency_accounting_configs (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id             UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE UNIQUE,
    vat_rate_bps          INTEGER NOT NULL DEFAULT 1500,
    account_mapping       JSONB,
    default_revenue_models JSONB,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE agency_zatca_configs (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id               UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE UNIQUE,
    seller_name_ar          VARCHAR(200) NOT NULL,
    seller_name_en          VARCHAR(200),
    vat_number              VARCHAR(15) NOT NULL,
    cr_number               VARCHAR(20),
    seller_address          JSONB,
    certificate_serial      VARCHAR(100),
    certificate_expires_at  TIMESTAMPTZ,
    environment             VARCHAR(20) NOT NULL DEFAULT 'simulation',
    last_invoice_hash       TEXT,
    last_invoice_number     VARCHAR(30),
    is_enabled              BOOLEAN NOT NULL DEFAULT false,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- SECTION 5: USERS
-- =============================================================================

CREATE TABLE users (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id        UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    firebase_uid     VARCHAR(128) UNIQUE,
    email            VARCHAR(255) NOT NULL,
    name_ar          VARCHAR(100) NOT NULL,
    name_en          VARCHAR(100) NOT NULL,
    mobile           VARCHAR(20),
    role             user_role NOT NULL DEFAULT 'agent',
    permissions      JSONB DEFAULT '{}',
    preferences      JSONB DEFAULT '{"language": "ar", "theme": "system"}',
    is_active        BOOLEAN NOT NULL DEFAULT true,
    last_login_at    TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(email, agency_id)
);

CREATE INDEX users_agency_id_idx ON users(agency_id);
CREATE INDEX users_firebase_uid_idx ON users(firebase_uid);
CREATE INDEX users_role_agency_idx ON users(agency_id, role);

CREATE TABLE user_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agency_id           UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    firebase_session_id VARCHAR(256),
    user_agent          TEXT,
    ip_address          VARCHAR(45),
    device_info         JSONB,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    expires_at          TIMESTAMPTZ NOT NULL,
    last_activity_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX sessions_user_id_idx ON user_sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON user_sessions(expires_at);

-- Audit Log — لا يُحذف أبداً
CREATE TABLE audit_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id     UUID REFERENCES agencies(id) ON DELETE SET NULL,
    user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    action        VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id   UUID,
    old_values    JSONB,
    new_values    JSONB,
    ip_address    VARCHAR(45),
    user_agent    TEXT,
    request_id    UUID,
    metadata      JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX audit_logs_agency_id_idx ON audit_logs(agency_id);
CREATE INDEX audit_logs_resource_idx ON audit_logs(resource_type, resource_id);
CREATE INDEX audit_logs_created_at_idx ON audit_logs(created_at);

-- =============================================================================
-- SECTION 6: CUSTOMERS
-- =============================================================================

CREATE TABLE customers (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id            UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    type                 customer_type NOT NULL DEFAULT 'individual',
    tier                 customer_tier NOT NULL DEFAULT 'standard',
    name_ar              VARCHAR(200) NOT NULL,
    name_en              VARCHAR(200),
    gender               gender,
    nationality          VARCHAR(3),
    mobile               VARCHAR(20),
    email                VARCHAR(255),
    company_vat_number   VARCHAR(15),
    company_cr_number    VARCHAR(20),
    tags                 JSONB DEFAULT '[]',
    loyalty_points       INTEGER NOT NULL DEFAULT 0,
    loyalty_points_total INTEGER NOT NULL DEFAULT 0,
    total_bookings       INTEGER NOT NULL DEFAULT 0,
    total_spent_halalas  BIGINT NOT NULL DEFAULT 0,
    last_booking_at      TIMESTAMPTZ,
    has_unpaid_balance   BOOLEAN NOT NULL DEFAULT false,
    is_blacklisted       BOOLEAN NOT NULL DEFAULT false,
    blacklist_reason     TEXT,
    assigned_agent_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    is_active            BOOLEAN NOT NULL DEFAULT true,
    notes                TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by           UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX customers_agency_id_idx ON customers(agency_id);
CREATE INDEX customers_mobile_idx ON customers(agency_id, mobile);
CREATE INDEX customers_email_idx ON customers(agency_id, email);
-- Full-text search على اسم العميل
CREATE INDEX customers_name_ar_trgm_idx ON customers USING gin(name_ar gin_trgm_ops);
CREATE INDEX customers_name_en_trgm_idx ON customers USING gin(name_en gin_trgm_ops);

CREATE TABLE customer_passports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    agency_id       UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    passport_number VARCHAR(20) NOT NULL,
    nationality     VARCHAR(3),
    expiry_date     DATE,
    issue_date      DATE,
    issue_country   VARCHAR(3),
    first_name_en   VARCHAR(100),
    last_name_en    VARCHAR(100),
    first_name_ar   VARCHAR(100),
    last_name_ar    VARCHAR(100),
    date_of_birth   DATE,
    gender          gender,
    is_primary      BOOLEAN NOT NULL DEFAULT false,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX passports_customer_id_idx ON customer_passports(customer_id);
CREATE INDEX passports_agency_number_idx ON customer_passports(agency_id, passport_number);

-- =============================================================================
-- SECTION 7: BOOKINGS
-- =============================================================================

CREATE TABLE bookings (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id             UUID NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
    type                  booking_type NOT NULL,
    status                booking_status NOT NULL DEFAULT 'draft',
    source                booking_source NOT NULL DEFAULT 'web',
    customer_id           UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    customer_name_ar      VARCHAR(200) NOT NULL,
    customer_name_en      VARCHAR(200),
    customer_phone        VARCHAR(20),
    agent_id              UUID REFERENCES users(id) ON DELETE SET NULL,
    agent_name            VARCHAR(200),
    revenue_model         revenue_model NOT NULL DEFAULT 'agent',
    currency              VARCHAR(3) NOT NULL DEFAULT 'SAR',
    total_cost_halalas    BIGINT NOT NULL DEFAULT 0,
    service_fee_halalas   BIGINT NOT NULL DEFAULT 0,
    vat_amount_halalas    BIGINT NOT NULL DEFAULT 0,
    vat_category          vat_category NOT NULL DEFAULT 'S',
    total_amount_halalas  BIGINT NOT NULL DEFAULT 0,
    commission_halalas    BIGINT NOT NULL DEFAULT 0,
    payment_status        payment_status NOT NULL DEFAULT 'unpaid',
    total_paid_halalas    BIGINT NOT NULL DEFAULT 0,
    total_due_halalas     BIGINT NOT NULL DEFAULT 0,
    supplier_id           UUID,
    supplier_name         VARCHAR(200),
    supplier_ref          VARCHAR(100),
    travel_date           DATE,
    return_date           DATE,
    custom_fields         JSONB,
    notes                 TEXT,
    internal_notes        TEXT,
    cancellation_reason   TEXT,
    cancelled_at          TIMESTAMPTZ,
    cancelled_by          UUID,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by            UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    -- Constraints
    CONSTRAINT bookings_amounts_non_negative
        CHECK (total_amount_halalas >= 0 AND total_paid_halalas >= 0 AND total_due_halalas >= 0)
);

CREATE INDEX bookings_agency_id_idx ON bookings(agency_id);
CREATE INDEX bookings_customer_id_idx ON bookings(customer_id);
CREATE INDEX bookings_agent_id_idx ON bookings(agent_id);
CREATE INDEX bookings_status_idx ON bookings(agency_id, status);
CREATE INDEX bookings_type_idx ON bookings(agency_id, type);
CREATE INDEX bookings_payment_status_idx ON bookings(agency_id, payment_status);
CREATE INDEX bookings_travel_date_idx ON bookings(agency_id, travel_date);
CREATE INDEX bookings_created_at_idx ON bookings(agency_id, created_at DESC);

CREATE TABLE booking_passengers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id      UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    agency_id       UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    line_order      INTEGER NOT NULL DEFAULT 1,
    type            passenger_type NOT NULL DEFAULT 'adult',
    name_en         VARCHAR(200) NOT NULL,
    name_ar         VARCHAR(200),
    passport_number VARCHAR(20),
    passport_expiry DATE,
    nationality     VARCHAR(3),
    date_of_birth   DATE,
    gender          gender,
    ticket_number   VARCHAR(30),
    ticket_issued_at TIMESTAMPTZ,
    customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX passengers_booking_id_idx ON booking_passengers(booking_id);

-- =============================================================================
-- SECTION 8: CHART OF ACCOUNTS
-- =============================================================================

CREATE TABLE chart_of_accounts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id           UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    code                VARCHAR(20) NOT NULL,
    name_ar             VARCHAR(200) NOT NULL,
    name_en             VARCHAR(200) NOT NULL,
    type                account_type NOT NULL,
    normal_side         account_side NOT NULL,
    balance_halalas     BIGINT NOT NULL DEFAULT 0,
    parent_code         VARCHAR(20),
    level               INTEGER NOT NULL DEFAULT 1,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    is_system           BOOLEAN NOT NULL DEFAULT false,
    allow_manual_entry  BOOLEAN NOT NULL DEFAULT true,
    description         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(agency_id, code)
);

CREATE INDEX coa_agency_id_idx ON chart_of_accounts(agency_id);
CREATE INDEX coa_type_idx ON chart_of_accounts(agency_id, type);

-- =============================================================================
-- SECTION 9: JOURNAL ENTRIES (Accounting Ledger)
-- =============================================================================

CREATE TABLE journal_entries (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id              UUID NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
    type                   journal_entry_type NOT NULL,
    description            TEXT NOT NULL,
    entry_date             DATE NOT NULL,
    period                 VARCHAR(7) NOT NULL,
    total_debit_halalas    BIGINT NOT NULL DEFAULT 0,
    total_credit_halalas   BIGINT NOT NULL DEFAULT 0,
    is_balanced            BOOLEAN NOT NULL DEFAULT false,
    status                 journal_entry_status NOT NULL DEFAULT 'draft',
    is_auto_generated      BOOLEAN NOT NULL DEFAULT true,
    booking_id             UUID REFERENCES bookings(id) ON DELETE SET NULL,
    invoice_id             UUID,
    reversed_by_entry_id   UUID,
    reversal_of_entry_id   UUID,
    metadata               JSONB,
    posted_at              TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by             UUID REFERENCES users(id) ON DELETE SET NULL,
    -- القيود المعتمدة يجب أن تكون متوازنة
    CONSTRAINT je_balance_check
        CHECK (status = 'draft' OR (is_balanced = true AND total_debit_halalas = total_credit_halalas))
);

CREATE INDEX je_agency_id_idx ON journal_entries(agency_id);
CREATE INDEX je_booking_id_idx ON journal_entries(booking_id);
CREATE INDEX je_period_idx ON journal_entries(agency_id, period);
CREATE INDEX je_entry_date_idx ON journal_entries(agency_id, entry_date DESC);
CREATE INDEX je_status_idx ON journal_entries(agency_id, status);

CREATE TABLE journal_lines (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    agency_id        UUID NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
    line_number      INTEGER NOT NULL,
    account_code     VARCHAR(20) NOT NULL,
    account_name_ar  VARCHAR(200) NOT NULL,
    account_name_en  VARCHAR(200) NOT NULL,
    debit_halalas    BIGINT NOT NULL DEFAULT 0,
    credit_halalas   BIGINT NOT NULL DEFAULT 0,
    description      TEXT,
    cost_center      VARCHAR(50),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- إما debit أو credit — ليس الاثنان معاً
    CONSTRAINT jl_debit_or_credit_check
        CHECK (
            (debit_halalas = 0 AND credit_halalas > 0) OR
            (credit_halalas = 0 AND debit_halalas > 0)
        )
);

CREATE INDEX jl_journal_entry_id_idx ON journal_lines(journal_entry_id);
CREATE INDEX jl_agency_account_idx ON journal_lines(agency_id, account_code);

-- =============================================================================
-- SECTION 10: INVOICES
-- =============================================================================

CREATE TABLE invoices (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id                  UUID NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
    type                       invoice_type NOT NULL DEFAULT 'tax_invoice',
    status                     invoice_status NOT NULL DEFAULT 'draft',
    invoice_number             VARCHAR(30) NOT NULL,
    zatca_uuid                 UUID NOT NULL DEFAULT gen_random_uuid(),
    booking_id                 UUID REFERENCES bookings(id) ON DELETE RESTRICT,
    original_invoice_id        UUID,
    journal_entry_id           UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
    seller_name_ar             VARCHAR(200) NOT NULL,
    seller_name_en             VARCHAR(200),
    seller_vat_number          VARCHAR(15) NOT NULL,
    seller_cr_number           VARCHAR(20),
    seller_address             JSONB,
    buyer_id                   UUID REFERENCES customers(id) ON DELETE SET NULL,
    buyer_name                 VARCHAR(200) NOT NULL,
    buyer_vat_number           VARCHAR(15),
    buyer_phone                VARCHAR(20),
    subtotal_excl_vat_halalas  BIGINT NOT NULL DEFAULT 0,
    total_vat_halalas          BIGINT NOT NULL DEFAULT 0,
    grand_total_halalas        BIGINT NOT NULL DEFAULT 0,
    currency                   VARCHAR(3) NOT NULL DEFAULT 'SAR',
    payment_status             payment_status NOT NULL DEFAULT 'unpaid',
    amount_paid_halalas        BIGINT NOT NULL DEFAULT 0,
    amount_due_halalas         BIGINT NOT NULL DEFAULT 0,
    zatca_invoice_type_code    zatca_invoice_type_code NOT NULL DEFAULT '388',
    zatca_transaction_type     zatca_transaction_type NOT NULL DEFAULT 'B2C',
    zatca_submission_status    zatca_submission_status NOT NULL DEFAULT 'not_submitted',
    zatca_xml_hash             TEXT,
    zatca_qr_code_data         TEXT,
    zatca_signed_xml_url       TEXT,
    zatca_submitted_at         TIMESTAMPTZ,
    zatca_clearance_id         VARCHAR(100),
    issue_date                 DATE NOT NULL,
    due_date                   DATE,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by                 UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(agency_id, invoice_number),
    UNIQUE(zatca_uuid)
);

CREATE INDEX invoices_agency_id_idx ON invoices(agency_id);
CREATE INDEX invoices_booking_id_idx ON invoices(booking_id);
CREATE INDEX invoices_status_idx ON invoices(agency_id, status);
CREATE INDEX invoices_zatca_status_idx ON invoices(agency_id, zatca_submission_status);
CREATE INDEX invoices_issue_date_idx ON invoices(agency_id, issue_date DESC);
CREATE INDEX invoices_payment_status_idx ON invoices(agency_id, payment_status);

CREATE TABLE invoice_lines (
    id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id                   UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    agency_id                    UUID NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
    line_id                      VARCHAR(10) NOT NULL,
    name                         VARCHAR(300) NOT NULL,
    quantity                     INTEGER NOT NULL DEFAULT 1,
    unit_code                    VARCHAR(10) NOT NULL DEFAULT 'PCE',
    unit_price_excl_vat_halalas  BIGINT NOT NULL DEFAULT 0,
    total_price_excl_vat_halalas BIGINT NOT NULL DEFAULT 0,
    vat_category                 vat_category NOT NULL DEFAULT 'S',
    vat_rate_bps                 INTEGER NOT NULL DEFAULT 1500,
    vat_amount_halalas           BIGINT NOT NULL DEFAULT 0,
    exemption_reason             VARCHAR(50),
    discount_amount_halalas      BIGINT NOT NULL DEFAULT 0,
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX il_invoice_id_idx ON invoice_lines(invoice_id);

-- عداد أرقام الفواتير — الحل الصحيح لـ PostgreSQL
CREATE TABLE invoice_counters (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id        UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    invoice_type     invoice_type NOT NULL,
    year             INTEGER NOT NULL,
    current_sequence INTEGER NOT NULL DEFAULT 0,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(agency_id, invoice_type, year)
);

CREATE INDEX ic_agency_id_idx ON invoice_counters(agency_id);

-- =============================================================================
-- SECTION 11: PAYMENTS
-- =============================================================================

CREATE TABLE payments (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id                UUID NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
    booking_id               UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
    invoice_id               UUID REFERENCES invoices(id) ON DELETE SET NULL,
    receipt_number           VARCHAR(30) NOT NULL,
    amount_halalas           BIGINT NOT NULL,
    currency                 VARCHAR(3) NOT NULL DEFAULT 'SAR',
    method                   payment_method NOT NULL,
    method_details           JSONB,
    receiving_account_code   VARCHAR(20) NOT NULL,
    receiving_account_name   VARCHAR(200),
    journal_entry_id         UUID,
    received_by              UUID REFERENCES users(id) ON DELETE SET NULL,
    notes                    TEXT,
    is_refund                BOOLEAN NOT NULL DEFAULT false,
    refund_of_payment_id     UUID REFERENCES payments(id) ON DELETE SET NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by               UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX payments_agency_id_idx ON payments(agency_id);
CREATE INDEX payments_booking_id_idx ON payments(booking_id);
CREATE INDEX payments_invoice_id_idx ON payments(invoice_id);
CREATE INDEX payments_created_at_idx ON payments(agency_id, created_at DESC);

CREATE TABLE supplier_payments (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id                   UUID NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
    supplier_id                 UUID NOT NULL,
    supplier_name               VARCHAR(200) NOT NULL,
    booking_id                  UUID REFERENCES bookings(id) ON DELETE SET NULL,
    amount_halalas              BIGINT NOT NULL,
    currency                    VARCHAR(3) NOT NULL DEFAULT 'SAR',
    method                      payment_method NOT NULL,
    reference_number            VARCHAR(100),
    payment_account_code        VARCHAR(20) NOT NULL,
    supplier_payable_account_code VARCHAR(20) NOT NULL,
    journal_entry_id            UUID,
    paid_by                     UUID REFERENCES users(id) ON DELETE SET NULL,
    payment_date                DATE NOT NULL,
    notes                       TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by                  UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX sp_agency_id_idx ON supplier_payments(agency_id);
CREATE INDEX sp_supplier_id_idx ON supplier_payments(supplier_id);
CREATE INDEX sp_payment_date_idx ON supplier_payments(agency_id, payment_date DESC);

CREATE TABLE cheques (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id       UUID NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
    cheque_number   VARCHAR(30) NOT NULL,
    bank_name       VARCHAR(200) NOT NULL,
    account_number  VARCHAR(30),
    amount_halalas  BIGINT NOT NULL,
    currency        VARCHAR(3) NOT NULL DEFAULT 'SAR',
    status          cheque_status NOT NULL DEFAULT 'pending',
    due_date        DATE NOT NULL,
    deposited_at    TIMESTAMPTZ,
    cleared_at      TIMESTAMPTZ,
    payee           VARCHAR(200),
    is_incoming     BOOLEAN NOT NULL DEFAULT true,
    payment_id      UUID REFERENCES payments(id) ON DELETE SET NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT cheques_amount_positive CHECK (amount_halalas > 0)
);

CREATE INDEX cheques_agency_id_idx ON cheques(agency_id);
CREATE INDEX cheques_status_idx ON cheques(agency_id, status);
CREATE INDEX cheques_due_date_idx ON cheques(agency_id, due_date);

-- =============================================================================
-- SECTION 12: SUPPLIERS & OPERATIONS
-- =============================================================================

CREATE TABLE suppliers (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id            UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    name_ar              VARCHAR(200) NOT NULL,
    name_en              VARCHAR(200),
    type                 VARCHAR(50) NOT NULL DEFAULT 'airline',
    vat_number           VARCHAR(15),
    contact_name         VARCHAR(200),
    contact_email        VARCHAR(255),
    contact_phone        VARCHAR(20),
    payable_account_code VARCHAR(20),
    balance_due_halalas  BIGINT NOT NULL DEFAULT 0,
    payment_terms_days   INTEGER NOT NULL DEFAULT 30,
    address              JSONB,
    notes                TEXT,
    is_active            BOOLEAN NOT NULL DEFAULT true,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by           UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX suppliers_agency_id_idx ON suppliers(agency_id);
CREATE INDEX suppliers_type_idx ON suppliers(agency_id, type);

CREATE TABLE bank_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id       UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    name_ar         VARCHAR(200) NOT NULL,
    name_en         VARCHAR(200),
    type            VARCHAR(20) NOT NULL DEFAULT 'bank',
    bank_name       VARCHAR(100),
    account_number  VARCHAR(30),
    iban            VARCHAR(34),
    currency        VARCHAR(3) NOT NULL DEFAULT 'SAR',
    balance_halalas BIGINT NOT NULL DEFAULT 0,
    account_code    VARCHAR(20) NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    is_default      BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ba_agency_id_idx ON bank_accounts(agency_id);

CREATE TABLE bank_transactions (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id                UUID NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
    bank_account_id          UUID NOT NULL,
    transaction_date         DATE NOT NULL,
    description              VARCHAR(500) NOT NULL,
    reference_number         VARCHAR(100),
    amount_halalas           BIGINT NOT NULL,
    running_balance_halalas  BIGINT,
    is_reconciled            BOOLEAN NOT NULL DEFAULT false,
    reconciled_payment_id    UUID,
    reconciled_at            TIMESTAMPTZ,
    raw_data                 JSONB,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX bt_agency_id_idx ON bank_transactions(agency_id);
CREATE INDEX bt_bank_account_id_idx ON bank_transactions(bank_account_id);
CREATE INDEX bt_transaction_date_idx ON bank_transactions(agency_id, transaction_date DESC);
CREATE INDEX bt_is_reconciled_idx ON bank_transactions(agency_id, is_reconciled);

CREATE TABLE employees (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id        UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
    department_id    UUID,
    name_ar          VARCHAR(200) NOT NULL,
    name_en          VARCHAR(200),
    national_id      VARCHAR(20),
    mobile           VARCHAR(20),
    email            VARCHAR(255),
    job_title        VARCHAR(100),
    role             VARCHAR(50),
    salary_halalas   BIGINT,
    status           employee_status NOT NULL DEFAULT 'active',
    hire_date        TIMESTAMPTZ,
    termination_date TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX employees_agency_id_idx ON employees(agency_id);
CREATE INDEX employees_status_idx ON employees(agency_id, status);

CREATE TABLE departments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id  UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    name_ar    VARCHAR(200) NOT NULL,
    name_en    VARCHAR(200),
    manager_id UUID,
    is_active  BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX departments_agency_id_idx ON departments(agency_id);

CREATE TABLE exchange_rates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id       UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    from_currency   VARCHAR(3) NOT NULL,
    to_currency     VARCHAR(3) NOT NULL,
    rate_bps        INTEGER NOT NULL,
    effective_date  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX er_agency_id_idx ON exchange_rates(agency_id);
CREATE INDEX er_currencies_idx ON exchange_rates(agency_id, from_currency, to_currency);

CREATE TABLE service_types (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id    UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    booking_type booking_type NOT NULL,
    name_ar      VARCHAR(200) NOT NULL,
    name_en      VARCHAR(200),
    is_enabled   BOOLEAN NOT NULL DEFAULT true,
    config       JSONB,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(agency_id, booking_type)
);

CREATE INDEX st_agency_id_idx ON service_types(agency_id);

CREATE TABLE idempotency_keys (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id   UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    key         VARCHAR(300) NOT NULL UNIQUE,
    operation   VARCHAR(50) NOT NULL,
    status      VARCHAR(20) NOT NULL DEFAULT 'success',
    result      JSONB,
    error_message TEXT,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ik_agency_id_idx ON idempotency_keys(agency_id);
CREATE INDEX ik_expires_at_idx ON idempotency_keys(expires_at);

CREATE TABLE zatca_submission_queue (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id           UUID NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
    invoice_id          UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    status              zatca_queue_status NOT NULL DEFAULT 'pending',
    invoice_type_code   zatca_invoice_type_code NOT NULL DEFAULT '388',
    transaction_type    zatca_transaction_type NOT NULL DEFAULT 'B2C',
    signed_xml_url      TEXT,
    invoice_hash        TEXT,
    attempt_count       INTEGER NOT NULL DEFAULT 0,
    max_attempts        INTEGER NOT NULL DEFAULT 5,
    last_attempt_at     TIMESTAMPTZ,
    next_retry_at       TIMESTAMPTZ,
    zatca_response      JSONB,
    zatca_status        VARCHAR(50),
    zatca_clearance_id  VARCHAR(100),
    zatca_error_code    VARCHAR(20),
    error_message       TEXT,
    processed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX zq_agency_id_idx ON zatca_submission_queue(agency_id);
CREATE INDEX zq_status_idx ON zatca_submission_queue(status);
CREATE INDEX zq_next_retry_idx ON zatca_submission_queue(next_retry_at) WHERE status = 'pending';

CREATE TABLE vat_returns (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id           UUID NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
    period              VARCHAR(10) NOT NULL,
    year                INTEGER NOT NULL,
    quarter             INTEGER NOT NULL,
    output_vat_halalas  INTEGER NOT NULL DEFAULT 0,
    input_vat_halalas   INTEGER NOT NULL DEFAULT 0,
    net_vat_halalas     INTEGER NOT NULL DEFAULT 0,
    status              VARCHAR(20) NOT NULL DEFAULT 'draft',
    submitted_at        TIMESTAMPTZ,
    submitted_by        UUID,
    report_data         JSONB,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(agency_id, period)
);

CREATE INDEX vr_agency_id_idx ON vat_returns(agency_id);

-- =============================================================================
-- SECTION 13: UPDATED_AT TRIGGER
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- تطبيق الـ trigger على جميع الجداول التي تملك updated_at
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name = 'updated_at'
    LOOP
        EXECUTE format(
            'CREATE TRIGGER set_updated_at
             BEFORE UPDATE ON %I
             FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
            t
        );
    END LOOP;
END;
$$;

COMMIT;
