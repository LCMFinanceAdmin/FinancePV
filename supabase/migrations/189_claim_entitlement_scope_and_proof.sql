-- 189: who a claim is for, not just what category they are — and the paper
-- behind it.
--
-- Three things, from one question: why is a man offered maternity expenses?
--
-- ── 1. The same hole 181 closed on the leave side ─────────────────────────
-- 181 restricted maternity and paternity leave by gender. Claims were left
-- alone, and they have exactly the same problem: 175 recorded the maternity
-- claim as "Maternity expenses incurred by the co-worker herself" — the Terms
-- are explicit at A7.4.1, B7.3.1 and C6.3.1 — and then offered it to all three
-- categories with nothing to distinguish who could actually claim it.
--
-- Restricted on the type rather than the entitlement, because it is the claim
-- that is gendered, not one category's version of it. Same shape as
-- leave_types.restricted_to_gender, so there is one idea here and not two.
--
-- It fails open for the same reason 181 does, and the reason is worth keeping
-- in view: twenty-four people still have no gender recorded, and hiding a real
-- entitlement from somebody because a field is blank is much the worse error.
-- They would never learn they had it. A man shown a maternity line loses
-- nothing.
--
-- ── 2. Entitlements that belong to a person ───────────────────────────────
-- Until now an entitlement could only be attached to one of three categories,
-- which assumes everyone in a category claims the same things. That is the
-- ordinary case and stays the default. It is not every case: a specific
-- allowance agreed in writing with one person, a language grant, a study cost
-- the Council approved once. Those had nowhere to live, so they were either
-- refused or paid outside the entitlement system entirely, where nothing
-- counts them.
--
-- A row now names either a category or a person, never both, and a person's
-- own row wins over their category's for the same claim. That direction is
-- deliberate: an override should be able to lower a ceiling as well as raise
-- one, and a rule that only ever added would not express "this person, by
-- agreement, claims mileage at a different rate".
--
-- ── 3. Proof ──────────────────────────────────────────────────────────────
-- claim_entitlements.source has always held a citation — "T&C A7.4.1" — and a
-- citation is only as good as the reader's access to the document. When the
-- mileage rate moved to RM0.70 there was nowhere to put the paper that
-- authorised it, so the figure in the app became its own authority.
--
-- A document attaches to a claim type, and optionally to one entitlement row
-- when it authorises just that one — a Council minute raising the pastors'
-- book ceiling, an email agreeing one person's allowance. Private bucket, read
-- by anyone signed in, written by the people who may set the figures: a rule
-- nobody can see the basis for is a rule people argue about.

-- ── 1. Gender ─────────────────────────────────────────────────────────────
ALTER TABLE claim_types ADD COLUMN IF NOT EXISTS restricted_to_gender TEXT
  CHECK (restricted_to_gender IS NULL OR restricted_to_gender IN ('Male', 'Female'));

COMMENT ON COLUMN claim_types.restricted_to_gender IS
  'Offered only to people recorded as this gender. NULL means everybody. Somebody with no gender on file sees it regardless — the check fails open, as it does for leave_types.';

UPDATE claim_types SET restricted_to_gender = 'Female' WHERE code = 'MATERNITY';

-- ── 2. Per-person entitlements ────────────────────────────────────────────
ALTER TABLE claim_entitlements
  ADD COLUMN IF NOT EXISTS person_id UUID REFERENCES people(id) ON DELETE CASCADE;

ALTER TABLE claim_entitlements ALTER COLUMN person_category DROP NOT NULL;

ALTER TABLE claim_entitlements DROP CONSTRAINT IF EXISTS claim_ent_scope;
ALTER TABLE claim_entitlements ADD CONSTRAINT claim_ent_scope
  CHECK ((person_id IS NULL) <> (person_category IS NULL));

-- The old index assumed every row had a category. Replaced by two partial
-- ones so a person may hold one row per claim, and a category still may too.
DROP INDEX IF EXISTS claim_entitlement_unique;
CREATE UNIQUE INDEX IF NOT EXISTS claim_entitlement_by_category
  ON claim_entitlements (claim_code, person_category) WHERE person_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS claim_entitlement_by_person
  ON claim_entitlements (claim_code, person_id) WHERE person_id IS NOT NULL;

COMMENT ON COLUMN claim_entitlements.person_id IS
  'Set instead of person_category to give one person their own terms for this claim. Overrides whatever their category would give them — in either direction.';

-- ── 3. The documents behind a figure ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS claim_documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_code     TEXT NOT NULL REFERENCES claim_types(code) ON DELETE CASCADE,
  -- Set when the document authorises one entitlement rather than the whole
  -- claim type. Goes null rather than taking the row with it, because the
  -- paper outlives the figure it justified.
  entitlement_id UUID REFERENCES claim_entitlements(id) ON DELETE SET NULL,
  kind           TEXT NOT NULL DEFAULT 'OTHER'
                 CHECK (kind IN ('CONSTITUTION','TERMS','AGREEMENT','MINUTES','EMAIL','OTHER')),
  title          TEXT NOT NULL,
  doc_date       DATE,
  note           TEXT,
  file_path      TEXT NOT NULL,
  file_name      TEXT NOT NULL,
  mime_type      TEXT,
  size_bytes     BIGINT,
  uploaded_by    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claim_documents_code ON claim_documents (claim_code);
