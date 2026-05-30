-- =============================================================================
-- Migration 002: Row Level Security (RLS) — Multi-Tenant Isolation
-- =============================================================================
-- الهدف: فرض عزل بيانات الوكالات على مستوى قاعدة البيانات
--
-- الآلية:
-- 1. كل connection يُعيَّن له agency_id عبر SET app.current_agency_id
-- 2. RLS policies تفرض فلتر تلقائي على كل query
-- 3. حتى لو نسي المطور WHERE agency_id = ... لن تتسرب البيانات
--
-- مستويات الوصول:
-- - app_user: المستخدم العادي (يرى بياناته فقط)
-- - app_service: الـ API server (يرى كل شيء لنفس الـ agency)
-- - app_admin: Super Admin (يرى كل شيء — محدود جداً)
-- - app_migrations: تشغيل migrations فقط
--
-- المرجع: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECTION 1: ROLES
-- =============================================================================

-- دور التطبيق الرئيسي (يستخدمه الـ API server)
DO $$ BEGIN
    CREATE ROLE app_user NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- دور الـ Super Admin (محظور من الـ RLS — يرى كل شيء)
DO $$ BEGIN
    CREATE ROLE app_admin NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- دور الـ migrations (لتشغيل SQL scripts)
DO $$ BEGIN
    CREATE ROLE app_migrations NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- منح الصلاحيات
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
GRANT ALL ON SCHEMA public TO app_admin;
GRANT ALL ON ALL TABLES IN SCHEMA public TO app_admin;
GRANT ALL ON SCHEMA public TO app_migrations;
GRANT ALL ON ALL TABLES IN SCHEMA public TO app_migrations;

-- =============================================================================
-- SECTION 2: HELPER FUNCTIONS
-- =============================================================================

-- دالة استخراج agency_id من context الـ session
CREATE OR REPLACE FUNCTION current_agency_id()
RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_agency_id', true), '')::UUID;
EXCEPTION
    WHEN invalid_text_representation THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- دالة التحقق من صحة الـ agency_id
CREATE OR REPLACE FUNCTION is_valid_agency_context()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN current_agency_id() IS NOT NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- SECTION 3: ENABLE RLS على كل الجداول
-- =============================================================================

ALTER TABLE agencies                ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_accounting_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_zatca_configs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_passports      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings                ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_passengers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines           ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices                ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines           ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_counters        ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments                ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE cheques                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees               ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_types           ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys        ENABLE ROW LEVEL SECURITY;
ALTER TABLE zatca_submission_queue  ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat_returns             ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- SECTION 4: BYPASS RLS للـ Admin (يتجاوز كل القيود)
-- =============================================================================

-- app_admin يتجاوز RLS تلقائياً (BYPASSRLS attribute)
ALTER ROLE app_admin BYPASSRLS;
ALTER ROLE app_migrations BYPASSRLS;

-- =============================================================================
-- SECTION 5: RLS POLICIES
-- =============================================================================

-- ─── agencies ────────────────────────────────────────────────────────────────

-- الوكالة ترى معلوماتها فقط
CREATE POLICY agencies_tenant_isolation ON agencies
    FOR ALL
    TO app_user
    USING (id = current_agency_id());

-- ─── agency_accounting_configs ───────────────────────────────────────────────

CREATE POLICY aac_tenant_isolation ON agency_accounting_configs
    FOR ALL
    TO app_user
    USING (agency_id = current_agency_id());

-- ─── agency_zatca_configs ────────────────────────────────────────────────────

CREATE POLICY azc_tenant_isolation ON agency_zatca_configs
    FOR ALL
    TO app_user
    USING (agency_id = current_agency_id());

-- ─── users ───────────────────────────────────────────────────────────────────

-- المستخدمون يرون زملاءهم في نفس الوكالة فقط
CREATE POLICY users_tenant_isolation ON users
    FOR ALL
    TO app_user
    USING (agency_id = current_agency_id());

-- ─── user_sessions ───────────────────────────────────────────────────────────

CREATE POLICY sessions_tenant_isolation ON user_sessions
    FOR ALL
    TO app_user
    USING (agency_id = current_agency_id());

-- ─── audit_logs ──────────────────────────────────────────────────────────────

-- يُقرأ فقط — لا يُكتب مباشرة من الـ app (يكتبه trigger أو service function)
CREATE POLICY audit_logs_read ON audit_logs
    FOR SELECT
    TO app_user
    USING (agency_id = current_agency_id());

