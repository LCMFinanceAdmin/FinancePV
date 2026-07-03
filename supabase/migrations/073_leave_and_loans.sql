-- 073: Staff self-service — Leave management + EPL loan applications

-- ── Staff category for leave approval routing ──────────────────────────────
ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS staff_category TEXT NOT NULL DEFAULT 'GENERAL'
    CHECK (staff_category IN ('GENERAL','PASTOR','PASTOR_IN_CHARGE','DEAN_OF_DISTRICT'));

-- ── Leave types (configurable) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_types (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  days_per_year DECIMAL(4,1) NOT NULL DEFAULT 0,
  is_replacement BOOLEAN NOT NULL DEFAULT FALSE,
  requires_doc  BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order    INT NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO leave_types (code, name, days_per_year, is_replacement, requires_doc, sort_order) VALUES
  ('ANNUAL',      'Annual Leave',     14,   FALSE, FALSE, 1),
  ('MEDICAL',     'Medical Leave',    14,   FALSE, TRUE,  2),
  ('EMERGENCY',   'Emergency Leave',   3,   FALSE, FALSE, 3),
  ('MATERNITY',   'Maternity Leave',  98,   FALSE, TRUE,  4),
  ('PATERNITY',   'Paternity Leave',   7,   FALSE, FALSE, 5),
  ('REPLACEMENT', 'Replacement Leave', 0,   TRUE,  FALSE, 6)
ON CONFLICT (code) DO NOTHING;

-- ── Custom leave approver assignments (overrides GM + Bishop default) ───────
-- Finance Admin sets these for pastoral staff whose approvers differ.
CREATE TABLE IF NOT EXISTS leave_approver_assignments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_email TEXT NOT NULL,
  approver_email TEXT NOT NULL,
  approver_name  TEXT NOT NULL DEFAULT '',
  sort_order     INT NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (employee_email, approver_email)
);

-- ── Leave applications ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_applications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_no            TEXT UNIQUE NOT NULL,
  applicant_email     TEXT NOT NULL,
  applicant_name      TEXT NOT NULL,
  leave_type_code     TEXT NOT NULL REFERENCES leave_types(code) ON UPDATE CASCADE,
  start_date          DATE NOT NULL,
  end_date            DATE NOT NULL,
  days                DECIMAL(4,1) NOT NULL,
  reason              TEXT NOT NULL DEFAULT '',
  attachment_url      TEXT,
  status              TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  -- [{email, name}] — resolved at submit time from assignments or GM+Bishop default
  required_approvers  JSONB NOT NULL DEFAULT '[]',
  -- [{email, name, action, timestamp, remarks}]
  approvals           JSONB NOT NULL DEFAULT '[]',
  applied_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_la_applicant ON leave_applications(applicant_email);
CREATE INDEX IF NOT EXISTS idx_la_status    ON leave_applications(status);
CREATE INDEX IF NOT EXISTS idx_la_dates     ON leave_applications(start_date, end_date);

-- ── Replacement days earned (overtime / working on days off) ───────────────
CREATE TABLE IF NOT EXISTS replacement_days_earned (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_email    TEXT NOT NULL,
  employee_name     TEXT NOT NULL DEFAULT '',
  work_date         DATE NOT NULL,
  days              DECIMAL(4,1) NOT NULL DEFAULT 1.0,
  reason            TEXT NOT NULL DEFAULT '',
  approved_by_email TEXT,
  approved_by_name  TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (employee_email, work_date)
);

CREATE INDEX IF NOT EXISTS idx_rde_email ON replacement_days_earned(employee_email);

-- ── Self-service EPL loan applications ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS loan_applications (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_app_no          TEXT UNIQUE NOT NULL,  -- LA-2026-001
  applicant_email      TEXT NOT NULL,
  applicant_name       TEXT NOT NULL,
  amount               DECIMAL(12,2) NOT NULL,
  purpose              TEXT NOT NULL,
  requested_term_months INT NOT NULL DEFAULT 12,
  status               TEXT NOT NULL DEFAULT 'PENDING'
                         CHECK (status IN ('PENDING','UNDER_REVIEW','APPROVED','REJECTED','CANCELLED')),
  admin_notes          TEXT NOT NULL DEFAULT '',
  -- once Finance Admin creates the payroll loan record, link it here
  approved_loan_id     UUID REFERENCES employee_loans(id) ON DELETE SET NULL,
  applied_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lapp_email  ON loan_applications(applicant_email);
CREATE INDEX IF NOT EXISTS idx_lapp_status ON loan_applications(status);

-- ── Sequence helpers ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION next_leave_no()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  yr     TEXT := EXTRACT(YEAR FROM NOW())::TEXT;
  prefix TEXT := 'LV-' || yr || '-';
  last   INT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(leave_no FROM LENGTH(prefix)+1) AS INT)), 0)
    INTO last FROM leave_applications WHERE leave_no LIKE prefix || '%';
  RETURN prefix || LPAD((last + 1)::TEXT, 3, '0');
