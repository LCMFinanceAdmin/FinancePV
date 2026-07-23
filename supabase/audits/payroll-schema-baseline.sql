-- Read-only payroll and migration baseline.
-- Run this in the target Supabase SQL editor before applying payroll schema.
-- It reads metadata only and does not expose employee, payroll, or bank values.

WITH required_tables(table_name) AS (
  VALUES
    ('user_roles'),
    ('loan_applications'),
    ('payroll_employees'),
    ('employee_loans'),
    ('loan_repayments'),
    ('payroll_runs'),
    ('payroll_run_items'),
    ('payslips'),
    ('employee_documents'),
    ('employee_correspondence'),
    ('payroll_exports')
)
SELECT
  table_name,
  CASE WHEN to_regclass('public.' || table_name) IS NULL THEN 'MISSING' ELSE 'PRESENT' END AS status
FROM required_tables
ORDER BY table_name;

-- Confirms the foreign-key prerequisite that migration 073 assumes.
SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = to_regclass('public.loan_applications')
  AND contype = 'f';

-- Lists which credential/profile columns still exist after hardening.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_roles'
ORDER BY ordinal_position;

-- RLS policies relevant to payroll, loans, profiles, and notifications.
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'user_roles', 'user_security_credentials', 'role_switch_grants',
    'loan_applications', 'employee_loans', 'loan_repayments',
    'payroll_employees', 'payroll_runs', 'payroll_run_items',
    'employee_documents', 'payroll_exports', 'notifications'
  )
ORDER BY tablename, policyname;

-- Confirms the privacy posture of existing storage buckets.
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id IN (
  'signatures', 'payment-receipts', 'pv-attachments',
  'gm-claim-attachments', 'employee-documents', 'payroll-exports'
)
ORDER BY id;

-- Confirms whether migration history is queryable in this environment. Read
-- individual entries from Supabase Dashboard > Database > Migrations; that
-- avoids relying on privileged system-schema access from the SQL editor.
SELECT to_regclass('supabase_migrations.schema_migrations') AS migration_history_relation;
