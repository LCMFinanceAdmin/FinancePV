-- 076: Payroll — append-only audit log for confidential operations.
-- Run manually in the Supabase dashboard SQL editor.

CREATE TABLE payroll_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action      TEXT NOT NULL,
  -- EMPLOYEE_CREATED | EMPLOYEE_UPDATED | EMPLOYEE_DELETED | SALARY_CHANGE
  -- DOC_UPLOAD | DOC_UPDATE | DOC_DELETE
  -- LOAN_APPLIED | LOAN_SIGNED | LOAN_REJECTED | LOAN_APPROVED_LEGACY
  -- RUN_FINALIZED | VOUCHER_PAID | BANK_EXPORT | PAYSLIPS_SENT
  entity      TEXT NOT NULL DEFAULT '',   -- human-readable target (name, loan no, period)
  employee_id UUID,                       -- optional link to payroll_employees
  detail      TEXT NOT NULL DEFAULT '',
  actor       TEXT NOT NULL DEFAULT '',   -- email of the signed-in user
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pal_created ON payroll_audit_log(created_at DESC);
CREATE INDEX idx_pal_action ON payroll_audit_log(action);
CREATE INDEX idx_pal_employee ON payroll_audit_log(employee_id) WHERE employee_id IS NOT NULL;

-- Append-only: SELECT and INSERT for authenticated users; no UPDATE or DELETE
-- policies are created, so rows can never be modified or removed via the API.
ALTER TABLE payroll_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pal_select" ON payroll_audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "pal_insert" ON payroll_audit_log FOR INSERT TO authenticated WITH CHECK (true);
