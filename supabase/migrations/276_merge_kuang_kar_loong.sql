-- 276: Kuang Kar Loong's congregation, which turns out to be a merge.
--
-- Reported as a gap: his directory record says posting = CONGREGATION with no
-- congregation set, while payroll EMP-214 says Truth Lutheran Church. Asked to
-- set the congregation. It is already set — on his other record.
--
--   KEEP  b4f586f3  created 24/08/2026 by migration 165, from payroll EMP-075.
--                   Congregation Truth Lutheran Church, district, ordination
--                   REVEREND, gender, marital status, phone, personal email,
--                   user_email and work_email karloong.kuang@lcm.org.my, and
--                   the posting row 274 wrote for him. No payroll link.
--   DROP  af84e125  created 20/11/2026 by finance@lcm.org.my. Carries the
--                   payroll link to EMP-214 and ministry_status, and nothing
--                   else at all — no congregation, no email, no phone.
--
-- One man, two records, three days old. EMP-214 was keyed in on 20 November
-- and the person it was linked to was created new rather than matched to the
-- record already in the directory, so the payroll link and everything else
-- about him ended up in different places. That is why the congregation looked
-- missing: the question was asked of the record that has never had one.
--
-- There is no second payroll record, checked: EMP-214 is the only one, it has
-- two salary revisions and no payslip lines, so nobody has been paid twice and
-- nothing needs unwinding. EMP-075 is the number migration 165 read him from
-- in August and no longer exists; the note on the surviving record still
-- names it, which is a true record of where that record came from.
--
-- So nothing is set here. The payroll record is pointed at the man who has the
-- congregation, and the empty copy goes.
--
-- Checked against all eight tables holding a foreign key onto people.id, read
-- from pg_constraint: the copy is referenced only by payroll_employees, which
-- step 1 moves. The record kept holds his posting row and nothing else points
-- at the copy — no entitlement, no office, no document, no note, no
-- involvement, no verifier delegation.
--
-- The one field the copy holds that the survivor lacks, ministry_status, is
-- carried across. Its full_name is the payroll spelling in capitals, which is
-- not lost: payroll_employees keeps it, which is where a legal name belongs.

BEGIN;

CREATE TEMP TABLE merge AS
SELECT keep.id AS keep_id, dup.id AS drop_id, pe.id AS employee_id
  FROM people keep
  JOIN people dup ON dup.full_name = keep.full_name AND dup.id <> keep.id
  JOIN payroll_employees pe ON pe.person_id = dup.id AND pe.status = 'ACTIVE'
 WHERE keep.full_name = 'Kuang Kar Loong'
   -- The record that has his life on it: the congregation named in the report,
   -- and the stamp of the migration that built it.
   AND keep.congregation_id = (SELECT id FROM congregations WHERE name = 'Truth Lutheran Church')
   AND keep.created_by = 'migration 165'
   AND keep.payroll_employee_id IS NULL
   -- The record that has only the payroll link.
   AND dup.congregation_id IS NULL
   AND dup.payroll_employee_id IS NOT NULL;

DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM merge;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Expected 1 merge, found %. Either this has run already, or one of the two records has changed — look at both before forcing it.', n;
  END IF;
END $$;

-- 1. Carry across what the copy holds and the survivor does not.
UPDATE people p SET
  ministry_status = COALESCE(NULLIF(p.ministry_status, ''), d.ministry_status),
  ic_no           = COALESCE(NULLIF(p.ic_no, ''),           d.ic_no),
  dob             = COALESCE(p.dob,                         d.dob),
  date_joined     = COALESCE(p.date_joined,                 d.date_joined),
  phone           = COALESCE(NULLIF(p.phone, ''),           d.phone),
  address         = COALESCE(NULLIF(p.address, ''),         d.address),
  updated_at      = NOW()
  FROM merge m
  JOIN people d ON d.id = m.drop_id
 WHERE p.id = m.keep_id;

-- 2. Point the payroll record at the man who has the congregation. The trigger
--    trg_payroll_person_link moves people.payroll_employee_id and is_employed
--    to follow, which is why neither is written by hand here.
UPDATE payroll_employees pe
   SET person_id = m.keep_id, updated_at = NOW()
  FROM merge m
 WHERE pe.id = m.employee_id;

-- 3. Remove the copy, now that nothing points at it. Re-checked against all
--    eight tables so the delete fails closed rather than cascading.
DELETE FROM people p
 USING merge m
 WHERE p.id = m.drop_id
   AND NOT EXISTS (SELECT 1 FROM claim_entitlements   x WHERE x.person_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM ministry_verifiers   x WHERE x.person_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM office_holdings      x WHERE x.person_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM payroll_employees    x WHERE x.person_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM person_congregations x WHERE x.person_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM person_documents     x WHERE x.person_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM person_involvements  x WHERE x.person_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM person_notes         x WHERE x.person_id = p.id);

-- 4. One man, one record, holding both the church and the pay.
DO $$
DECLARE rows_left INT; linked INT;
BEGIN
  SELECT count(*) INTO rows_left FROM people WHERE full_name = 'Kuang Kar Loong';
  IF rows_left <> 1 THEN
    RAISE EXCEPTION 'Expected 1 record for him afterwards, found %. Nothing has been changed.', rows_left;
  END IF;

  SELECT count(*) INTO linked
    FROM people p
    JOIN payroll_employees pe ON pe.person_id = p.id
    JOIN congregations c ON c.id = p.congregation_id
   WHERE p.full_name = 'Kuang Kar Loong'
     AND pe.emp_no = 'EMP-214'
     AND c.name = 'Truth Lutheran Church'
     AND p.payroll_employee_id = pe.id;
  IF linked <> 1 THEN
    RAISE EXCEPTION 'The surviving record does not hold both EMP-214 and Truth Lutheran Church. Nothing has been changed.';
  END IF;
END $$;

DROP TABLE merge;

SELECT p.full_name, c.name AS congregation, p.posting, p.ordination,
       pe.emp_no, p.is_employed,
       (SELECT count(*) FROM person_congregations pc WHERE pc.person_id = p.id) AS posting_rows,
       (SELECT count(*) FROM people WHERE category='PASTOR' AND status='ACTIVE') AS active_pastors
  FROM people p
  LEFT JOIN congregations c ON c.id = p.congregation_id
  LEFT JOIN payroll_employees pe ON pe.person_id = p.id
 WHERE p.full_name = 'Kuang Kar Loong';

COMMIT;
