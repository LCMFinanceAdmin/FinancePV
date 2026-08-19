-- 151: the facts the Add Person form now asks for.
--
-- Three lists the intake form needs, and one change of shape.

-- ── 1. Retirement splits in two ───────────────────────────────────────────
-- A retired pastor still working on contract is a different person to the
-- register than one who has stopped: the first still serves a congregation and
-- appears on the payroll, the second does neither. One RETIRED value could not
-- tell them apart.
--
-- Eligibility is deliberately unchanged by the split. The constitution bars
-- retired pastors from EXCO, from Bishop and Secretary, and from serving as
-- Dean; being on contract does not un-retire somebody, and nothing said
-- otherwise. is_retired_standing() says that once so the rules cannot drift
-- apart from each other.
ALTER TABLE people DROP CONSTRAINT IF EXISTS people_pastor_standing_check;
ALTER TABLE people ADD CONSTRAINT people_pastor_standing_check
  CHECK (pastor_standing IS NULL OR pastor_standing IN
         ('PASTOR','REVEREND','RETIRED_WORKING','RETIRED'));

COMMENT ON COLUMN people.pastor_standing IS
  'PASTOR (unordained), REVEREND (ordained), RETIRED_WORKING (retired, still on contract), RETIRED (retired, not working).';

CREATE OR REPLACE FUNCTION is_retired_standing(p_standing TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
AS $$ SELECT p_standing IN ('RETIRED','RETIRED_WORKING'); $$;

REVOKE ALL ON FUNCTION is_retired_standing(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_retired_standing(TEXT) TO authenticated;

-- ── 2. Departments become a list ──────────────────────────────────────────
-- people.hq_department has been free text, which is how "Admin" and
-- "Administration" end up as two departments that are one department. The
-- table already existed for Lookups and was simply empty.
INSERT INTO departments (name)
SELECT d FROM (VALUES
  ('Finance'), ('Accounts'), ('Administration'), ('Communications'),
  ('Human Resource'), ('Building Manager'), ('Trustees'),
  ('Reconcile (Counselling and Care Ministry)')
) AS v(d)
WHERE NOT EXISTS (SELECT 1 FROM departments x WHERE lower(x.name) = lower(v.d));

-- The two values already in use, kept but pointed at the real names so the
-- existing records stop being their own department.
UPDATE people SET hq_department = 'Administration' WHERE hq_department = 'Admin';

-- ── 3. What a vendor, agent or partner is FOR ─────────────────────────────
-- Deliberately a list that grows rather than a fixed one: nobody can enumerate
-- in advance what LCM will engage somebody to do. Typing a new one adds it, so
-- the second fire-protection contractor picks the same words as the first
-- instead of inventing a near-miss nobody can group on.
--
-- Not a foreign key. The form lets somebody type a value that is not on the
-- list yet — that is the point of it growing — and a constraint would make the
-- common case an error before the list has caught up.
CREATE TABLE IF NOT EXISTS service_types (
  key        TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 500,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT service_type_label_not_blank CHECK (length(trim(label)) > 0)
);

INSERT INTO service_types (key, label, sort_order) VALUES
  ('LEGAL',            'Legal / lawyer',                    10),
  ('COMPANY_SEC',      'Company secretarial',               20),
  ('AUDIT',            'Audit',                             30),
  ('FIRE_PROTECTION',  'Fire protection system',            40),
  ('SECURITY',         'Security',                          50),
  ('WEB_HOSTING',      'Web hosting / IT',                  60),
  ('CLEANING',         'Cleaning',                          70),
  ('MAINTENANCE',      'Building maintenance',              80),
  ('INSURANCE',        'Insurance',                         90),
  ('OTHER',            'Other',                            900)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE service_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "svc_read"  ON service_types;
DROP POLICY IF EXISTS "svc_write" ON service_types;
CREATE POLICY "svc_read" ON service_types FOR SELECT TO authenticated USING (true);
-- Wider than the directory lists: whoever may add a vendor has to be able to
-- name what the vendor does, and that is the people directory, not Finance
-- alone.
CREATE POLICY "svc_write" ON service_types FOR ALL TO authenticated
  USING (can_manage_people()) WITH CHECK (can_manage_people());
GRANT SELECT, INSERT, UPDATE, DELETE ON service_types TO authenticated;

-- ── 4. Eligibility, taught the new shape ──────────────────────────────────
CREATE OR REPLACE FUNCTION office_eligibility(p_office_id UUID, p_person_id UUID)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  o offices%ROWTYPE;
  p people%ROWTYPE;
  v_districts UUID[];
BEGIN
  SELECT * INTO o FROM offices WHERE id = p_office_id;
  SELECT * INTO p FROM people  WHERE id = p_person_id;
  IF NOT FOUND OR o.id IS NULL THEN RETURN NULL; END IF;

  IF o.grants_role IN ('BISHOP','SECRETARY') THEN
    IF p.pastor_standing IS NULL THEN
      RETURN 'No standing recorded — this post is open to Reverends only';
    ELSIF is_retired_standing(p.pastor_standing) THEN
      RETURN 'Retired pastors cannot stand for this post';
    ELSIF p.pastor_standing <> 'REVEREND' THEN
      RETURN 'Open to Reverends only — not yet ordained';
    END IF;
    RETURN NULL;
  END IF;

  IF o.grants_role = 'TREASURER' THEN
    IF p.pastor_standing IS NOT NULL THEN
      RETURN 'Treasurer is a lay post — open to volunteers, not to ministry';
    ELSIF p.affiliation IS NULL THEN
      RETURN 'No church affiliation recorded — this post is open to LCM members only';
    ELSIF p.affiliation <> 'LCM_MEMBER' THEN
      RETURN 'Open to members of an LCM congregation only';
    END IF;
    RETURN NULL;
  END IF;

  IF o.kind = 'DEAN' THEN
    IF p.pastor_standing IS NULL THEN
      RETURN 'No standing recorded — a Dean must be a Reverend';
    ELSIF is_retired_standing(p.pastor_standing) THEN
      RETURN 'Retired pastors cannot serve as Dean';
    ELSIF p.pastor_standing <> 'REVEREND' THEN
      RETURN 'A Dean must be a Reverend';
    END IF;

    SELECT array_agg(DISTINCT c.district_id) INTO v_districts
      FROM congregations c
     WHERE c.district_id IS NOT NULL
       AND (
            c.id = p.congregation_id
         OR (
              COALESCE(NULLIF(btrim(p.user_email), ''), NULLIF(btrim(p.email), '')) IS NOT NULL
              AND lower(btrim(c.head_pastor_email)) =
                  lower(COALESCE(NULLIF(btrim(p.user_email), ''), NULLIF(btrim(p.email), '')))
            )
       );

    IF v_districts IS NULL OR array_length(v_districts, 1) IS NULL THEN
      RETURN 'No LCM congregation recorded — a Dean serves, or belongs to, a church in the district';
    ELSIF o.district_id IS NOT NULL AND NOT (o.district_id = ANY(v_districts)) THEN
      RETURN 'Their congregation is in another district';
    END IF;
    RETURN NULL;
  END IF;

  IF o.kind = 'EXCO' THEN
    IF is_retired_standing(p.pastor_standing) THEN
      RETURN 'Retired pastors cannot hold an EXCO portfolio';
    ELSIF p.pastor_standing IS NOT NULL THEN
      RETURN NULL;
    ELSIF p.affiliation IS NULL THEN
      RETURN 'No standing or church affiliation recorded — EXCO is open to ministry and to LCM members';
    ELSIF p.affiliation <> 'LCM_MEMBER' THEN
      RETURN 'Open to ministry and to members of an LCM congregation';
    END IF;
    RETURN NULL;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION office_eligibility(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION office_eligibility(UUID, UUID) TO authenticated;
