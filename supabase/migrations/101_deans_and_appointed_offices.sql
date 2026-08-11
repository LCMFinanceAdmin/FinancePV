-- 101: Deans are elected too, and the General Manager is not.
--
-- Migration 100 treated every office the same. Two corrections:
--
--   * The General Manager is a permanent appointment, not an elected post. It
--     belongs on the register — the office carries approval rights and needs a
--     holder — but "New election" is the wrong word and a term the wrong shape.
--
--   * Dean IS elected, and there is one per district. It lived on the district
--     record as an email, which could not express a term or say who held it
--     before. It becomes an office like the others, one per district.
--
-- districts.dean_email stays as the working copy that leave routing reads, and
-- electing a Dean updates it. One place to do the work, and the routing keeps
-- functioning unchanged.

ALTER TABLE offices
  ADD COLUMN IF NOT EXISTS district_id UUID REFERENCES districts(id) ON DELETE CASCADE,
  -- Elected posts have terms and elections; an appointment simply has a holder.
  ADD COLUMN IF NOT EXISTS is_elected BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE offices DROP CONSTRAINT IF EXISTS offices_kind_check;
ALTER TABLE offices ADD CONSTRAINT offices_kind_check
  CHECK (kind IN ('CHURCH', 'EXCO', 'DEAN', 'APPOINTED'));

-- The General Manager is employed, not elected.
UPDATE offices
   SET kind = 'APPOINTED', is_elected = FALSE, sort_order = 90
 WHERE name = 'General Manager';

-- One Dean per district, named so the register reads plainly.
INSERT INTO offices (name, kind, grants_role, district_id, is_elected, sort_order)
SELECT 'Dean — ' || d.name, 'DEAN', NULL, d.id, TRUE, 50
FROM districts d
ON CONFLICT (name) DO NOTHING;

-- Carry across whoever each district currently records as its Dean.
INSERT INTO office_holdings (office_id, person_id, term_start, note, created_by)
SELECT o.id, p.id, CURRENT_DATE, 'carried over from the district record', 'migration 101'
FROM offices o
JOIN districts d ON d.id = o.district_id
JOIN people p ON lower(p.user_email) = lower(d.dean_email)
                 OR lower(p.email) = lower(d.dean_email)
WHERE o.kind = 'DEAN'
  AND d.dean_email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM office_holdings h WHERE h.office_id = o.id AND h.term_end IS NULL
  );

-- A district added later needs its Dean office creating; doing it here means
-- nobody has to remember.
CREATE OR REPLACE FUNCTION create_dean_office_for_district()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO offices (name, kind, grants_role, district_id, is_elected, sort_order)
  VALUES ('Dean — ' || NEW.name, 'DEAN', NULL, NEW.id, TRUE, 50)
  ON CONFLICT (name) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_district_dean_office ON districts;
CREATE TRIGGER trg_district_dean_office
  AFTER INSERT ON districts
  FOR EACH ROW EXECUTE FUNCTION create_dean_office_for_district();

-- Renaming a district should rename its Dean office with it.
CREATE OR REPLACE FUNCTION rename_dean_office_for_district()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE offices SET name = 'Dean — ' || NEW.name
     WHERE district_id = NEW.id AND kind = 'DEAN';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_district_dean_rename ON districts;
CREATE TRIGGER trg_district_dean_rename
  AFTER UPDATE ON districts
  FOR EACH ROW EXECUTE FUNCTION rename_dean_office_for_district();

COMMENT ON COLUMN districts.dean_email IS
  'Working copy of the current Dean, kept in step by Offices & Elections. Leave routing reads this.';
