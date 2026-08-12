-- 111: A PIN that can be guessed forever is six digits of nothing.
--
-- Migration 110's hashing fix protects a leaked table. It does nothing about
-- the other direction: someone signed in as a signatory could try PINs at the
-- endpoint until one worked. A million combinations sounds like a lot until
-- they are being tried by a script.
--
-- Five wrong attempts locks the PIN for fifteen minutes. That is enough to make
-- exhaustive guessing take years, and short enough that a signatory who simply
-- mistyped can make a cup of tea rather than telephone the office. Finance can
-- also clear it immediately.
--
-- The count decays: attempts more than fifteen minutes apart do not accumulate,
-- so someone who mistypes once a month never creeps toward a lockout.

ALTER TABLE user_security_credentials
  ADD COLUMN IF NOT EXISTS pin_failed_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_last_failed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pin_locked_until    TIMESTAMPTZ;

-- Finding who is locked out right now, without reading the whole table.
CREATE INDEX IF NOT EXISTS idx_usc_pin_locked
  ON user_security_credentials (pin_locked_until)
  WHERE pin_locked_until IS NOT NULL;

COMMENT ON COLUMN user_security_credentials.pin_failed_attempts IS
  'Consecutive wrong PINs within the window; cleared on a correct one';
COMMENT ON COLUMN user_security_credentials.pin_locked_until IS
  'Approvals refuse the PIN until this time. Cleared by a Finance Executive or by waiting.';

-- ── Seeing who is locked, without opening the credentials table ───────────
-- user_security_credentials is service-role only and should stay that way —
-- it holds the hashes. This returns the one fact Finance needs to act on, and
-- nothing else: who is locked and until when. Anyone else gets no rows rather
-- than an error, so the page simply shows nothing.
CREATE OR REPLACE FUNCTION locked_pins()
RETURNS TABLE (email TEXT, locked_until TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.email, c.pin_locked_until
    FROM user_security_credentials c
   WHERE c.pin_locked_until > NOW()
     AND EXISTS (
       SELECT 1 FROM user_roles ur
        WHERE ur.email = (auth.jwt() ->> 'email')
          AND ur.role IN ('FINANCE_ADMIN','FINANCE_ADMIN_2','FINANCE_ADMIN_3')
     );
$$;

GRANT EXECUTE ON FUNCTION locked_pins() TO authenticated;

COMMENT ON FUNCTION locked_pins() IS
  'Who is currently locked out of approving, for Finance. Exposes no hash.';