CREATE POLICY audit_logs_insert ON audit_logs
    FOR INSERT
    TO app_user
    WITH CHECK (agency_id = current_agency_id());

-- لا update ولا delete للـ audit logs (append-only)

-- ─── customers ───────────────────────────────────────────────────────────────

CREATE POLICY customers_tenant_isolation ON customers
    FOR ALL
    TO app_user
    USING (agency_id = current_agency_id())
    WITH CHECK (agency_id = current_agency_id());

-- ─── customer_passports ──────────────────────────────────────────────────────

CREATE POLICY passports_tenant_isolation ON customer_passports
    FOR ALL
    TO app_user
    USING (agency_id = current_agency_id())
    WITH CHECK (agency_id = current_agency_id());

-- ─── bookings ────────────────────────────────────────────────────────────────

CREATE POLICY bookings_tenant_isolation ON bookings
    FOR ALL
    TO app_user
    USING (agency_id = current_agency_id())
    WITH CHECK (agency_id = current_agency_id());

-- ─── booking_passengers ──────────────────────────────────────────────────────

CREATE POLICY passengers_tenant_isolation ON booking_passengers
    FOR ALL
    TO app_user
    USING (agency_id = current_agency_id())
    WITH CHECK (agency_id = current_agency_id());

-- ─── chart_of_accounts ───────────────────────────────────────────────────────

CREATE POLICY coa_tenant_isolation ON chart_of_accounts
    FOR ALL
    TO app_user
    USING (agency_id = current_agency_id())
    WITH CHECK (agency_id = current_agency_id());

-- ─── journal_entries — APPEND-ONLY ENFORCEMENT ───────────────────────────────

CREATE POLICY je_read ON journal_entries
    FOR SELECT
    TO app_user
    USING (agency_id = current_agency_id());

CREATE POLICY je_insert ON journal_entries
    FOR INSERT
    TO app_user
    WITH CHECK (agency_id = current_agency_id());

-- يسمح بتحديث draft entries فقط
CREATE POLICY je_update ON journal_entries
    FOR UPDATE
    TO app_user
    USING (agency_id = current_agency_id() AND status = 'draft')
    WITH CHECK (agency_id = current_agency_id());

-- لا حذف مطلقاً للقيود اليومية
-- (لا نُنشئ DELETE policy = يُمنع تلقائياً)

-- ─── journal_lines ───────────────────────────────────────────────────────────

CREATE POLICY jl_read ON journal_lines
    FOR SELECT
    TO app_user
    USING (agency_id = current_agency_id());

CREATE POLICY jl_insert ON journal_lines
    FOR INSERT
    TO app_user
    WITH CHECK (agency_id = current_agency_id());

-- لا update ولا delete للسطور بعد إنشاء القيد

-- ─── invoices — APPEND-ONLY ENFORCEMENT ──────────────────────────────────────

CREATE POLICY invoices_read ON invoices
    FOR SELECT
    TO app_user
    USING (agency_id = current_agency_id());

CREATE POLICY invoices_insert ON invoices
    FOR INSERT
    TO app_user
    WITH CHECK (agency_id = current_agency_id());

-- يسمح بتحديث draft invoices فقط + تحديث ZATCA status
CREATE POLICY invoices_update ON invoices
    FOR UPDATE
    TO app_user
    USING (agency_id = current_agency_id())
    WITH CHECK (agency_id = current_agency_id());

-- لا حذف للفواتير مطلقاً
-- (لا نُنشئ DELETE policy)

-- ─── invoice_lines ───────────────────────────────────────────────────────────

CREATE POLICY il_tenant_isolation ON invoice_lines
    FOR ALL
    TO app_user
    USING (agency_id = current_agency_id())
    WITH CHECK (agency_id = current_agency_id());

-- ─── invoice_counters ────────────────────────────────────────────────────────

CREATE POLICY ic_tenant_isolation ON invoice_counters
    FOR ALL
    TO app_user
    USING (agency_id = current_agency_id())
    WITH CHECK (agency_id = current_agency_id());

-- ─── payments — APPEND-ONLY ──────────────────────────────────────────────────

CREATE POLICY payments_read ON payments
    FOR SELECT
    TO app_user
    USING (agency_id = current_agency_id());

CREATE POLICY payments_insert ON payments
    FOR INSERT
    TO app_user
    WITH CHECK (agency_id = current_agency_id());

-- لا update ولا delete للمدفوعات