END;
$$;

CREATE OR REPLACE FUNCTION next_loan_app_no()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  yr     TEXT := EXTRACT(YEAR FROM NOW())::TEXT;
  prefix TEXT := 'LA-' || yr || '-';
  last   INT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(loan_app_no FROM LENGTH(prefix)+1) AS INT)), 0)
    INTO last FROM loan_applications WHERE loan_app_no LIKE prefix || '%';
  RETURN prefix || LPAD((last + 1)::TEXT, 3, '0');
END;
$$;

-- ── RLS ───────────────────────────────────────────────────────────────────

-- leave_types: anyone can read
ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lt_read" ON leave_types;
CREATE POLICY "lt_read" ON leave_types FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "lt_write" ON leave_types;
CREATE POLICY "lt_write" ON leave_types FOR ALL TO authenticated
  USING (is_finance_admin_or_senior()) WITH CHECK (is_finance_admin_or_senior());

-- leave_approver_assignments: anyone can read, Finance Admin manages
ALTER TABLE leave_approver_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "laa_read" ON leave_approver_assignments;
CREATE POLICY "laa_read" ON leave_approver_assignments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "laa_write" ON leave_approver_assignments;
CREATE POLICY "laa_write" ON leave_approver_assignments FOR ALL TO authenticated
  USING (is_finance_admin_or_senior()) WITH CHECK (is_finance_admin_or_senior());

-- leave_applications: own read/insert + approver read + admin full access
ALTER TABLE leave_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "la_read" ON leave_applications;
CREATE POLICY "la_read" ON leave_applications FOR SELECT TO authenticated
  USING (
    applicant_email = (auth.jwt() ->> 'email')
    OR is_finance_admin_or_senior()
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(required_approvers) AS ra
      WHERE ra->>'email' = (auth.jwt() ->> 'email')
    )
  );
DROP POLICY IF EXISTS "la_insert" ON leave_applications;
CREATE POLICY "la_insert" ON leave_applications FOR INSERT TO authenticated
  WITH CHECK (applicant_email = (auth.jwt() ->> 'email'));
DROP POLICY IF EXISTS "la_update" ON leave_applications;
CREATE POLICY "la_update" ON leave_applications FOR UPDATE TO authenticated
  USING (
    applicant_email = (auth.jwt() ->> 'email')
    OR is_finance_admin_or_senior()
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(required_approvers) AS ra
      WHERE ra->>'email' = (auth.jwt() ->> 'email')
    )
  );

-- replacement_days_earned: own read, Finance Admin manages
ALTER TABLE replacement_days_earned ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rde_read" ON replacement_days_earned;
CREATE POLICY "rde_read" ON replacement_days_earned FOR SELECT TO authenticated
  USING (employee_email = (auth.jwt() ->> 'email') OR is_finance_admin_or_senior());
DROP POLICY IF EXISTS "rde_write" ON replacement_days_earned;
CREATE POLICY "rde_write" ON replacement_days_earned FOR ALL TO authenticated
  USING (is_finance_admin_or_senior()) WITH CHECK (is_finance_admin_or_senior());

-- loan_applications: own read/insert, Finance Admin manages
ALTER TABLE loan_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lapp_read" ON loan_applications;
CREATE POLICY "lapp_read" ON loan_applications FOR SELECT TO authenticated
  USING (applicant_email = (auth.jwt() ->> 'email') OR is_finance_admin_or_senior());
DROP POLICY IF EXISTS "lapp_insert" ON loan_applications;
CREATE POLICY "lapp_insert" ON loan_applications FOR INSERT TO authenticated
  WITH CHECK (applicant_email = (auth.jwt() ->> 'email'));
DROP POLICY IF EXISTS "lapp_update" ON loan_applications;
CREATE POLICY "lapp_update" ON loan_applications FOR UPDATE TO authenticated
  USING (
    applicant_email = (auth.jwt() ->> 'email')
    OR is_finance_admin_or_senior()
  );
