-- 175: what each category may claim, and how much of it is left.
--
-- Source: "Terms and Conditions of Service", revised 21 August 2013 — A4, A7,
-- A11 for pastors, B4, B7 for parish workers, C3, C6 for ministry and
-- administrative staff.
--
-- The app had no notion of a claim limit at all. Nothing stopped a claim for
-- RM900 of books against an RM800 yearly entitlement, and nobody could see what
-- they had left without asking Finance to add it up by hand.
--
-- Two tables. claim_types is the kind of claim and, where one applies, its
-- unit rate — mileage lives here so the next change to it is an edit rather
-- than a code deployment, which is the reason the app spent two revisions
-- disagreeing with the document at RM0.40, RM0.50 and RM0.70.
-- claim_entitlements is what one category of person may claim of one type, and
-- exists once per category because the three categories genuinely differ: a
-- pastor's out-patient treatment is met in full, a parish worker's by half.
--
-- Usage is derived, never stored. It is the sum of that person's own approved
-- and paid vouchers carrying the claim type, so the entitlement and the money
-- can never drift apart. pvs.claim_category has existed unused since the table
-- was created — 39 vouchers, every one of them null — and is what carries the
-- tag.
--
-- Percentages and caps are separate because the document uses both, sometimes
-- together: specialist out-patient is "50% of the medical expenses ... subject
-- to a maximum of RM80.00". percent_covered says how much of a bill the church
-- meets; cap_amount is the ceiling on what it pays out.