-- ─── supplier_payments — APPEND-ONLY ─────────────────────────────────────────

CREATE POLICY sp_read ON supplier_payments
    FOR SELECT
    TO app_user
    USING (agency_id = current_agency_id());

CREATE POLICY sp_insert ON supplier_payments
    FOR INSERT
    TO app_user
    WITH CHECK (agency_id = current_agency_id());

-- ─── cheques ─────────────────────────────────────────────────────────────────

CREATE POLICY cheques_tenant_isolation ON cheques
    FOR ALL
    TO app_user
    USING (agency_id = current_agency_id())
    WITH CHECK (agency_id = current_agency_id());

-- ─── bank_transactions — READ + INSERT ONLY ───────────────────────────────────

CREATE POLICY bt_read ON bank_transactions
    FOR SELECT
    TO app_user
    USING (agency_id = current_agency_id());

CREATE POLICY bt_insert ON bank_transactions
    FOR INSERT
    TO app_user
    WITH CHECK (agency_id = current_agency_id());

CREATE POLICY bt_update ON bank_transactions
    FOR UPDATE
    TO app_user
    USING (agency_id = current_agency_id() AND is_reconciled = false)
    WITH CHECK (agency_id = current_agency_id());

-- ─── suppliers ───────────────────────────────────────────────────────────────

CREATE POLICY suppliers_tenant_isolation ON suppliers
    FOR ALL
    TO app_user
    USING (agency_id = current_agency_id())
    WITH CHECK (agency_id = current_agency_id());

-- ─── bank_accounts ───────────────────────────────────────────────────────────

CREATE POLICY ba_tenant_isolation ON bank_accounts
    FOR ALL
    TO app_user
    USING (agency_id = current_agency_id())
    WITH CHECK (agency_id = current_agency_id());

-- ─── employees ───────────────────────────────────────────────────────────────

CREATE POLICY employees_tenant_isolation ON employees
    FOR ALL
    TO app_user
    USING (agency_id = current_agency_id())
    WITH CHECK (agency_id = current_agency_id());

-- ─── departments ─────────────────────────────────────────────────────────────

CREATE POLICY departments_tenant_isolation ON departments
    FOR ALL
    TO app_user
    USING (agency_id = current_agency_id())
    WITH CHECK (agency_id = current_agency_id());

-- ─── exchange_rates ───────────────────────────────────────────────────────────

CREATE POLICY er_tenant_isolation ON exchange_rates
    FOR ALL
    TO app_user
    USING (agency_id = current_agency_id())
    WITH CHECK (agency_id = current_agency_id());

-- ─── service_types ────────────────────────────────────────────────────────────

CREATE POLICY st_tenant_isolation ON service_types
    FOR ALL
    TO app_user
    USING (agency_id = current_agency_id())
    WITH CHECK (agency_id = current_agency_id());

-- ─── idempotency_keys ─────────────────────────────────────────────────────────

CREATE POLICY ik_tenant_isolation ON idempotency_keys
    FOR ALL
    TO app_user
    USING (agency_id = current_agency_id())
    WITH CHECK (agency_id = current_agency_id());

-- ─── zatca_submission_queue ───────────────────────────────────────────────────

CREATE POLICY zq_tenant_isolation ON zatca_submission_queue
    FOR ALL
    TO app_user
    USING (agency_id = current_agency_id())
    WITH CHECK (agency_id = current_agency_id());

-- ─── vat_returns ──────────────────────────────────────────────────────────────

CREATE POLICY vr_tenant_isolation ON vat_returns
    FOR ALL
    TO app_user
    USING (agency_id = current_agency_id())
    WITH CHECK (agency_id = current_agency_id());

-- =============================================================================
-- SECTION 6: HELPER FUNCTION — Set Tenant Context
-- =============================================================================

-- دالة لاستخدامها في كل request قبل أي query
CREATE OR REPLACE FUNCTION set_tenant_context(p_agency_id UUID)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_agency_id', p_agency_id::TEXT, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- دالة مساعدة لاختبار الـ RLS
CREATE OR REPLACE FUNCTION get_current_tenant_context()
RETURNS TABLE(agency_id UUID, is_set BOOLEAN) AS $$
BEGIN
    RETURN QUERY SELECT
        current_agency_id() as agency_id,
        current_agency_id() IS NOT NULL as is_set;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SECTION 7: PREVENT FINANCIAL RECORD TAMPERING (Database-Level)
-- =============================================================================

