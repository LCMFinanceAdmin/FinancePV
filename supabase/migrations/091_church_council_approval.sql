-- 091: Church council President on the pastoral leave chain.
--
-- The council President approves leave for every pastor attached to their
-- congregation, alongside the head pastor / Dean — all of them must approve
-- before the leave is granted.
--
-- The President is NOT a system user: council office is temporary and they are
-- not involved with LCM otherwise. So they are held as a name and email on the
-- congregation, and they act through a single-use signed link rather than an
-- account. That is why leave_approval_tokens exists.

-- ── Council President, per congregation ────────────────────────────────────
ALTER TABLE congregations
  ADD COLUMN IF NOT EXISTS council_president_name  TEXT,
  ADD COLUMN IF NOT EXISTS council_president_email TEXT;

-- ── Single-use approval links for people without an account ────────────────
CREATE TABLE IF NOT EXISTS leave_approval_tokens (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_id       UUID NOT NULL REFERENCES leave_applications(id) ON DELETE CASCADE,
  approver_email TEXT NOT NULL,
  approver_name  TEXT NOT NULL DEFAULT '',
  token          TEXT NOT NULL UNIQUE,
  expires_at     TIMESTAMPTZ NOT NULL,
  -- Set the moment the link is acted on, so a forwarded email can't be replayed.
  used_at        TIMESTAMPTZ,
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lat_leave ON leave_approval_tokens(leave_id);
CREATE INDEX IF NOT EXISTS idx_lat_token ON leave_approval_tokens(token);

ALTER TABLE leave_approval_tokens ENABLE ROW LEVEL SECURITY;

-- Deliberately NO select policy for signed-in users. The token is the whole
-- credential — if an applicant could read their own token they could approve
-- their own leave as the President. The edge function reads it with the
-- service role, which bypasses RLS.
DROP POLICY IF EXISTS "lat_insert_own" ON leave_approval_tokens;
CREATE POLICY "lat_insert_own" ON leave_approval_tokens
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM leave_applications la
    WHERE la.id = leave_id
      AND la.applicant_email = (auth.jwt() ->> 'email')
  ));

GRANT INSERT ON leave_approval_tokens TO authenticated;
