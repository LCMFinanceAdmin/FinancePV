-- 168: one directory record per person, and a login that reaches their pay.
--
-- Migration 165 created a directory record for every payroll employee who did
-- not already have one, matching on the name as written. That matched exactly:
-- the directory holds "Rt. Rev Bishop Thomas Low" and payroll holds
-- "LOW KOK CHAN (THOMAS)", which is one man and two spellings, so 165 made him
-- a second record. Five people were duplicated that way, and all five are
-- office holders with logins — the Bishop, the Secretary, the General Manager,
-- the Administrator and the Mission EXCO member.
--
-- The consequence was not only an untidy directory. my_payroll_employee_id()
-- resolves login -> people.user_email -> people.id -> payroll_employees, and
-- the payroll record pointed at the copy, which has no login. So My Salary
-- showed these five nothing.
--
-- Each pair is keyed on BOTH the login and the employee number below, so a row
-- can only be merged into the person this migration actually names. The
-- matching evidence, for the record:
--
--   EMP-019  David Ho Chee Way        <secretary@lcm.org.my>     all four name words
--   EMP-043  Rt. Rev Bishop Thomas Low <bishopthomas@lcm.org.my>  Low + Thomas, sole match
--   EMP-139  Eric Mau                 <mission@lcm.org.my>       Mau + Eric, sole match
--   EMP-205  Jeffrey Koit             <jeff.koit@lcm.org.my>     Koit + Jeffrey, sole match
--   EMP-206  Lyvia Chan Lam Yeng      <hq@lcm.org.my>            all four name words
--
-- Each duplicate was checked before writing this: none carries an office, an
-- involvement, a document, a note, a congregation or a verifier delegation, and
-- every one is stamped created_by = 'migration 165'. The delete below re-checks
-- that stamp rather than trusting this comment, so a record somebody has since
-- edited by hand is left alone.

BEGIN;

CREATE TEMP TABLE merge_pairs (login TEXT, emp_no TEXT) ON COMMIT DROP;
INSERT INTO merge_pairs VALUES
  ('secretary@lcm.org.my',    'EMP-019'),
  ('bishopthomas@lcm.org.my', 'EMP-043'),
  ('mission@lcm.org.my',      'EMP-139'),
  ('jeff.koit@lcm.org.my',    'EMP-205'),
  ('hq@lcm.org.my',           'EMP-206');

-- The pairs, resolved once so every step below works from the same rows.
CREATE TEMP TABLE merges ON COMMIT DROP AS
SELECT mp.emp_no,
       pe.id   AS employee_id,
       acct.id AS keep_id,
       dup.id  AS drop_id
  FROM merge_pairs mp
  JOIN payroll_employees pe ON pe.emp_no = mp.emp_no AND pe.status = 'ACTIVE'
  JOIN people acct ON lower(acct.user_email) = mp.login
  JOIN people dup  ON dup.id = pe.person_id
 WHERE dup.id <> acct.id
   AND dup.created_by = 'migration 165';

-- Refuse to run on anything other than the five pairs described above. A
-- partial match here would mean the directory has changed since this was
-- written, and guessing at that is how the wrong person gets shown a salary.
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM merges;
  IF n <> 5 THEN
    RAISE EXCEPTION 'Expected 5 merges, found %. The directory has changed — re-check the pairs before running this.', n;
  END IF;
END $$;

-- 1. Carry the payroll-sourced facts onto the record being kept. COALESCE
--    throughout: the account record is the one people have edited, so anything
--    already filled in there wins over the copy.
UPDATE people p SET
  ic_no          = COALESCE(NULLIF(p.ic_no, ''), d.ic_no),
  dob            = COALESCE(p.dob, d.dob),
  date_joined    = COALESCE(p.date_joined, d.date_joined),
  marital_status = COALESCE(NULLIF(p.marital_status, ''), d.marital_status),
  hq_department  = COALESCE(NULLIF(p.hq_department, ''), d.hq_department),
  updated_at     = NOW()
  FROM merges m
  JOIN people d ON d.id = m.drop_id
 WHERE p.id = m.keep_id;

-- 2. Point the payroll record at the record that has the login. The trigger
--    from 157 moves people.payroll_employee_id and is_employed to match.
UPDATE payroll_employees pe
   SET person_id = m.keep_id, updated_at = NOW()
  FROM merges m
 WHERE pe.id = m.employee_id;

-- 3. Remove the copy. Nothing references it — checked above, and re-checked
--    here so a row that gained something since is kept rather than dropped.
DELETE FROM people p
 USING merges m
 WHERE p.id = m.drop_id
   AND p.created_by = 'migration 165'
   AND NOT EXISTS (SELECT 1 FROM office_holdings     x WHERE x.person_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM person_involvements x WHERE x.person_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM person_documents    x WHERE x.person_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM person_notes        x WHERE x.person_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM person_congregations x WHERE x.person_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM ministry_verifiers  x WHERE x.person_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM payroll_employees   x WHERE x.person_id = p.id);

-- What this leaves: how many people can now open My Salary, and proof that
-- nobody ended up holding two directory records.
SELECT (SELECT count(*) FROM payroll_employees pe
          JOIN people p ON p.id = pe.person_id
         WHERE pe.status = 'ACTIVE' AND p.user_email IS NOT NULL AND p.user_email <> ''
       ) AS can_open_my_salary,
       (SELECT count(*) FROM people)                                   AS people_total,
       (SELECT count(*) FROM people WHERE created_by = 'migration 165') AS still_from_165;

COMMIT;