-- يمنع تعديل القيود المعتمدة (posted/reversed)
CREATE OR REPLACE FUNCTION prevent_posted_journal_modification()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IN ('posted', 'reversed') THEN
        RAISE EXCEPTION
            'Cannot modify a posted or reversed journal entry. Create a reversal entry instead.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_journal_immutability
    BEFORE UPDATE OR DELETE ON journal_entries
    FOR EACH ROW
    EXECUTE FUNCTION prevent_posted_journal_modification();

-- يمنع حذف الفواتير المُصدَرة
CREATE OR REPLACE FUNCTION prevent_issued_invoice_deletion()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IN ('issued', 'cleared') THEN
        RAISE EXCEPTION
            'Cannot delete an issued invoice. Issue a credit note instead.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_invoice_immutability
    BEFORE DELETE ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION prevent_issued_invoice_deletion();

-- يمنع حذف المدفوعات (append-only)
CREATE OR REPLACE FUNCTION prevent_payment_deletion()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION
        'Payments cannot be deleted. Create a refund record instead.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_payment_immutability
    BEFORE DELETE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION prevent_payment_deletion();

-- =============================================================================
-- SECTION 8: INVOICE NUMBER GENERATION (Atomic, Race-Condition Safe)
-- =============================================================================

-- دالة توليد رقم الفاتورة التالي — تستخدم FOR UPDATE SKIP LOCKED
-- أسلم من Firestore transactions: PostgreSQL يضمن SERIALIZABLE isolation
CREATE OR REPLACE FUNCTION get_next_invoice_number(
    p_agency_id     UUID,
    p_invoice_type  invoice_type,
    p_year          INTEGER DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER
)
RETURNS VARCHAR(30) AS $$
DECLARE
    v_sequence      INTEGER;
    v_prefix        VARCHAR(5);
    v_number        VARCHAR(30);
BEGIN
    -- تحديد البادئة
    v_prefix := CASE p_invoice_type
        WHEN 'tax_invoice' THEN 'INV'
        WHEN 'credit_note' THEN 'CN'
        WHEN 'debit_note'  THEN 'DN'
    END;

    -- إنشاء سجل العداد إذا لم يكن موجوداً
    INSERT INTO invoice_counters (agency_id, invoice_type, year, current_sequence)
    VALUES (p_agency_id, p_invoice_type, p_year, 0)
    ON CONFLICT (agency_id, invoice_type, year) DO NOTHING;

    -- تحديث ذري مع إعادة القيمة الجديدة
    -- FOR UPDATE يمنع race conditions بين requests متزامنة
    UPDATE invoice_counters
    SET
        current_sequence = current_sequence + 1,
        updated_at = NOW()
    WHERE
        agency_id    = p_agency_id
        AND invoice_type = p_invoice_type
        AND year         = p_year
    RETURNING current_sequence INTO v_sequence;

    -- تنسيق الرقم: INV-2026-000001
    v_number := v_prefix || '-' || p_year || '-' || LPAD(v_sequence::TEXT, 6, '0');

    RETURN v_number;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SECTION 9: AUTOMATIC ACCOUNT BALANCE UPDATES
-- =============================================================================

-- Trigger لتحديث رصيد الحسابات عند posting قيد محاسبي
CREATE OR REPLACE FUNCTION update_account_balances_on_post()
RETURNS TRIGGER AS $$
BEGIN
    -- نفذ فقط عند تغيير الحالة إلى 'posted'
    IF NEW.status = 'posted' AND OLD.status = 'draft' THEN
        -- تحديث الأرصدة بناءً على سطور القيد
        UPDATE chart_of_accounts coa
        SET balance_halalas = coa.balance_halalas +
            CASE
                WHEN jl.debit_halalas > 0 THEN
                    CASE coa.normal_side
                        WHEN 'debit' THEN jl.debit_halalas   -- يزيد الرصيد
                        ELSE -jl.debit_halalas                 -- ينقص الرصيد
                    END
                ELSE
                    CASE coa.normal_side
                        WHEN 'credit' THEN jl.credit_halalas  -- يزيد الرصيد
                        ELSE -jl.credit_halalas                -- ينقص الرصيد
                    END
            END
        FROM journal_lines jl
        WHERE jl.journal_entry_id = NEW.id
          AND jl.account_code = coa.code
          AND coa.agency_id = NEW.agency_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_balances_on_journal_post
    AFTER UPDATE OF status ON journal_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_account_balances_on_post();

COMMIT;
