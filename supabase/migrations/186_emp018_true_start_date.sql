-- 186: Ho Chee Fatt's real start date, 1 March 1985.
--
-- 185 cleared the false one — his own date of birth, which the church's payroll
-- software had recorded as the day he joined and computed "72 years of service"
-- from. The true date is supplied by the church: 01/03/1985, read as 1 March
-- 1985 in the day-month-year form both the report and his IC use.
--
-- It checks out: born 10 September 1954, he began at 30, and the service that
-- follows is 41 years rather than 72.
--
-- This restores what the clearing cost him. Annual leave returns from the flat
-- 14 days to 25 and sick leave from 14 to 22, because both come from the
-- service bands and the bands had nothing to measure while the date was empty.
-- Nothing else has to change: leave_entitlement() reads the date live.
--
-- Written on both sides, as 185 cleared both. people.date_joined is where
-- service_start_for() looks when payroll has no date, so leaving it empty would
-- have made the two disagree the moment anybody edited one of them.

BEGIN;

UPDATE payroll_employees
   SET date_commenced = DATE '1985-03-01', updated_at = NOW()
 WHERE emp_no = 'EMP-018' AND date_commenced IS NULL;

UPDATE people p
   SET date_joined = DATE '1985-03-01', updated_at = NOW()
  FROM payroll_employees pe
 WHERE pe.person_id = p.id AND pe.emp_no = 'EMP-018' AND p.date_joined IS NULL;

-- The note from 185 says his leave is reduced and no true date is known. Both
-- halves are now untrue, and a note that has stopped being true is worse than
-- no note — somebody reading it would go looking for a problem that is fixed.
UPDATE person_notes n
   SET body = 'Start date corrected to 1 March 1985 by migration 186, supplied '
              || 'by the church. The payroll record and the Employee Summary '
              || 'Report had both given 10/09/1954, his date of birth, and the '
              || 'report computed "72 years of service" from it; 185 cleared '
              || 'that. Annual leave is 25 days again and sick leave 22. The '
              || 'source system may still hold the wrong date — worth checking '
              || 'before the next import.',
       author_name = 'migration 186',
       updated_at = NOW()
  FROM people p
  JOIN payroll_employees pe ON pe.person_id = p.id
 WHERE n.person_id = p.id AND pe.emp_no = 'EMP-018'
   AND n.author_name = 'migration 185';

SELECT pe.date_commenced,
       EXTRACT(YEAR FROM age(CURRENT_DATE, pe.date_commenced))::INT AS years_of_service,
       EXTRACT(YEAR FROM age(pe.date_commenced, pe.dob))::INT       AS age_when_he_started,
       leave_entitlement('ANNUAL',  'francis.ho@lcm.org.my') AS annual,
       leave_entitlement('MEDICAL', 'francis.ho@lcm.org.my') AS sick
  FROM payroll_employees pe WHERE pe.emp_no = 'EMP-018';

COMMIT;
