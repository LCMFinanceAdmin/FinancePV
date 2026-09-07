-- 190: Ho Chee Fatt commenced January 1984.
--
-- The third and, one hopes, last correction to this date. 164 imported
-- 10/09/1954 from AutoCount, which is his date of birth and gave him a
-- "Service Period" of 72 years. 185 cleared it rather than leave a number
-- nobody could defend. 186 recorded 01/03/1985 on the Finance Executive's word.
-- 190 moves it to January 1984 on the same authority, which supersedes it.
--
-- The day is an assumption and is recorded as one. What was given was a month
-- and a year; 1 January is the convention this file adopts for that, and it is
-- the earliest day in the stated month, so no service is credited that was not
-- stated. If the exact day surfaces, it is one line here.
--
-- Nothing downstream changes shape. His leave sits in the top band either way
-- — 25 days annual, 22 sick, both at "20 years and over" — so this moves the
-- figure on his record and not his entitlement. It stays comfortably inside
-- 187's constraint, which requires a start date strictly after a birth date.
--
-- Written to both tables. 165 copies date_commenced onto people.date_joined and
-- nothing keeps them in step afterwards, so correcting one alone leaves the
-- directory disagreeing with payroll about the same man.
--
-- The source system still holds the original. AutoCount is a separate Windows
-- application with its own database and no reachable interface, so it cannot be
-- corrected from here: employee 018, field Date Joined, wants setting by hand.
-- Until somebody does, the next import brings 1954 back — and will now be
-- refused by 187 rather than accepted silently, which is the whole point of
-- that constraint.

UPDATE payroll_employees
   SET date_commenced = DATE '1984-01-01',
       revised_note = TRIM(BOTH ' ' FROM
         COALESCE(NULLIF(revised_note, ''), '') ||
         ' Commencement corrected to January 1984 (migration 190); day assumed as the 1st.'),
       updated_at = NOW()
 WHERE emp_no = 'EMP-018';

UPDATE people p
   SET date_joined = DATE '1984-01-01',
       updated_at = NOW()
  FROM payroll_employees pe
 WHERE pe.emp_no = 'EMP-018'
   AND p.id = pe.person_id;

INSERT INTO person_notes (person_id, body, tag, author_name)
SELECT pe.person_id,
       'Commencement date corrected to January 1984, superseding the 1 March 1985 '
    || 'recorded by migration 186 and the 10 September 1954 imported from AutoCount, '
    || 'which was his date of birth. Recorded as 1 January 1984: a month and year were '
    || 'given, and the 1st is the earliest day in that month, so no service is credited '
    || 'that was not stated. The payroll software still holds the original value.',
       'EMPLOYMENT', 'migration 190'
  FROM payroll_employees pe
 WHERE pe.emp_no = 'EMP-018'
   AND pe.person_id IS NOT NULL
   AND NOT EXISTS (
         SELECT 1 FROM person_notes n
          WHERE n.person_id = pe.person_id
            AND n.author_name = 'migration 190');

SELECT pe.emp_no, pe.full_name, pe.dob, pe.date_commenced,
       p.date_joined AS directory_date_joined,
       EXTRACT(YEAR FROM age(CURRENT_DATE, pe.date_commenced))::INT AS years_of_service,
       leave_entitlement('ANNUAL',  p.user_email) AS annual_days,
       leave_entitlement('MEDICAL', p.user_email) AS sick_days
  FROM payroll_employees pe
  LEFT JOIN people p ON p.id = pe.person_id
 WHERE pe.emp_no = 'EMP-018';
