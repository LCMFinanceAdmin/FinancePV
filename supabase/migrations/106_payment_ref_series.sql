-- 106: Payment reference series — one running number per bank account.
--
-- Marking a voucher paid asked for a reference and took whatever was typed.
-- Two people recording payments in the same week produced "RHB25-41", "RHB
-- 25/41" and "rhb 0041" for three consecutive payments out of the same
-- account, and nothing could be reconciled against the bank statement without
-- reading each one.
--
-- The reference is now issued, not typed. Each bank account carries its own
-- series — its prefix, how many digits, whether the year appears — and the
-- number advances by one each time a payment is recorded against it. The
-- account already knows which entity it belongs to, so "different entities and
-- different banks each with their own running number" falls out of the account
-- list rather than being a second thing to maintain.
--
-- PV numbers are untouched. A voucher is numbered when it is raised, quoted on
-- every approval, and must not change at payment time.

CREATE TABLE IF NOT EXISTS payment_ref_series (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One series per account. The entity comes with it.
  bank_account_id UUID NOT NULL UNIQUE REFERENCES bank_accounts(id) ON DELETE CASCADE,

  prefix          TEXT NOT NULL,
  -- Zero-padding: 4 gives 0041.
  digits          INT NOT NULL DEFAULT 4 CHECK (digits BETWEEN 1 AND 8),
  -- 'YY' → 25, 'YYYY' → 2025, 'NONE' → no year at all.
  year_format     TEXT NOT NULL DEFAULT 'YY'
                    CHECK (year_format IN ('YY','YYYY','NONE')),
  separator       TEXT NOT NULL DEFAULT '/',
  -- Whether the count restarts each January, which is what a year in the
  -- reference implies. Off means one unbroken sequence for the account.
  reset_yearly    BOOLEAN NOT NULL DEFAULT TRUE,

  next_number     INT NOT NULL DEFAULT 1 CHECK (next_number > 0),
  -- The year next_number belongs to, so the roll-over happens once.
  current_year    INT NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),

  active          BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prs_account ON payment_ref_series(bank_account_id);

