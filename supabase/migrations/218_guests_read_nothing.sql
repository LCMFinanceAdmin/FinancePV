-- 218: a guest reads the church's structure and their own claim. Nothing else.
--
-- Fifty-one policies in this database say `USING (true)` for `authenticated`:
-- any account that can sign in may read the whole table. That has been livable
-- because every account belonged to somebody inside the church — staff, EXCO,
-- an officer. The Guest role in 217 breaks that assumption on purpose: a guest
-- is a volunteer, a vendor, somebody owed money and nothing more.
--
-- Without this migration, handing somebody Guest would also hand them:
--
--   bank_accounts, bank_statements    the church's banking
--   fd_certificates, fd_withdrawals   the fixed deposits
--   income_records                    what the church receives
--   purchase_requests                 every request, including payee_bank_acct
--   employee_documents                documents held on employees
--   gm_claims, budget_proposals       claims and budgets across every ministry
--   worker_worksheets                 what casual workers are paid
--   organisation_contacts,
--   congregation_council_members      contact details for named people
--
-- Salaries, IC numbers, loans and the people directory were already scoped and
-- are untouched here — see 099 and the payroll migrations.
--
-- The fix is deliberately the smallest one that works: every open policy gains
-- `AND NOT is_guest()`. No existing role's access changes by a single row,
-- because no existing account is a guest. The broader question — whether
-- "anybody signed in" is the right audience for the church's bank statements
-- at all — is left alone here. It deserves its own pass, with the people who
-- use those screens, rather than being smuggled in behind a new role.

-- ── Who is a guest ─────────────────────────────────────────────────────────
-- SECURITY DEFINER because it is evaluated inside policies on other tables and
-- must read user_roles, which has policies of its own. STABLE so the planner
-- evaluates it once per statement rather than once per row.
CREATE OR REPLACE FUNCTION is_guest()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE lower(ur.email) = lower(auth.jwt() ->> 'email')
      AND ur.role = 'GUEST'
  );
$$;

REVOKE EXECUTE ON FUNCTION is_guest() FROM PUBLIC, anon;
-- authenticated evaluates it inside the policies below; service_role because
-- the edge functions query these tables on a user's behalf.
GRANT EXECUTE ON FUNCTION is_guest() TO authenticated, service_role;

-- ── Their own claim, and only their own ────────────────────────────────────
-- The tracker page already filters by submitted_by_email; this makes the
-- filter a rule rather than a courtesy.
ALTER POLICY "pr_select" ON purchase_requests
  USING (NOT is_guest() OR lower(submitted_by_email) = lower(auth.jwt() ->> 'email'));

-- ── Closed to guests ───────────────────────────────────────────────────────
ALTER POLICY "bam_workers_all"        ON bam_workers                   USING (NOT is_guest());
ALTER POLICY "bank_read"              ON bank_accounts                 USING (NOT is_guest());
ALTER POLICY "bs_select"              ON bank_statements               USING (NOT is_guest());
ALTER POLICY "budget_proposals_read"  ON budget_proposals              USING (NOT is_guest());
ALTER POLICY "cd_read"                ON claim_documents               USING (NOT is_guest());
ALTER POLICY "ce_read"                ON claim_entitlements            USING (NOT is_guest());
ALTER POLICY "council_read"           ON congregation_council_members  USING (NOT is_guest());
ALTER POLICY "edoc_select"            ON employee_documents            USING (NOT is_guest());
ALTER POLICY "extchurch_read"         ON external_churches             USING (NOT is_guest());
ALTER POLICY "fblk_select"            ON facility_blocks               USING (NOT is_guest());
ALTER POLICY "fb_select"              ON facility_bookings             USING (NOT is_guest());
ALTER POLICY "fr_select"              ON facility_rates                USING (NOT is_guest());
ALTER POLICY "fdc_select"             ON fd_certificates               USING (NOT is_guest());
ALTER POLICY "fdw_select"             ON fd_withdrawals                USING (NOT is_guest());
ALTER POLICY "gm_claims_read"         ON gm_claims                     USING (NOT is_guest());
ALTER POLICY "gm_committees_read"     ON gm_committees                 USING (NOT is_guest());
ALTER POLICY "ir_select"              ON income_records                USING (NOT is_guest());
ALTER POLICY "laa_read"               ON leave_approver_assignments    USING (NOT is_guest());
ALTER POLICY "mv_read"                ON ministry_verifiers            USING (NOT is_guest());
ALTER POLICY "orgcontact_read"        ON organisation_contacts         USING (NOT is_guest());
ALTER POLICY "org_read"               ON organisations                 USING (NOT is_guest());
ALTER POLICY "pri_read"               ON payment_ref_issues            USING (NOT is_guest());
ALTER POLICY "prs_read"               ON payment_ref_series            USING (NOT is_guest());
ALTER POLICY "contrib_bands_read"     ON payroll_contribution_bands    USING (NOT is_guest());
ALTER POLICY "custom_items_all"       ON payroll_employee_custom_items USING (NOT is_guest());
ALTER POLICY "emp_custom_items_all"   ON payroll_employee_custom_items USING (NOT is_guest());
ALTER POLICY "pemployer_read"         ON payroll_employers             USING (NOT is_guest());
ALTER POLICY "custom_amounts_all"     ON payroll_run_custom_amounts    USING (NOT is_guest());
ALTER POLICY "custom_defs_all"        ON payroll_run_custom_defs       USING (NOT is_guest());
ALTER POLICY "psr_read"               ON payroll_statutory_rates       USING (NOT is_guest());
ALTER POLICY "pc_read"                ON person_congregations          USING (NOT is_guest());
ALTER POLICY "pvpool_read"            ON pv_number_pool                USING (NOT is_guest());
ALTER POLICY "Authenticated users can read recurring_expenses"
                                      ON recurring_expenses            USING (NOT is_guest());
ALTER POLICY "recurring_folders_read" ON recurring_folders             USING (NOT is_guest());
ALTER POLICY "recurring_runs_read"    ON recurring_runs                USING (NOT is_guest());
ALTER POLICY "ws_select"              ON worker_worksheets             USING (NOT is_guest());

-- ── Left open, deliberately ────────────────────────────────────────────────
-- app_roles                      role labels; the app layout reads it to name
--                                the role in the sidebar
-- districts, congregations,
-- offices, office_holdings,
-- office_categories              the church's structure — exactly what the two
--                                guest pages show, so closing it would be
--                                closing the front door and leaving the window
-- ministry_projects, claim_types the pickers on the request form
-- document_kinds, document_sources,
-- organisation_kinds, service_types,
-- leave_types,
-- leave_entitlement_bands        lookup tables holding no person and no money
--
-- Nothing above names an individual or carries an amount. If a column is ever
-- added to one of them that does, it belongs on the list above instead.
