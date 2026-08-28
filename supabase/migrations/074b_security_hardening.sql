-- 074b: Security hardening before payroll and employee-record activation.
-- (numbered 074b on cleanup: written after 074a, which already held 074)
--
-- This migration deliberately does not create payroll records. It protects the
-- existing operational app first, moves signing/PIN credentials away from the
-- broadly-readable user profile, and removes self-service privilege escalation.
-- Take a database backup and run supabase/audits/payroll-schema-baseline.sql
-- against the target project before applying any payroll schema migration.

-- Fail before any mutation if this is not the live LCM Finance schema.
DO $$
BEGIN
  IF to_regclass('public.user_roles') IS NULL
     OR to_regclass('public.pvs') IS NULL
     OR to_regclass('public.notifications') IS NULL
     OR to_regclass('public.loan_applications') IS NULL THEN
    RAISE EXCEPTION '074 security hardening requires user_roles, pvs, notifications, and loan_applications in public';
  END IF;
END $$;

-- ── Private credentials and signatures ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_security_credentials (
  email             TEXT PRIMARY KEY REFERENCES public.user_roles(email) ON DELETE CASCADE,
  pin_hash          TEXT,
  has_pin           BOOLEAN NOT NULL DEFAULT FALSE,
  saved_signatures  JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_security_credentials_signatures_object
    CHECK (jsonb_typeof(saved_signatures) = 'object')
);

ALTER TABLE public.user_security_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_security_credentials FROM anon, authenticated;
GRANT ALL ON TABLE public.user_security_credentials TO service_role;

DROP POLICY IF EXISTS "security_credentials_service_only" ON public.user_security_credentials;
CREATE POLICY "security_credentials_service_only"
  ON public.user_security_credentials
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Preserve legacy credentials before clearing their old public-profile columns.
INSERT INTO public.user_security_credentials (email, pin_hash, has_pin, saved_signatures, updated_at)
SELECT
  ur.email,
  NULLIF(ur.pin_hash, ''),
  COALESCE(ur.has_pin, false),
  COALESCE(ur.saved_signatures, '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(ur.role, NULLIF(ur.saved_signature, ''))),
  NOW()
FROM public.user_roles ur
ON CONFLICT (email) DO UPDATE SET
  pin_hash = COALESCE(public.user_security_credentials.pin_hash, EXCLUDED.pin_hash),
  has_pin = public.user_security_credentials.has_pin OR EXCLUDED.has_pin,
  saved_signatures = COALESCE(public.user_security_credentials.saved_signatures, '{}'::jsonb)
    || COALESCE(EXCLUDED.saved_signatures, '{}'::jsonb),
  updated_at = NOW();

-- Preserve signatures attached to historic approvals before hiding profile defaults.
UPDATE public.pvs p
SET approvals = (
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN COALESCE(approval->>'signature_data', '') = ''
       AND credentials.saved_signatures ? COALESCE(approval->>'role', '')
      THEN jsonb_set(
        approval,
        '{signature_data}',
        credentials.saved_signatures -> (approval->>'role'),
        true
      )
      ELSE approval
    END
  ), '[]'::jsonb)
  FROM jsonb_array_elements(COALESCE(p.approvals, '[]'::jsonb)) AS approval
  LEFT JOIN public.user_security_credentials credentials
    ON credentials.email = approval->>'email'
)
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements(COALESCE(p.approvals, '[]'::jsonb)) AS approval
  JOIN public.user_security_credentials credentials
    ON credentials.email = approval->>'email'
  WHERE COALESCE(approval->>'signature_data', '') = ''
    AND credentials.saved_signatures ? COALESCE(approval->>'role', '')
);

-- The profile table can remain a directory, but must not retain credentials.
UPDATE public.user_roles
SET pin_hash = NULL,
    has_pin = false,
    saved_signature = NULL,
    saved_signatures = '{}'::jsonb,
    signature_url = NULL,
    signature_path = NULL;

-- Historic public signature links should no longer resolve. New e-signatures are
-- held in the credential vault and copied into the immutable approval record.
UPDATE storage.buckets SET public = false WHERE id = 'signatures';
DROP POLICY IF EXISTS "sig_read" ON storage.objects;
DROP POLICY IF EXISTS "sig_upload" ON storage.objects;

-- Users may no longer update arbitrary fields on their own profile. In
-- particular, this prevents direct changes to role, ministries, authorisation,
-- or historic signature/PIN columns through PostgREST.
DROP POLICY IF EXISTS "user_roles_own_update" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_own_insert" ON public.user_roles;

