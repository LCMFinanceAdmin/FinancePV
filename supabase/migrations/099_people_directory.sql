-- 099: The people directory — one record per person, whoever they are.
--
-- The app knew people in three disconnected ways: user_roles (anyone with a
-- login), payroll_employees (anyone paid), and congregations.head_pastor_email
-- (a single office). Nobody was described in one place, and anyone without a
-- login — a vendor, a volunteer, a council member — did not exist at all.
--
-- This is the master record. It deliberately does NOT copy salary or bank
-- details: payroll_salary already versions every revision, so duplicating it
-- here would create two answers to "what is she paid". The profile reads from
-- payroll instead, and links to it by id.

CREATE TABLE IF NOT EXISTS people (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who they are
  full_name     TEXT NOT NULL,
  preferred_name TEXT,
  -- The primary classification. Someone can be a Pastor *and* on the EXCO —
  -- that is a flag below, not a second category, because a person holds one
  -- place in the organisation and may be elected to others.
  category      TEXT NOT NULL DEFAULT 'HQ_STAFF'
                  CHECK (category IN ('PASTOR','PARISH_WORKER','HQ_STAFF','VOLUNTEER','VENDOR','AGENT','OTHER')),
  status        TEXT NOT NULL DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE','INACTIVE','RESIGNED','RETIRED')),

  -- Contact
  email         TEXT,
  phone         TEXT,
  alt_phone     TEXT,
  address       TEXT,

  -- Personal. Sensitive — see the RLS policies below.
  ic_no         TEXT,
  passport_no   TEXT,
  dob           DATE,
  gender        TEXT,
  marital_status TEXT,

  -- Where they serve
  hq_department TEXT,
  -- Congregations live in person_congregations: a pastor may shepherd several.
  district_id   UUID REFERENCES districts(id) ON DELETE SET NULL,

  -- Elected to the EXCO. Independent of category, since pastors and lay members
  -- alike can be elected.
  is_exco       BOOLEAN NOT NULL DEFAULT FALSE,
  exco_portfolio TEXT,

  -- Employed and paid by LCM. Drives whether employment details apply at all.
  is_employed   BOOLEAN NOT NULL DEFAULT FALSE,
  date_joined   DATE,
  date_left     DATE,

  -- Vendors and agents
  company_name  TEXT,
  vendor_service TEXT,

  -- Links, both optional: a vendor has no login and no payroll record.
  user_email    TEXT,
  payroll_employee_id UUID REFERENCES payroll_employees(id) ON DELETE SET NULL,

  notes         TEXT,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_people_category ON people(category);
CREATE INDEX IF NOT EXISTS idx_people_status   ON people(status);
CREATE INDEX IF NOT EXISTS idx_people_email    ON people(lower(email));
CREATE INDEX IF NOT EXISTS idx_people_user     ON people(lower(user_email));
CREATE INDEX IF NOT EXISTS idx_people_name_trgm ON people USING gin (full_name gin_trgm_ops);

-- A pastor may shepherd more than one congregation, so this cannot be a column.
CREATE TABLE IF NOT EXISTS person_congregations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id       UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  congregation_id UUID NOT NULL REFERENCES congregations(id) ON DELETE CASCADE,
  -- Where they mainly serve, when they cover several.
  is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
  role_note       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (person_id, congregation_id)
);

CREATE INDEX IF NOT EXISTS idx_pc_person ON person_congregations(person_id);
CREATE INDEX IF NOT EXISTS idx_pc_cong   ON person_congregations(congregation_id);

-- ── The Administrator role ────────────────────────────────────────────────
-- Keeps the directory. Not a finance role: no approving, no payments.
ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;

-- ── Who may read and edit ─────────────────────────────────────────────────
-- Everything here is personal data — IC numbers, addresses, dates of birth —
-- so the table is not readable by all staff. Finance, Accounts, the GM, the
-- three signatories and the Administrator, and nobody else.
CREATE OR REPLACE FUNCTION can_manage_people()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.email = (auth.jwt() ->> 'email')
      AND ur.role IN ('FINANCE_ADMIN','FINANCE_ADMIN_2','FINANCE_ADMIN_3',
                      'GENERAL_MANAGER','BISHOP','TREASURER','SECRETARY',
                      'ADMINISTRATOR')
  );
$$;

GRANT EXECUTE ON FUNCTION can_manage_people() TO authenticated;

ALTER TABLE people                ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_congregations  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "people_read"  ON people;
DROP POLICY IF EXISTS "people_write" ON people;
CREATE POLICY "people_read" ON people
  FOR SELECT TO authenticated
  -- A person may always read their own record.
  USING (can_manage_people() OR lower(user_email) = lower(auth.jwt() ->> 'email'));
CREATE POLICY "people_write" ON people
  FOR ALL TO authenticated
  USING (can_manage_people()) WITH CHECK (can_manage_people());

DROP POLICY IF EXISTS "pc_read"  ON person_congregations;
DROP POLICY IF EXISTS "pc_write" ON person_congregations;
CREATE POLICY "pc_read" ON person_congregations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "pc_write" ON person_congregations
  FOR ALL TO authenticated
  USING (can_manage_people()) WITH CHECK (can_manage_people());

GRANT SELECT, INSERT, UPDATE, DELETE ON people                TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON person_congregations  TO authenticated;

-- ── Seed from what is already known ───────────────────────────────────────
-- Everyone with a login becomes a person, so the directory opens populated
-- rather than empty. Matched on email so re-running changes nothing.
INSERT INTO people (full_name, email, user_email, category, is_exco, is_employed, hq_department, created_by)
SELECT
  COALESCE(NULLIF(ur.full_name, ''), ur.email),
  ur.email,
  ur.email,
  CASE
    WHEN ur.is_pastor THEN 'PASTOR'
    WHEN ur.is_lcm_staff IS FALSE THEN 'VOLUNTEER'
    ELSE 'HQ_STAFF'
  END,
  ur.role = 'MINISTRY_HEAD',
  COALESCE(ur.is_lcm_staff, TRUE),
  NULLIF(ur.designation, ''),
  'seeded from user accounts'
FROM user_roles ur
WHERE NOT EXISTS (
  SELECT 1 FROM people p WHERE lower(p.user_email) = lower(ur.email)
);

-- Pastors already assigned to a congregation keep that assignment.
INSERT INTO person_congregations (person_id, congregation_id, is_primary)
SELECT p.id, ur.congregation_id, TRUE
FROM user_roles ur
JOIN people p ON lower(p.user_email) = lower(ur.email)
WHERE ur.congregation_id IS NOT NULL
ON CONFLICT (person_id, congregation_id) DO NOTHING;

-- And link anyone already on payroll, matched by name.
UPDATE people p
   SET payroll_employee_id = pe.id, is_employed = TRUE
  FROM payroll_employees pe
 WHERE p.payroll_employee_id IS NULL
   AND lower(trim(pe.full_name)) = lower(trim(p.full_name));
