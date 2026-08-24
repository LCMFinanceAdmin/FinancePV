-- 165: what 164 left undone.
--
-- 164 loaded the 81 people on the September payroll run. Three things it did not
-- do, each of which changes what the app calculates or prints.
--
-- 1. Orang Asli workers contribute EPF at 11/13 rather than 11/16 and sit
--    outside the 13th-month payment. This is not an inference: the September run
--    shows 11/13 on every one of the fifteen. Left unset, the app would ask the
--    church for three percentage points more employer EPF on each of them.
--
-- 2. posting_type was set to OFFICE for everybody. The employee record prints
--    that as "Head Office", which is untrue of 59 pastors and 15 Orang Asli
--    workers. OTHER prints the department, which is what these reports actually
--    say. OFFICE is right for the five LCM Office Staff and stays.
--
-- 3. No directory record. The rule is that entering somebody on payroll creates
--    them in the People directory; 164 wrote to the table directly and so went
--    round it. Three are linked to directory records that already existed and
--    77 are created.
--
-- Ordination is deliberately left blank on all 59 pastors. Neither report
-- records who is a Reverend and who is a Pastor, and that title was very nearly
-- lost once already — a guess here would look like a record.

BEGIN;

-- 1. Orang Asli — the rate the September run actually applied.
UPDATE payroll_employees
   SET is_orang_asli = TRUE, updated_at = NOW()
 WHERE status = 'ACTIVE'
   AND department IN ('Orang Asli Ministry', 'Rumah Ros (Orang Asli)')
   AND is_orang_asli IS DISTINCT FROM TRUE;

-- The church's own report tags only its LCM Office Staff section as STAFF, and
-- this flag is a filter rather than anything that touches pay, so it follows.
UPDATE payroll_employees
   SET is_staff = TRUE, updated_at = NOW()
 WHERE status = 'ACTIVE' AND department = 'LCM Office Staff'
   AND is_staff IS DISTINCT FROM TRUE;

-- 2. Posting: say the department rather than claim Head Office.
UPDATE payroll_employees
   SET posting_type = 'OTHER', updated_at = NOW()
 WHERE status = 'ACTIVE' AND posting_type = 'OFFICE'
   AND department <> 'LCM Office Staff';

-- 3a. Three the directory already held under the same name. Matched by name
-- because the directory has no IC on file for anybody; the IC is copied across
-- so the next reconciliation has something firmer to match on.
UPDATE payroll_employees pe
   SET person_id = p.id, updated_at = NOW()
  FROM people p
 WHERE pe.emp_no IN ('EMP-007', 'EMP-059', 'EMP-164')
   AND pe.person_id IS NULL
   AND upper(p.full_name) = upper(pe.full_name);

UPDATE people p
   SET ic_no = pe.ic_no, dob = COALESCE(p.dob, pe.dob),
       date_joined = COALESCE(p.date_joined, pe.date_commenced),
       updated_at = NOW()
  FROM payroll_employees pe
 WHERE pe.person_id = p.id AND (p.ic_no IS NULL OR p.ic_no = '');

-- 3b. Everybody else gets the directory record they should have had. Bank
-- details are not copied: payroll holds them, and a second copy here would only
-- give the two somewhere to disagree.
INSERT INTO people (
  full_name, category, status, is_employed, ic_no, dob, marital_status,
  date_joined, hq_department, notes, created_by)
SELECT initcap(pe.full_name),
       CASE WHEN pe.is_pastor THEN 'PASTOR'
            WHEN pe.is_orang_asli THEN 'PARISH_WORKER'
            ELSE 'HQ_STAFF' END,
       'ACTIVE', TRUE,
       pe.ic_no, pe.dob, NULLIF(pe.marital_status, ''),
       pe.date_commenced,
       CASE WHEN pe.department = 'LCM Office Staff' THEN pe.department END,
       'Created from payroll ' || pe.emp_no || '.',
       'migration 165'
  FROM payroll_employees pe
 WHERE pe.status = 'ACTIVE' AND pe.person_id IS NULL AND pe.ic_no <> ''
   AND NOT EXISTS (SELECT 1 FROM people p WHERE p.ic_no = pe.ic_no);

-- The link itself. people.payroll_employee_id and is_employed follow by trigger.
UPDATE payroll_employees pe
   SET person_id = p.id, updated_at = NOW()
  FROM people p
 WHERE pe.status = 'ACTIVE' AND pe.person_id IS NULL
   AND pe.ic_no <> '' AND p.ic_no = pe.ic_no;

-- What this leaves behind, to be read against the reports it came from.
SELECT (SELECT count(*) FROM payroll_employees WHERE status='ACTIVE') AS payroll_active,
       (SELECT count(*) FROM payroll_employees WHERE status='ACTIVE' AND person_id IS NULL) AS unlinked,
       (SELECT count(*) FROM payroll_employees WHERE status='ACTIVE' AND is_orang_asli) AS orang_asli,
       (SELECT count(*) FROM people) AS people_total,
       (SELECT count(*) FROM people WHERE payroll_employee_id IS NOT NULL) AS people_on_payroll;

COMMIT;