-- Returns only the caller's credentials; no browser query may read another
-- person's PIN or reusable signature.
CREATE OR REPLACE FUNCTION public.get_my_security_context()
RETURNS TABLE (
  role TEXT,
  ministries TEXT[],
  has_pin BOOLEAN,
  saved_signatures JSONB
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ur.role,
    ur.ministries,
    COALESCE(credentials.has_pin, false),
    COALESCE(credentials.saved_signatures, '{}'::jsonb)
  FROM public.user_roles ur
  LEFT JOIN public.user_security_credentials credentials ON credentials.email = ur.email
  WHERE ur.email = (auth.jwt() ->> 'email');
$$;

REVOKE ALL ON FUNCTION public.get_my_security_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_security_context() TO authenticated;

CREATE OR REPLACE FUNCTION public.save_my_role_signature(
  signature_role TEXT,
  signature_data TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_email TEXT;
  caller_role TEXT;
BEGIN
  caller_email := auth.jwt() ->> 'email';
  IF caller_email IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF signature_data IS NULL OR length(signature_data) < 32 OR length(signature_data) > 1500000 THEN
    RAISE EXCEPTION 'Invalid signature data';
  END IF;

  SELECT role INTO caller_role FROM public.user_roles WHERE email = caller_email;
  IF caller_role IS NULL OR caller_role <> signature_role THEN
    RAISE EXCEPTION 'You can only save a signature for your active role';
  END IF;

  INSERT INTO public.user_security_credentials (email, saved_signatures, updated_at)
  VALUES (caller_email, jsonb_build_object(signature_role, signature_data), NOW())
  ON CONFLICT (email) DO UPDATE SET
    saved_signatures = COALESCE(public.user_security_credentials.saved_signatures, '{}'::jsonb)
      || jsonb_build_object(signature_role, signature_data),
    updated_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.save_my_role_signature(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_my_role_signature(TEXT, TEXT) TO authenticated;

-- ── Controlled role switching ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.role_switch_grants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email  TEXT NOT NULL REFERENCES public.user_roles(email) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN (
    'FINANCE_ADMIN','FINANCE_ADMIN_2','FINANCE_ADMIN_3',
    'GENERAL_MANAGER','BISHOP','TREASURER','SECRETARY',
    'MINISTRY_HEAD','BUILDING_MANAGER','STAFF'
  )),
  ministries  TEXT[] NOT NULL DEFAULT '{}',
  expires_at  TIMESTAMPTZ,
  granted_by  TEXT NOT NULL DEFAULT '',
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_email, role)
);

ALTER TABLE public.role_switch_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "role_switch_grants_own_read" ON public.role_switch_grants;
CREATE POLICY "role_switch_grants_own_read" ON public.role_switch_grants
  FOR SELECT TO authenticated
  USING (user_email = (auth.jwt() ->> 'email') OR is_finance_admin_or_senior());
DROP POLICY IF EXISTS "role_switch_grants_admin_manage" ON public.role_switch_grants;
CREATE POLICY "role_switch_grants_admin_manage" ON public.role_switch_grants
  FOR ALL TO authenticated
  USING (is_finance_admin_or_senior()) WITH CHECK (is_finance_admin_or_senior());

CREATE OR REPLACE FUNCTION public.switch_own_role(
  new_role TEXT,
  new_ministries TEXT[] DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_email TEXT;
  permitted_ministries TEXT[];
BEGIN
  caller_email := auth.jwt() ->> 'email';
  IF caller_email IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT grants.ministries INTO permitted_ministries
  FROM public.role_switch_grants grants
  WHERE grants.user_email = caller_email
    AND grants.role = new_role
    AND (grants.expires_at IS NULL OR grants.expires_at > NOW());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active role-switch grant for %', new_role;
  END IF;

  IF new_role = 'MINISTRY_HEAD'
     AND cardinality(new_ministries) > 0
     AND NOT (new_ministries <@ permitted_ministries) THEN
    RAISE EXCEPTION 'Ministry selection is outside your role-switch grant';
  END IF;

  UPDATE public.user_roles
  SET role = new_role,
      ministries = CASE WHEN new_role = 'MINISTRY_HEAD' THEN new_ministries ELSE '{}'::text[] END,
      updated_at = NOW()
  WHERE email = caller_email;
END;
$$;

REVOKE ALL ON FUNCTION public.switch_own_role(TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.switch_own_role(TEXT, TEXT[]) TO authenticated;

-- ── Loan application safety boundary ────────────────────────────────────────
-- Applicants can no longer alter amount, status, approval links, or notes after
-- submission. The dedicated withdrawal RPC is the only applicant-side update.
DROP POLICY IF EXISTS "lapp_update" ON public.loan_applications;
DROP POLICY IF EXISTS "lapp_update_senior" ON public.loan_applications;
CREATE POLICY "lapp_update_senior" ON public.loan_applications
  FOR UPDATE TO authenticated
  USING (is_finance_admin_or_senior()) WITH CHECK (is_finance_admin_or_senior());

CREATE OR REPLACE FUNCTION public.withdraw_my_loan_application(application_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.loan_applications
  SET status = 'CANCELLED', updated_at = NOW()
  WHERE id = application_id
    AND applicant_email = (auth.jwt() ->> 'email')
    AND status IN ('PENDING', 'UNDER_REVIEW');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan application cannot be withdrawn';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_my_loan_application(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.withdraw_my_loan_application(UUID) TO authenticated;

-- Notification messages must originate from an authorised server action.
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert_self" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (recipient_email = (auth.jwt() ->> 'email'));
