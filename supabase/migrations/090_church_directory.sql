-- 090: Church directory — who each person is, so access and leave routing can
-- be derived instead of maintained by hand.
--
-- user_roles held only a system role and a list of ministries. There was no
-- notion of congregation, district, Dean, head pastor, or whether someone is
-- actually employed by LCM, which meant volunteer EXCO members could apply for
-- staff leave and employee loans, and pastoral leave approvers had to be typed
-- in per person and rotted as Deans changed.
--
-- Dean and head pastor are deliberately NOT flags on a person: they are
-- properties of the district and congregation, so there is one source of truth
-- and handing the role over is a single edit. A flag on a person could
-- contradict the assignment.

-- ── Districts ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS districts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  -- The Dean leading this district; a pastor, referenced by login email.
  dean_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Congregations ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS congregations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL UNIQUE,
  district_id       UUID REFERENCES districts(id) ON DELETE SET NULL,
  -- First approver for pastors serving here. Null is valid — the district Dean
  -- picks up the approval in that case.
  head_pastor_email TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_congregations_district ON congregations(district_id);
CREATE INDEX IF NOT EXISTS idx_districts_dean         ON districts(dean_email);
CREATE INDEX IF NOT EXISTS idx_congregations_head     ON congregations(head_pastor_email);

-- ── Person profile ─────────────────────────────────────────────────────────
-- Position and employment sit alongside the system role rather than replacing
-- it, so "EXCO member who is also a pastor" is role = MINISTRY_HEAD plus
-- is_pastor = true, and no existing permission changes.
--
-- is_lcm_staff defaults TRUE and reports_to defaults to GM_AND_BISHOP so every
-- existing account behaves exactly as it does today; volunteers are unticked
-- afterwards rather than everyone needing to be set up first.
ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS is_lcm_staff    BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS is_pastor       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS designation     TEXT,
  ADD COLUMN IF NOT EXISTS congregation_id UUID REFERENCES congregations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reports_to      TEXT NOT NULL DEFAULT 'GM_AND_BISHOP';

ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_reports_to_check;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_reports_to_check
  CHECK (reports_to IN ('BISHOP_ONLY', 'GM_AND_BISHOP'));

CREATE INDEX IF NOT EXISTS idx_user_roles_congregation ON user_roles(congregation_id);

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Readable by everyone signed in: leave routing has to resolve a Dean or head
-- pastor for any applicant, and the directory is not sensitive. Writes are for
-- Finance and the GM, who maintain it in Settings.
ALTER TABLE districts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE congregations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "districts_read" ON districts;
CREATE POLICY "districts_read" ON districts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "districts_write" ON districts;
CREATE POLICY "districts_write" ON districts
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.email = (auth.jwt() ->> 'email')
      AND ur.role IN ('FINANCE_ADMIN','FINANCE_ADMIN_2','FINANCE_ADMIN_3','GENERAL_MANAGER')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.email = (auth.jwt() ->> 'email')
      AND ur.role IN ('FINANCE_ADMIN','FINANCE_ADMIN_2','FINANCE_ADMIN_3','GENERAL_MANAGER')
  ));

DROP POLICY IF EXISTS "congregations_read" ON congregations;
CREATE POLICY "congregations_read" ON congregations
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "congregations_write" ON congregations;
CREATE POLICY "congregations_write" ON congregations
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.email = (auth.jwt() ->> 'email')
      AND ur.role IN ('FINANCE_ADMIN','FINANCE_ADMIN_2','FINANCE_ADMIN_3','GENERAL_MANAGER')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.email = (auth.jwt() ->> 'email')
      AND ur.role IN ('FINANCE_ADMIN','FINANCE_ADMIN_2','FINANCE_ADMIN_3','GENERAL_MANAGER')
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON districts     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON congregations TO authenticated;