CREATE INDEX IF NOT EXISTS idx_claim_documents_ent  ON claim_documents (entitlement_id)
  WHERE entitlement_id IS NOT NULL;

ALTER TABLE claim_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cd_read" ON claim_documents;
CREATE POLICY "cd_read" ON claim_documents FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "cd_write" ON claim_documents;
CREATE POLICY "cd_write" ON claim_documents FOR ALL TO authenticated
  USING (is_finance_admin_or_senior()) WITH CHECK (is_finance_admin_or_senior());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'claim-docs', 'claim-docs', false, 20971520,
  ARRAY[
    'image/jpeg','image/png','image/webp','image/heic','image/heif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'message/rfc822', 'text/plain'
  ]
) ON CONFLICT (id) DO UPDATE
  SET allowed_mime_types = EXCLUDED.allowed_mime_types,
      file_size_limit    = EXCLUDED.file_size_limit;

-- Anyone signed in may read the basis for a rule that applies to them; only
-- those who may set the figures may add or remove the paper behind them.
DROP POLICY IF EXISTS "claim_docs_select" ON storage.objects;
CREATE POLICY "claim_docs_select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'claim-docs');

DROP POLICY IF EXISTS "claim_docs_insert" ON storage.objects;
CREATE POLICY "claim_docs_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'claim-docs' AND is_finance_admin_or_senior());

DROP POLICY IF EXISTS "claim_docs_delete" ON storage.objects;
CREATE POLICY "claim_docs_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'claim-docs' AND is_finance_admin_or_senior());

-- ── What each person may claim, after all of that ─────────────────────────
DROP FUNCTION IF EXISTS my_claim_entitlements(INTEGER);

CREATE FUNCTION my_claim_entitlements(p_year INTEGER DEFAULT NULL)
RETURNS TABLE (
  code TEXT, name TEXT, basis TEXT, percent_covered NUMERIC, cap_amount NUMERIC,
  used NUMERIC, remaining NUMERIC, unit_rate NUMERIC, unit_label TEXT,
  source TEXT, note TEXT, scope TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT lower(auth.jwt() ->> 'email') AS email,
           claim_category_for(auth.jwt() ->> 'email') AS category,
           COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::INT) AS yr,
           (SELECT p.id FROM people p
             WHERE lower(p.user_email) = lower(auth.jwt() ->> 'email')
                OR lower(COALESCE(p.work_email, '')) = lower(auth.jwt() ->> 'email')
             LIMIT 1) AS person_id,
           (SELECT NULLIF(p.gender, '') FROM people p
             WHERE lower(p.user_email) = lower(auth.jwt() ->> 'email')
                OR lower(COALESCE(p.work_email, '')) = lower(auth.jwt() ->> 'email')
             LIMIT 1) AS gender
  ),
  spent AS (
    SELECT v.claim_category AS code, COALESCE(SUM(v.amount), 0) AS total
      FROM pvs v, me
     WHERE lower(v.applicant_email) = me.email
       AND v.claim_category IS NOT NULL
       AND v.status IN ('APPROVED', 'PAID')
       AND EXTRACT(YEAR FROM v.date)::INT = me.yr
     GROUP BY v.claim_category
  ),
  -- Mine by name, and mine by category where I have no row of my own. The
  -- DISTINCT ON does the overriding: ordered so a personal row sorts first,
  -- one row survives per claim.
  mine AS (
    SELECT DISTINCT ON (e.claim_code) e.*,
           CASE WHEN e.person_id IS NOT NULL THEN 'PERSONAL' ELSE 'CATEGORY' END AS scope
      FROM claim_entitlements e, me
     WHERE e.active
       AND (e.person_id = me.person_id OR e.person_category = me.category)
     ORDER BY e.claim_code, (e.person_id IS NULL)
  )
  SELECT ct.code, ct.name, m.basis, m.percent_covered, m.cap_amount,
         CASE WHEN m.basis = 'YEARLY' THEN COALESCE(s.total, 0) ELSE NULL END,
         CASE WHEN m.basis = 'YEARLY' THEN GREATEST(m.cap_amount - COALESCE(s.total, 0), 0) ELSE NULL END,
         ct.unit_rate, ct.unit_label, m.source, m.note, m.scope
    FROM mine m
    JOIN claim_types ct ON ct.code = m.claim_code AND ct.active
    LEFT JOIN spent s ON s.code = ct.code
   -- Fails open: no restriction, or no gender on file, and it is offered.
   WHERE (ct.restricted_to_gender IS NULL
          OR (SELECT gender FROM me) IS NULL
          OR ct.restricted_to_gender = (SELECT gender FROM me))
   ORDER BY ct.sort_order;
$$;

GRANT EXECUTE ON FUNCTION my_claim_entitlements(INTEGER) TO authenticated;

SELECT (SELECT count(*) FROM claim_types WHERE restricted_to_gender IS NOT NULL) AS gendered_types,
       (SELECT count(*) FROM claim_entitlements WHERE person_category IS NOT NULL) AS category_rows,
       (SELECT count(*) FROM claim_entitlements WHERE person_id IS NOT NULL)       AS personal_rows,
       (SELECT count(*) FROM people WHERE gender IS NULL OR gender = '')           AS still_fail_open;
