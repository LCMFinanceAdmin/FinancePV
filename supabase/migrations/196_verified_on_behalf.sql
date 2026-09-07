-- 196: record a committee's verification that happened off the system.
--
-- The workflow assumes the EXCO member opens the app and presses Verify. Most
-- of them do not, yet — they approve in a meeting, by email, or by signing the
-- paper form, and the voucher then sits at PENDING_HEAD waiting for a click
-- that is never coming. The decision has been made; only the record is missing.
--
-- 195's release covers the other case, where nobody has decided anything and
-- Finance sends the voucher on regardless. That leaves the committee box
-- deliberately empty, because nobody verified it. This is the opposite
-- situation and must not look the same: somebody did verify it, and the
-- voucher should say who.
--
-- ── Whose signature it is ────────────────────────────────────────────────
-- The member's. They made the decision, so ministry_verified_by holds their
-- name and the voucher prints it, exactly as if they had pressed the button.
--
-- ── And who typed it ─────────────────────────────────────────────────────
-- Not the same person, and the record must never blur the two. Putting one
-- person's name in a signature box on another person's say-so is the precise
-- thing an audit trail exists to prevent, so both columns are mandatory
-- together: who recorded it, and on what basis they were entitled to.
--
-- basis is free text on purpose. "Approved at EXCO meeting 12/2026", "email
-- 3 Sep", "signed form in the file" — the useful thing is the specific
-- reference somebody could go and check, and a dropdown of four categories
-- would collect less of it, not more.
--
-- Both null on an ordinary verification, which is how the two are told apart
-- forever after: a null recorder means the member pressed the button
-- themselves.

ALTER TABLE pvs ADD COLUMN IF NOT EXISTS ministry_verified_on_behalf_by TEXT;
ALTER TABLE pvs ADD COLUMN IF NOT EXISTS ministry_verified_basis TEXT;

COMMENT ON COLUMN pvs.ministry_verified_on_behalf_by IS
  'Who recorded the committee''s verification, when the committee member did not press the button themselves. NULL means they did. ministry_verified_by remains the person whose decision it was.';
COMMENT ON COLUMN pvs.ministry_verified_basis IS
  'How that decision was received — a meeting, an email, a signed form — specific enough that somebody could go and check it.';

-- Neither alone means anything: a recorder with no basis is an unevidenced
-- claim about somebody else's decision, and a basis with no recorder has
-- nobody accountable for it.
ALTER TABLE pvs DROP CONSTRAINT IF EXISTS pv_on_behalf_needs_basis;
ALTER TABLE pvs ADD CONSTRAINT pv_on_behalf_needs_basis CHECK (
  (NULLIF(TRIM(ministry_verified_on_behalf_by), '') IS NULL)
  = (NULLIF(TRIM(ministry_verified_basis), '') IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_pvs_verified_on_behalf
  ON pvs (ministry_verified_on_behalf_by)
  WHERE ministry_verified_on_behalf_by IS NOT NULL;

SELECT count(*) AS vouchers,
       count(*) FILTER (WHERE ministry_verified_on_behalf_by IS NOT NULL) AS recorded_on_behalf
  FROM pvs;
