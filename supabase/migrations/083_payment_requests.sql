-- 083: Payment Requests — align the request chain with the church constitution.
--
-- Ministerial expenses must be verified by the ministry's own standing
-- committee (EXCO) BEFORE reaching the finance desk, then approved by the
-- General Manager, who instructs the Finance Executive to raise the PV.
--
-- Previously a request went SUBMITTED -> APPROVED as soon as the GM *or any
-- single signatory* (Bishop/Treasurer/Secretary) acted, with no EXCO step at
-- all. The lifecycle is now:
--
--   SUBMITTED -> EXCO_VERIFIED -> GM_APPROVED -> PV_RAISED   (or REJECTED)
--
-- The table keeps its name (purchase_requests) so existing rows, indexes and
-- foreign keys survive; the UI is renamed to "Payment Requests".

-- ── Request columns: mirror the PV form so Finance never re-keys ────────────
ALTER TABLE purchase_requests
  -- Payment details
  ADD COLUMN IF NOT EXISTS payee_name          TEXT,
  ADD COLUMN IF NOT EXISTS payee_bank_name     TEXT,
  ADD COLUMN IF NOT EXISTS payee_bank_acct     TEXT,
  ADD COLUMN IF NOT EXISTS payment_method      TEXT DEFAULT 'Bank Transfer',
  ADD COLUMN IF NOT EXISTS jompay_biller_code  TEXT,
  ADD COLUMN IF NOT EXISTS jompay_ref          TEXT,
  -- Which budget line this falls under, so GM/Treasurer can see at decision
  -- time whether the spend is budgeted or outside the approved budget.
  ADD COLUMN IF NOT EXISTS budget_item_id      UUID REFERENCES budget_items(id) ON DELETE SET NULL,
  -- Recurring commitments: approved once, then added to the recurring library
  -- for the rest of the stated term.
  ADD COLUMN IF NOT EXISTS is_recurring        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_frequency TEXT,
  ADD COLUMN IF NOT EXISTS recurrence_start    DATE,
  ADD COLUMN IF NOT EXISTS recurrence_end      DATE,
  ADD COLUMN IF NOT EXISTS recurring_pv_id     UUID REFERENCES recurring_pvs(id) ON DELETE SET NULL,
  -- PV-form parity
  ADD COLUMN IF NOT EXISTS payment_type        TEXT DEFAULT 'GENERAL',
  ADD COLUMN IF NOT EXISTS is_fixed_asset      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS asset_description   TEXT,
  ADD COLUMN IF NOT EXISTS dept                TEXT,
  ADD COLUMN IF NOT EXISTS applicant_signature TEXT,
  -- Stage audit. exco_signature is carried onto the PV so the printed voucher
  -- shows the ministry EXCO's signature as proof of verification.
  ADD COLUMN IF NOT EXISTS exco_verified_by    TEXT,
  ADD COLUMN IF NOT EXISTS exco_verified_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exco_signature      TEXT,
  ADD COLUMN IF NOT EXISTS gm_approved_by      TEXT,
  ADD COLUMN IF NOT EXISTS gm_approved_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gm_claim_id         UUID REFERENCES gm_claims(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pr_budget_item ON purchase_requests(budget_item_id);
CREATE INDEX IF NOT EXISTS idx_pr_gm_claim    ON purchase_requests(gm_claim_id);

-- ── Backfill so in-flight rows are not stranded mid-chain ──────────────────
-- Legacy APPROVED meant "a signatory approved it, Finance may raise a PV",
-- which is exactly the new GM_APPROVED stage.
UPDATE purchase_requests SET status = 'GM_APPROVED' WHERE status = 'APPROVED';

-- Constraint added only after the backfill, so it can never reject live data.
ALTER TABLE purchase_requests DROP CONSTRAINT IF EXISTS purchase_requests_status_check;
ALTER TABLE purchase_requests ADD CONSTRAINT purchase_requests_status_check
  CHECK (status IN ('SUBMITTED','EXCO_VERIFIED','GM_APPROVED','PV_RAISED','REJECTED','CANCELLED'));

-- ── RLS: close the blanket-update hole ─────────────────────────────────────
-- 011_purchase_requests.sql granted UPDATE to every authenticated user with
-- USING (true), so any logged-in member could set their own request straight
-- to APPROVED and skip the entire approval chain. Stage transitions now happen
-- exclusively in the submit-pr / pr-action edge functions, which use the
-- service role and bypass RLS. Applicants may still correct their own request
-- while it is untouched (SUBMITTED).
ALTER TABLE purchase_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pr_select" ON purchase_requests;
CREATE POLICY "pr_select" ON purchase_requests
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "pr_insert" ON purchase_requests;
CREATE POLICY "pr_insert" ON purchase_requests
  FOR INSERT TO authenticated
  WITH CHECK (submitted_by_email = (auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "pr_update" ON purchase_requests;
CREATE POLICY "pr_update_own_while_submitted" ON purchase_requests
  FOR UPDATE TO authenticated
  USING (submitted_by_email = (auth.jwt() ->> 'email') AND status = 'SUBMITTED')
  WITH CHECK (submitted_by_email = (auth.jwt() ->> 'email') AND status = 'SUBMITTED');

DROP POLICY IF EXISTS "pr_delete_own_while_submitted" ON purchase_requests;
CREATE POLICY "pr_delete_own_while_submitted" ON purchase_requests
  FOR DELETE TO authenticated
  USING (submitted_by_email = (auth.jwt() ->> 'email') AND status = 'SUBMITTED');

-- ── GM Claims: populated automatically when the GM approves a request ──────
-- gm_claims already carries claimant, ministry, project, amount, purpose,
-- description, line_items, attachments, payee_bank and payee_bank_acct, so it
-- only needs the link back to the request plus the EXCO verification proof.
ALTER TABLE gm_claims
  ADD COLUMN IF NOT EXISTS request_id       UUID REFERENCES purchase_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS exco_signature   TEXT,
  ADD COLUMN IF NOT EXISTS exco_verified_by TEXT,
  ADD COLUMN IF NOT EXISTS exco_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gm_approved_by   TEXT;

CREATE INDEX IF NOT EXISTS idx_gm_claims_request ON gm_claims(request_id);
