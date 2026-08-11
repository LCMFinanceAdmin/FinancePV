-- 104: Committees, appointed roles, and a person's service record.
--
-- Two gaps.
--
-- First, not every post is an elected office held by one person. The BAM
-- Committee has several members; the Building Manager is appointed, not
-- elected. Both carry real authority — a BAM Committee member verifies
-- building vouchers — so they belong on the register, but the one-holder rule
-- would have refused the second committee member.
--
-- Second, office_holdings already records every term ever served. What was
-- missing was a way to read it the other way round: not "who is Bishop" but
-- "what has this person held, and when". The data was there; this makes it
-- reachable and adds the posts that were missing from it.

-- A committee admits several members at once; an office admits one.
ALTER TABLE offices
  ADD COLUMN IF NOT EXISTS single_holder BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE offices DROP CONSTRAINT IF EXISTS offices_kind_check;
ALTER TABLE offices ADD CONSTRAINT offices_kind_check
  CHECK (kind IN ('CHURCH', 'EXCO', 'DEAN', 'APPOINTED', 'COMMITTEE'));

-- The one-holder rule now depends on the office, which a partial unique index
-- cannot express — it would have to read a column on another table. A trigger
-- can, and says the rule out loud.
DROP INDEX IF EXISTS idx_oh_one_current;

CREATE OR REPLACE FUNCTION enforce_single_holder()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  is_single BOOLEAN;
  taken     INT;
BEGIN
  IF NEW.term_end IS NOT NULL THEN
    RETURN NEW;  -- a closed term never conflicts
  END IF;

  SELECT single_holder INTO is_single FROM offices WHERE id = NEW.office_id;
  IF NOT COALESCE(is_single, TRUE) THEN
    RETURN NEW;  -- a committee may have as many members as it likes
  END IF;

  SELECT COUNT(*) INTO taken
    FROM office_holdings
   WHERE office_id = NEW.office_id
     AND term_end IS NULL
     AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF taken > 0 THEN
    RAISE EXCEPTION 'That office already has a holder. End the current term first.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_single_holder ON office_holdings;
CREATE TRIGGER trg_single_holder
  BEFORE INSERT OR UPDATE ON office_holdings
  FOR EACH ROW EXECUTE FUNCTION enforce_single_holder();

-- ── The posts that were missing ───────────────────────────────────────────
INSERT INTO offices (name, kind, grants_role, is_elected, single_holder, sort_order) VALUES
  ('Building / Event Manager', 'APPOINTED', 'BUILDING_MANAGER', FALSE, TRUE,  91),
  ('BAM Committee',            'COMMITTEE', 'BAM_COMMITTEE',    FALSE, FALSE, 92),
  ('Administrator',            'APPOINTED', 'ADMINISTRATOR',    FALSE, TRUE,  93)
ON CONFLICT (name) DO NOTHING;

-- Whoever currently holds these by their login is recorded as holding them.
-- The BAM Committee takes everyone, since it is not a single-holder post.
INSERT INTO office_holdings (office_id, person_id, term_start, note, created_by)
SELECT o.id, p.id, CURRENT_DATE, 'carried over from existing roles', 'migration 104'
FROM offices o
JOIN user_roles ur ON ur.role = o.grants_role
JOIN people p ON lower(p.user_email) = lower(ur.email)
WHERE o.name IN ('Building / Event Manager', 'BAM Committee', 'Administrator')
  AND NOT EXISTS (
    SELECT 1 FROM office_holdings h
     WHERE h.office_id = o.id AND h.person_id = p.id AND h.term_end IS NULL
  )
  -- For the single-holder posts, only seat someone if the post is free.
  AND (o.single_holder = FALSE OR NOT EXISTS (
    SELECT 1 FROM office_holdings h2 WHERE h2.office_id = o.id AND h2.term_end IS NULL
  ));

-- ── The service record ────────────────────────────────────────────────────
-- Everything a person has ever held, newest first, with the term counted.
-- A view rather than a table: it is a reading of office_holdings, and a copy
-- would be one more thing to keep in step.
CREATE OR REPLACE VIEW person_service_record AS
SELECT
  h.person_id,
  h.id            AS holding_id,
  o.id            AS office_id,
  o.name          AS office_name,
  o.kind          AS office_kind,
  o.is_elected,
  h.elected_on,
  h.term_start,
  h.term_end,
  h.note,
  (h.term_end IS NULL) AS is_current,
  -- Which term this is for this person in this office, counting from their
  -- first. "Bishop, second term" is the thing people actually say.
  ROW_NUMBER() OVER (
    PARTITION BY h.person_id, h.office_id ORDER BY h.term_start
  )               AS term_number
FROM office_holdings h
JOIN offices o ON o.id = h.office_id
ORDER BY h.term_start DESC;

GRANT SELECT ON person_service_record TO authenticated;

COMMENT ON VIEW person_service_record IS
  'Every office a person has held, with the term number — the résumé side of office_holdings';
