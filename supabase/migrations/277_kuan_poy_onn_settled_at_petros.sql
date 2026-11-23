-- 277: Kuan Poy Onn settled at Petros, and the register says so.
--
-- He is one of the two pastors 274 flagged, where the directory and payroll
-- name different churches. Resolved by the church: he served two congregations
-- at the same time and has since settled at Petros Lutheran Church, which is
-- what payroll EMP-026 has said all along.
--
-- What the register held before this:
--
--   directory congregation   Permai Lutheran Church
--   postings                 Chempaka  (no dates, open)
--                            Permai    (no dates, open, primary)
--   payroll church_name      Petros Lutheran Church
--
-- Two open postings is not the error. Serving several congregations at once is
-- ordinary here and the table is built for it — there is no one-row-per-person
-- constraint, the date ranges may overlap freely, and is_primary names the main
-- one. His Chempaka and Permai rows are that history, correctly shaped.
--
-- The error is that Petros, where he actually is, appears nowhere, and that
-- the two earlier spells are still open, so the app reads him as serving three
-- churches today.
--
-- This fixes the half that is known. Petros is added as his posting and made
-- the primary one, and his directory record is corrected to it. The earlier two
-- are left standing and are NOT closed, because closing a posting means giving
-- it an end date and no end date exists anywhere — not in the directory, not on
-- payroll, not in a note. A date invented here would read afterwards exactly
-- like one somebody had looked up, which is the one thing a register must never
-- do. They are to be dated by hand in the Postings panel, two fields each.
--
-- So after this he reads as: Petros, primary and current; Chempaka and Permai,
-- current until somebody ends them. That is one step better than before and
-- honest about what is still missing.

BEGIN;

CREATE TEMP TABLE kpo AS
SELECT p.id AS person_id,
       (SELECT c.id FROM congregations c WHERE c.name = 'Petros Lutheran Church') AS petros_id
  FROM people p
  JOIN payroll_employees pe ON pe.person_id = p.id AND pe.status = 'ACTIVE'
 WHERE p.full_name = 'Kuan Poy Onn'
   AND p.status = 'ACTIVE'
   AND pe.emp_no = 'EMP-026'
   -- Payroll is the evidence for Petros, so it has to still say it.
   AND btrim(pe.church_name) = 'Petros Lutheran Church';

DO $$
DECLARE n INT; petros INT;
BEGIN
  SELECT count(*) INTO n FROM kpo;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Expected 1 Kuan Poy Onn on EMP-026 with Petros on payroll, found %. Check the record before forcing this.', n;
  END IF;
  SELECT count(*) INTO petros FROM kpo WHERE petros_id IS NOT NULL;
  IF petros <> 1 THEN
    RAISE EXCEPTION 'Petros Lutheran Church is not in the congregations register. Nothing has been changed.';
  END IF;
END $$;

-- 1. Only one posting may be the main one, and from here it is Petros.
UPDATE person_congregations pc
   SET is_primary = FALSE
  FROM kpo k
 WHERE pc.person_id = k.person_id
   AND pc.is_primary;

-- 2. Petros, as a posting. Guarded so a second run adds nothing.
INSERT INTO person_congregations (person_id, congregation_id, is_primary)
SELECT k.person_id, k.petros_id, TRUE
  FROM kpo k
 WHERE NOT EXISTS (
   SELECT 1 FROM person_congregations pc
    WHERE pc.person_id = k.person_id AND pc.congregation_id = k.petros_id);

-- 3. And the directory record, which is what the rest of the app reads.
UPDATE people p
   SET congregation_id = k.petros_id,
       posting = 'CONGREGATION',
       updated_at = NOW()
  FROM kpo k
 WHERE p.id = k.person_id;

DO $$
DECLARE primaries INT; ok INT;
BEGIN
  SELECT count(*) INTO primaries
    FROM person_congregations pc
    JOIN people p ON p.id = pc.person_id
   WHERE p.full_name = 'Kuan Poy Onn' AND pc.is_primary;
  IF primaries <> 1 THEN
    RAISE EXCEPTION 'He has % main postings. Exactly one is allowed. Nothing has been changed.', primaries;
  END IF;

  SELECT count(*) INTO ok
    FROM people p
    JOIN congregations c ON c.id = p.congregation_id
    JOIN person_congregations pc ON pc.person_id = p.id AND pc.congregation_id = c.id AND pc.is_primary
   WHERE p.full_name = 'Kuan Poy Onn' AND c.name = 'Petros Lutheran Church';
  IF ok <> 1 THEN
    RAISE EXCEPTION 'The directory record and the main posting do not both say Petros. Nothing has been changed.';
  END IF;
END $$;

DROP TABLE kpo;

-- His postings as they now stand. Everything without an end date still reads
-- as current, which is the work left for a person.
SELECT c.name AS congregation, pc.is_primary, pc.start_date, pc.end_date,
       CASE WHEN pc.end_date IS NULL THEN 'reads as current' ELSE 'ended' END AS how_it_reads
  FROM person_congregations pc
  JOIN people p ON p.id = pc.person_id
  JOIN congregations c ON c.id = pc.congregation_id
 WHERE p.full_name = 'Kuan Poy Onn'
 ORDER BY pc.is_primary DESC, c.name;

COMMIT;
