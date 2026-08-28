-- 185: remove a start date that is somebody's date of birth.
--
-- EMP-018, Ho Chee Fatt (Francis), carried date_commenced 1954-09-10 — the
-- same day as his own birth, and the same as the IC on his record. It is not a
-- parsing mistake on our side: the Employee Summary Report prints
-- "Date Joined 10/09/1954" and computes "Service Period 72 Year(s)" from it,
-- so the error sits in the church's payroll software and has already
-- propagated once.
--
-- The church chose to clear it rather than keep a date known to be false or
-- substitute a guess. What that costs is stated plainly here because it is a
-- real cost to a real person: with no start date the service bands cannot
-- apply, so his annual leave falls from 25 days to the flat 14 and his sick
-- leave from 22 to 14. He is 71 and has served long enough for the top band of
-- both. Recording his true start date restores them with no further change —
-- leave_entitlement() reads it live.
--
-- people.date_joined is cleared too. service_start_for() falls back to it when
-- payroll has none, and 165 copied the same wrong value across, so clearing
-- only one side would leave the error still in force and harder to find.
--
-- The original is kept as a note against the person, not thrown away: it is
-- the evidence of what the source system said, and the thing to compare
-- against when somebody digs out his letter of appointment.

BEGIN;

INSERT INTO person_notes (person_id, body, tag, author_name)
SELECT p.id,
       'Start date cleared by migration 185. The payroll record and the '
       || 'Employee Summary Report both gave 10/09/1954 as the date joined, '
       || 'which is his date of birth — the report computed "72 years of '
       || 'service" from it. No true start date is known. Until one is '
       || 'recorded his annual leave shows 14 days rather than 25, and his '
       || 'sick leave 14 rather than 22; entering the correct date restores '
       || 'both automatically.',
       'ADMIN', 'migration 185'
  FROM people p
  JOIN payroll_employees pe ON pe.person_id = p.id
 WHERE pe.emp_no = 'EMP-018'
   AND NOT EXISTS (
     SELECT 1 FROM person_notes n
      WHERE n.person_id = p.id AND n.author_name = 'migration 185');

UPDATE payroll_employees
   SET date_commenced = NULL, updated_at = NOW()
 WHERE emp_no = 'EMP-018' AND date_commenced = dob;

UPDATE people p
   SET date_joined = NULL, updated_at = NOW()
  FROM payroll_employees pe
 WHERE pe.person_id = p.id AND pe.emp_no = 'EMP-018'
   AND p.date_joined = p.dob;

-- Nobody else should be in this state. If this returns more than zero, the
-- same fault has arrived again with a later import.
SELECT count(*) AS others_still_starting_before_they_were_16
  FROM payroll_employees
 WHERE status = 'ACTIVE' AND dob IS NOT NULL AND date_commenced IS NOT NULL
   AND EXTRACT(YEAR FROM age(date_commenced, dob))::INT < 16;

COMMIT;