-- ── The kinds of claim ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claim_types (
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  -- Per-unit claims: mileage is the only one today. NULL means the claim is
  -- for whatever the receipt says.
  unit_rate   NUMERIC,
  unit_label  TEXT,
  sort_order  INT NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── What each category gets ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claim_entitlements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_code      TEXT NOT NULL REFERENCES claim_types(code) ON DELETE CASCADE,
  -- Matches people.category: PASTOR, PARISH_WORKER, HQ_STAFF.
  person_category TEXT NOT NULL,
  -- YEARLY  — the cap refreshes each calendar year (books, dental).
  -- PER_EVENT — the cap applies to one occasion (moving house, a birth).
  -- UNLIMITED — no ceiling; percent_covered still governs (out-patient).
  basis           TEXT NOT NULL CHECK (basis IN ('YEARLY', 'PER_EVENT', 'UNLIMITED')),
  percent_covered NUMERIC NOT NULL DEFAULT 100 CHECK (percent_covered > 0 AND percent_covered <= 100),
  cap_amount      NUMERIC,
  source          TEXT,
  note            TEXT,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cap_required_unless_unlimited
    CHECK (basis = 'UNLIMITED' OR cap_amount IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS claim_entitlement_unique
  ON claim_entitlements (claim_code, person_category);

CREATE INDEX IF NOT EXISTS idx_pvs_claim_category ON pvs (claim_category)
  WHERE claim_category IS NOT NULL;

ALTER TABLE claim_types        ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_entitlements ENABLE ROW LEVEL SECURITY;

-- Everybody may read what they are entitled to; Finance and the seniors set it.
DROP POLICY IF EXISTS "ct_read"  ON claim_types;
CREATE POLICY "ct_read"  ON claim_types FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ct_write" ON claim_types;
CREATE POLICY "ct_write" ON claim_types FOR ALL TO authenticated
  USING (is_finance_admin_or_senior()) WITH CHECK (is_finance_admin_or_senior());

DROP POLICY IF EXISTS "ce_read"  ON claim_entitlements;
CREATE POLICY "ce_read"  ON claim_entitlements FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ce_write" ON claim_entitlements;
CREATE POLICY "ce_write" ON claim_entitlements FOR ALL TO authenticated
  USING (is_finance_admin_or_senior()) WITH CHECK (is_finance_admin_or_senior());

-- ── The document, as data ─────────────────────────────────────────────────
INSERT INTO claim_types (code, name, description, unit_rate, unit_label, sort_order) VALUES
  ('TRAVEL',        'Travel / mileage',        'Official ministry travel. Tolls reimbursed on actual receipts.', 0.70, 'km', 10),
  ('OUTPATIENT',    'Out-patient treatment',   'General medical treatment, supported by receipts. Excludes artificial devices.', NULL, NULL, 20),
  ('SPECIALIST_OP', 'Specialist out-patient',  'Specialist out-patient treatment.', NULL, NULL, 30),
  ('DENTAL',        'Dental',                  'Yearly dental claim. Original receipts required.', NULL, NULL, 40),
  ('BLOOD_TEST',    'Annual blood test',       'Annual comprehensive blood test.', NULL, NULL, 50),
  ('MATERNITY',     'Maternity expenses',      'Maternity expenses incurred by the co-worker herself.', NULL, NULL, 60),
  ('BOOKS',         'Books and training',      'Annual book and/or training expense reimbursement.', NULL, NULL, 70),
  ('MOVING',        'Moving grant',            'Grant on relocation for new employment or official re-assignment.', NULL, NULL, 80)
ON CONFLICT (code) DO NOTHING;

DELETE FROM claim_entitlements;
INSERT INTO claim_entitlements
  (claim_code, person_category, basis, percent_covered, cap_amount, source, note) VALUES
  -- Travel. The document says RM0.40/km; the church now pays RM0.70, which is
  -- the rate on claim_types above. No ceiling on the total.
  ('TRAVEL','PASTOR',       'UNLIMITED',100,NULL,'T&C A4.5','Mileage at the rate on the claim type, plus tolls on receipts.'),
  ('TRAVEL','PARISH_WORKER','UNLIMITED',100,NULL,'T&C B4',  'Mileage at the rate on the claim type, plus tolls on receipts.'),
  ('TRAVEL','HQ_STAFF',     'UNLIMITED',100,NULL,'T&C C3.3','The document leaves the amount to the Church to determine.'),

  -- Out-patient. The one place the three categories genuinely differ.
  ('OUTPATIENT','PASTOR',       'UNLIMITED',100,NULL,'T&C A7.1.1','Met in full.'),
  ('OUTPATIENT','PARISH_WORKER','UNLIMITED', 50,NULL,'T&C B7.1.1','Half, provided by the local congregation.'),
  ('OUTPATIENT','HQ_STAFF',     'UNLIMITED',100,NULL,'T&C C6.1.1','Met in full.'),

  ('SPECIALIST_OP','PASTOR','YEARLY',50,80,'T&C A7.1.2','Half the bill, to a maximum of RM80.'),

  ('DENTAL','PASTOR',       'YEARLY',100,200,'T&C A7.1.4','All categories, from 1 January 2013. Original receipts.'),
  ('DENTAL','PARISH_WORKER','YEARLY',100,200,'T&C B7.1.3','All categories, from 1 January 2013. Original receipts.'),
  ('DENTAL','HQ_STAFF',     'YEARLY',100,200,'T&C C6.1.3','All categories, from 1 January 2013. Original receipts.'),

  ('BLOOD_TEST','PASTOR','YEARLY',100,100,'T&C A7.3.2','Borne by the local congregation.'),

  ('MATERNITY','PASTOR',       'PER_EVENT',50,500,'T&C A7.4.1','Half the expenses, to a maximum of RM500.'),
  ('MATERNITY','PARISH_WORKER','PER_EVENT',50,500,'T&C B7.3.1','Half the expenses, to a maximum of RM500.'),
  ('MATERNITY','HQ_STAFF',     'PER_EVENT',50,500,'T&C C6.3.1','Half the expenses, to a maximum of RM500.'),

  ('BOOKS','PASTOR',       'YEARLY',100,800,'T&C A4.7.1','Provided by the local congregation.'),
  ('BOOKS','PARISH_WORKER','YEARLY',100,400,'T&C B4.5.1','Provided by the local congregation.'),
  ('BOOKS','HQ_STAFF',     'YEARLY',100,200,'T&C C3.5',  'Provided by the Church, on sale receipts.'),

  ('MOVING','PASTOR',       'PER_EVENT',100,1000,'T&C A4.6','New employment or official re-assignment.'),
  ('MOVING','PARISH_WORKER','PER_EVENT',100,1000,'T&C B4.4','On a required change of residence.'),
  ('MOVING','HQ_STAFF',     'PER_EVENT',100, 500,'T&C C3.4','On a required change of residence.');

-- ── Who is this person, for claim purposes ────────────────────────────────
CREATE OR REPLACE FUNCTION claim_category_for(p_email TEXT)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.category FROM people p
   WHERE lower(p.user_email) = lower(p_email)
      OR lower(COALESCE(p.work_email,'')) = lower(p_email)
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION claim_category_for(TEXT) TO authenticated;

-- ── Entitlement, used and remaining, for the signed-in person ─────────────
-- Usage counts only vouchers that reached approval: a claim still working its
-- way through the chain has not been paid and should not reduce what somebody
-- believes they have left. PER_EVENT types report no usage, because the church
-- has no way to know which relocation or which birth a voucher belongs to;
-- their cap is shown as the ceiling on a single claim.
CREATE OR REPLACE FUNCTION my_claim_entitlements(p_year INT DEFAULT NULL)
RETURNS TABLE (
  code TEXT, name TEXT, basis TEXT, percent_covered NUMERIC,
  cap_amount NUMERIC, used NUMERIC, remaining NUMERIC,
  unit_rate NUMERIC, unit_label TEXT, source TEXT, note TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH me AS (
    SELECT lower(auth.jwt() ->> 'email') AS email,
           claim_category_for(auth.jwt() ->> 'email') AS category,
           COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::INT) AS yr
  ),
  spent AS (
    SELECT v.claim_category AS code, COALESCE(SUM(v.amount), 0) AS total
      FROM pvs v, me
     WHERE lower(v.applicant_email) = me.email
       AND v.claim_category IS NOT NULL
       AND v.status IN ('APPROVED', 'PAID')
       AND EXTRACT(YEAR FROM v.date)::INT = me.yr
     GROUP BY v.claim_category
  )
  SELECT ct.code, ct.name, e.basis, e.percent_covered, e.cap_amount,
         CASE WHEN e.basis = 'YEARLY' THEN COALESCE(s.total, 0) ELSE NULL END,
         CASE WHEN e.basis = 'YEARLY' THEN GREATEST(e.cap_amount - COALESCE(s.total, 0), 0) ELSE NULL END,
         ct.unit_rate, ct.unit_label, e.source, e.note
    FROM claim_entitlements e
    JOIN claim_types ct ON ct.code = e.claim_code AND ct.active
    JOIN me ON e.person_category = me.category
    LEFT JOIN spent s ON s.code = ct.code
   WHERE e.active
   ORDER BY ct.sort_order;
$$;

GRANT EXECUTE ON FUNCTION my_claim_entitlements(INT) TO authenticated;

SELECT (SELECT count(*) FROM claim_types)        AS claim_types,
       (SELECT count(*) FROM claim_entitlements) AS entitlements,
       (SELECT count(DISTINCT person_category) FROM claim_entitlements) AS categories;
