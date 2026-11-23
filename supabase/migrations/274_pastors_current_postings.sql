-- 274: the postings table gets the postings the directory already knows.
--
-- person_congregations has carried start_date, end_date and role for a while,
-- and the one-row-per-pair constraint is gone, so it can hold a pastor's whole
-- history — several churches, several spells, a return to one he served before.
-- It held four rows. Not four pastors' histories: four rows, none with a date,
-- against 73 active pastors. The panel was built and never filled.
--
-- Meanwhile the current posting *is* recorded, just not there. people.posting
-- says CONGREGATION for 65 of them and people.congregation_id names the church
-- — that is the pair migration 152 introduced, and it is what the app reads
-- today. So the opening row of each pastor's history already exists as a fact
-- about them; it simply was never written down as a period.
--
-- This writes it down. One row per active pastor who has a congregation on
-- their directory record, marked as the main posting, and nothing else.
--
-- ── What this deliberately does NOT invent ────────────────────────────────
-- No start dates. Nowhere in the database is it recorded when any of these
-- pastors was posted where they are, and date_commenced is not that date — a
-- man who joined LCM in 1987 has almost certainly served more than one church
-- since. Writing his commencement date against his current church would read
-- as thirty-nine years at one congregation, which is a fabricated history, so
-- the dates are left null and the panel says "No dates recorded" of its own
-- accord. That is the truth and it is the prompt to fill them in.
--
-- No prior postings either, for the same reason: the church knows them, the
-- database does not, and they have to be keyed from the personnel files.
--
-- role is left null too, because the panel already renders a posting with no
-- role as "Pastor", and is_primary is TRUE because this is where each of them
-- serves now.
--
-- ── Where the figures came from, and where two sources disagree ───────────
-- people.congregation_id is used throughout, not payroll_employees.church_name.
-- The first is a foreign key into congregations and is set for 64 of the
-- pastors; the second is free text and is set for 17. Where both exist they
-- agree 7 times and differ 9, and most of those nine are one church written
-- two ways — "11th Mile Cheras Lutheran Church" against "11th Mile Lutheran
-- Church", "Jelapang Lutheran Church" against "Sacramental Pastor - Jelapang
-- Our Saviour Lutheran Church", a circuit listed by its villages.
--
-- Two are not a spelling at all, and both are left exactly as the directory
-- has them so that a person decides rather than this file:
--
--   EMP-026  Kuan Poy Onn    directory Permai · payroll Petros · and he
--                            already has a posting row for Chempaka. Three
--                            churches in three places.
--   EMP-199  Khiew Sak Joon  directory Petros · payroll Penang Faith
--
-- Petros appearing on both sides, in opposite directions, looks like one
-- transfer recorded in one place and not the other. The final SELECT counts
-- the disagreements so they stay visible after this runs.

BEGIN;

CREATE TEMP TABLE to_seed ON COMMIT DROP AS
SELECT p.id AS person_id, p.congregation_id
  FROM people p
 WHERE p.category = 'PASTOR'
   AND p.status = 'ACTIVE'
   AND p.congregation_id IS NOT NULL
   -- Never a second row for a pair that already has one: the four rows that
   -- were there before this are somebody's typing and are left alone.
   AND NOT EXISTS (
     SELECT 1 FROM person_congregations pc
      WHERE pc.person_id = p.id
        AND pc.congregation_id = p.congregation_id);

DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM to_seed;
  IF n = 0 THEN
    RAISE EXCEPTION 'Nothing to seed — this has already run, or the directory has changed.';
  END IF;
  IF n > 75 THEN
    RAISE EXCEPTION 'Expected around 64 postings to seed, found %. That is more pastors than the directory had — look before running this.', n;
  END IF;
  RAISE NOTICE 'Seeding % postings.', n;
END $$;

INSERT INTO person_congregations (person_id, congregation_id, is_primary)
SELECT person_id, congregation_id, TRUE FROM to_seed;

-- Nothing may be duplicated by this, now or on a re-run.
DO $$
DECLARE dupes INT;
BEGIN
  SELECT count(*) INTO dupes FROM (
    SELECT person_id, congregation_id FROM person_congregations
     GROUP BY person_id, congregation_id HAVING count(*) > 1) d;
  IF dupes <> 0 THEN
    RAISE EXCEPTION '% person/congregation pair(s) now appear twice. Nothing has been changed.', dupes;
  END IF;
END $$;

-- Where this leaves the postings register, and what still wants a person.
SELECT (SELECT count(*) FROM person_congregations)                                AS posting_rows,
       (SELECT count(DISTINCT person_id) FROM person_congregations)               AS people_covered,
       (SELECT count(*) FROM people WHERE category='PASTOR' AND status='ACTIVE')  AS active_pastors,
       (SELECT count(*) FROM person_congregations WHERE start_date IS NOT NULL)   AS rows_with_a_start_date,
       (SELECT count(*) FROM people p
         WHERE p.category='PASTOR' AND p.status='ACTIVE' AND p.congregation_id IS NULL)
                                                                                  AS pastors_with_no_congregation,
       (SELECT count(*) FROM payroll_employees pe
          JOIN people ppl ON ppl.id = pe.person_id
          JOIN congregations c ON c.id = ppl.congregation_id
         WHERE pe.status='ACTIVE' AND pe.is_pastor
           AND COALESCE(pe.church_name,'') <> ''
           AND lower(btrim(c.name)) <> lower(btrim(pe.church_name)))              AS payroll_disagreements;

COMMIT;