-- Every reference ever issued, with the voucher it went to.
--
-- The counter alone says where the series has reached but not how it got
-- there. This is the ledger behind it: if a number is queried, or a payment is
-- cancelled and the reference has to be traced, the answer is here rather than
-- inferred from the gap.
CREATE TABLE IF NOT EXISTS payment_ref_issues (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id   UUID NOT NULL REFERENCES payment_ref_series(id) ON DELETE CASCADE,
  reference   TEXT NOT NULL,
  seq_number  INT  NOT NULL,
  year        INT  NOT NULL,
  pv_id       UUID REFERENCES pvs(id) ON DELETE SET NULL,
  pv_no       TEXT,
  issued_by   TEXT,
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pri_series ON payment_ref_issues(series_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_pri_pv     ON payment_ref_issues(pv_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pri_ref ON payment_ref_issues(reference);

-- ── Formatting, in one place ──────────────────────────────────────────────
-- The settings page previews the next reference and the issuer produces the
-- real one. Both call this, so what is previewed is what is issued.
CREATE OR REPLACE FUNCTION format_payment_ref(
  p_prefix TEXT, p_digits INT, p_year_format TEXT, p_separator TEXT,
  p_number INT, p_year INT
) RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_year_format
           WHEN 'NONE'  THEN p_prefix || ' ' || lpad(p_number::TEXT, p_digits, '0')
           WHEN 'YYYY'  THEN p_prefix || ' ' || p_year::TEXT || p_separator
                             || lpad(p_number::TEXT, p_digits, '0')
           ELSE              p_prefix || ' ' || lpad((p_year % 100)::TEXT, 2, '0')
                             || p_separator || lpad(p_number::TEXT, p_digits, '0')
         END;
$$;

GRANT EXECUTE ON FUNCTION format_payment_ref(TEXT,INT,TEXT,TEXT,INT,INT) TO authenticated;

-- ── Issuing the next reference ────────────────────────────────────────────
-- SECURITY DEFINER with a row lock: two people recording payments at the same
-- moment must not receive the same number, and the unique index on the ledger
-- is the backstop if they somehow do.
CREATE OR REPLACE FUNCTION next_payment_ref(
  p_account_id UUID,
  p_pv_id      UUID DEFAULT NULL,
  p_pv_no      TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s          payment_ref_series%ROWTYPE;
  v_year     INT := EXTRACT(YEAR FROM CURRENT_DATE);
  v_number   INT;
  v_ref      TEXT;
BEGIN
  SELECT * INTO s FROM payment_ref_series
   WHERE bank_account_id = p_account_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No reference series is set up for that account. Add one in Settings → Payment References.';
  END IF;
  IF NOT s.active THEN
    RAISE EXCEPTION 'The reference series for that account is switched off.';
  END IF;

  -- A new year restarts the count, once, if the series says so.
  IF s.reset_yearly AND v_year <> s.current_year THEN
    v_number := 1;
  ELSE
    v_number := s.next_number;
  END IF;

  v_ref := format_payment_ref(s.prefix, s.digits, s.year_format, s.separator, v_number, v_year);

  UPDATE payment_ref_series
     SET next_number  = v_number + 1,
         current_year = v_year,
         updated_at   = NOW()
   WHERE id = s.id;

  INSERT INTO payment_ref_issues (series_id, reference, seq_number, year, pv_id, pv_no, issued_by)
  VALUES (s.id, v_ref, v_number, v_year, p_pv_id, p_pv_no, auth.jwt() ->> 'email');

  RETURN v_ref;
END;
$$;

GRANT EXECUTE ON FUNCTION next_payment_ref(UUID, UUID, TEXT) TO authenticated;

-- ── Who may read and change the series ────────────────────────────────────
-- Anyone signed in may read one: a reference on a voucher should be
-- explainable by whoever is looking at it.
--
-- Keeping them is the Accounts Executive's job. The Finance Executive can
-- reach them too, so a series is never stuck waiting on one person — a prefix
-- that needs correcting on a Friday afternoon should not hold up payments
-- until Monday. Nobody else, including the General Manager: the numbers are
-- bookkeeping, and a second hand in them is how two vouchers end up sharing a
-- reference.
CREATE OR REPLACE FUNCTION can_manage_payment_refs()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
     WHERE ur.email = (auth.jwt() ->> 'email')
       AND ur.role IN ('FINANCE_ADMIN_2',                    -- keeps them
                       'FINANCE_ADMIN', 'FINANCE_ADMIN_3')   -- cover
  );
$$;

GRANT EXECUTE ON FUNCTION can_manage_payment_refs() TO authenticated;

ALTER TABLE payment_ref_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_ref_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prs_read"  ON payment_ref_series;
DROP POLICY IF EXISTS "prs_write" ON payment_ref_series;
CREATE POLICY "prs_read"  ON payment_ref_series
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "prs_write" ON payment_ref_series
  FOR ALL TO authenticated
  USING (can_manage_payment_refs()) WITH CHECK (can_manage_payment_refs());

DROP POLICY IF EXISTS "pri_read"  ON payment_ref_issues;
DROP POLICY IF EXISTS "pri_write" ON payment_ref_issues;
CREATE POLICY "pri_read"  ON payment_ref_issues
  FOR SELECT TO authenticated USING (true);
-- Issues are written by next_payment_ref(), which is SECURITY DEFINER; nobody
-- writes the ledger by hand, or the counter and the ledger could disagree.
CREATE POLICY "pri_write" ON payment_ref_issues
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

GRANT SELECT, INSERT, UPDATE, DELETE ON payment_ref_series TO authenticated;
GRANT SELECT ON payment_ref_issues TO authenticated;

-- ── A series for each account payments actually go out of ─────────────────
-- Current accounts only: a fixed deposit does not pay vouchers. The prefixes
-- are the abbreviations already in use on the statements; they are editable on
-- the settings page, and this is only a starting point.
INSERT INTO payment_ref_series (bank_account_id, prefix, digits, year_format, separator, updated_by)
SELECT b.id,
       CASE
         WHEN b.bank_name ILIKE '%public%'      THEN 'PBB'
         WHEN b.bank_name ILIKE '%rhb%'         THEN 'RHB'
         WHEN b.bank_name ILIKE '%maybank%'     THEN 'MBB'
         WHEN b.bank_name ILIKE '%hong leong%'  THEN 'HLB'
         WHEN b.bank_name ILIKE '%affin%'       THEN 'AFB'
         WHEN b.bank_name ILIKE '%cimb%'        THEN 'CIMB'
         WHEN b.bank_name ILIKE '%ambank%'      THEN 'AMB'
         WHEN b.bank_name ILIKE '%alliance%'    THEN 'ALL'
         WHEN b.bank_name ILIKE '%bank islam%'  THEN 'BIMB'
         WHEN b.bank_name ILIKE '%ocbc%'        THEN 'OCBC'
         WHEN b.bank_name ILIKE '%uob%'         THEN 'UOB'
         ELSE upper(left(regexp_replace(b.bank_name, '[^A-Za-z]', '', 'g'), 3))
       END,
       4, 'YY', '/', 'migration 106'
FROM bank_accounts b
WHERE b.account_type = 'CURRENT'
  AND b.is_active
ON CONFLICT (bank_account_id) DO NOTHING;

COMMENT ON TABLE payment_ref_series IS
  'One running payment-reference series per bank account — prefix, digits and year format';
COMMENT ON FUNCTION next_payment_ref(UUID, UUID, TEXT) IS
  'Issues and records the next reference for an account. Locks the series row.';
