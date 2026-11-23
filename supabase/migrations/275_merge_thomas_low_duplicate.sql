-- 275: one directory record for the Bishop.
--
-- The People Directory holds two active PASTOR records for Low Kok Chan:
--
--   KEEP  9e112d27  Rt. Rev Bishop Thomas Low   bishopthomas@lcm.org.my
--                   IC and date of birth on file, married, joined 01/06/1987,
--                   posted HQ, work_email thomas.low@lcm.org.my, payroll
--                   EMP-043, and the Bishop's office. Seeded from user
--                   accounts on 11/08/2026.
--   DROP  dc025651  Low Kok Chan (Thomas)       mailto:bishopthomas@lcm.org.my
--                   No IC, no DOB, no dates, no payroll, no office. Keyed in
--                   by hq@lcm.org.my on 24/09/2026.
--
-- They are one man. The second record's email is the first record's address
-- with "mailto:" still attached — the href copied instead of the text it
-- labelled. That is also why migration 188, which merged the pastor contact
-- duplicates, did not catch this one: it matched on address, and these two
-- addresses are not equal as strings although they name the same mailbox.
--
-- Checked before writing this, against every one of the eight tables that now
-- holds a foreign key onto people.id — claim_entitlements, ministry_verifiers,
-- office_holdings, payroll_employees, person_congregations, person_documents,
-- person_involvements, person_notes. The record being dropped is referenced by
-- none of them, zero times; the record being kept holds the office and the
-- payroll link. That list is read from pg_constraint rather than copied from
-- 171, which named seven — claim_entitlements has been added since, and a
-- merge that checked the old list would have been checking the wrong thing.
--
-- ── What the duplicate holds, and what happens to it ──────────────────────
-- Field by field, it carries exactly one thing the Bishop's record does not:
--
--   affiliation = LCM_MEMBER   carried across below. A real value, on six
--                              other people.
--   email       mailto:bishopthomas@lcm.org.my   the same address, malformed.
--   phone       the same number, written without its separator.
--   full_name   Low Kok Chan (Thomas)             his legal name.
--
-- Nothing is lost by deleting it. The address and the number are the ones the
-- surviving record already has, better written. The legal name is not a
-- casualty either: payroll_employees EMP-043 is "LOW KOK CHAN (THOMAS)" and
-- stays so, which is where a legal name belongs — it is what goes on an EPF
-- form. The directory keeps the name he is addressed by, which is what a
-- directory is for. So there is no note to write here, unlike 169, where
-- deleting a row would have erased an address held nowhere else.
--
-- This was one record typed once: hq@lcm.org.my created exactly one person
-- that day, and this is the only row in the table whose email begins
-- "mailto:". So there is no import still misbehaving and no family of
-- siblings to find — checked, because a second duplicate found next month
-- would mean this file fixed a symptom.

BEGIN;

CREATE TEMP TABLE merge AS
SELECT keep.id AS keep_id, dup.id AS drop_id
  FROM people keep
  JOIN people dup ON dup.id = 'dc025651-44d0-4185-ba27-3275376cecba'
 WHERE keep.id = '9e112d27-7c25-499b-95a1-847e5485ab9b'
   -- Both halves identified by what distinguishes them, not by id alone, so
   -- this cannot run against rows that have been edited into something else.
   -- Stated as presence and absence rather than by value: an IC number is the
   -- single most sensitive field on the record and does not belong in a file
   -- that lives in the repository. Presence is as strong a key here anyway —
   -- the copy has neither an IC nor a payroll link, and the Bishop has both.
   AND lower(keep.user_email) = 'bishopthomas@lcm.org.my'
   AND keep.ic_no IS NOT NULL
   AND keep.payroll_employee_id IS NOT NULL
   AND lower(dup.email) = 'mailto:bishopthomas@lcm.org.my'
   AND dup.ic_no IS NULL
   AND dup.payroll_employee_id IS NULL;

DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM merge;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Expected 1 merge, found %. One of the two records has changed since this was written — re-check both before running it.', n;
  END IF;
END $$;

-- 1. Carry across anything the surviving record is missing. Only affiliation
--    today; the rest is listed so that a detail added to either row between
--    this being written and run moves rather than being deleted with the row,
--    and so a value already on the Bishop's record always wins.
UPDATE people p SET
  affiliation    = COALESCE(NULLIF(p.affiliation, ''),    d.affiliation),
  phone          = COALESCE(NULLIF(p.phone, ''),          d.phone),
  alt_phone      = COALESCE(NULLIF(p.alt_phone, ''),      d.alt_phone),
  address        = COALESCE(NULLIF(p.address, ''),        d.address),
  ic_no          = COALESCE(NULLIF(p.ic_no, ''),          d.ic_no),
  passport_no    = COALESCE(NULLIF(p.passport_no, ''),    d.passport_no),
  dob            = COALESCE(p.dob,                        d.dob),
  gender         = COALESCE(NULLIF(p.gender, ''),         d.gender),
  marital_status = COALESCE(NULLIF(p.marital_status, ''), d.marital_status),
  date_joined    = COALESCE(p.date_joined,                d.date_joined),
  photo_path     = COALESCE(NULLIF(p.photo_path, ''),     d.photo_path),
  bio            = COALESCE(NULLIF(p.bio, ''),            d.bio),
  updated_at     = NOW()
  FROM merge m
  JOIN people d ON d.id = m.drop_id
 WHERE p.id = m.keep_id;

-- 2. Remove the copy. Nothing references it — checked before this was written
--    and re-checked here against all eight tables, so the delete fails closed
--    if anything has attached itself since.
DELETE FROM people p
 USING merge m
 WHERE p.id = m.drop_id
   AND lower(p.email) = 'mailto:bishopthomas@lcm.org.my'
   AND NOT EXISTS (SELECT 1 FROM claim_entitlements   x WHERE x.person_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM ministry_verifiers   x WHERE x.person_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM office_holdings      x WHERE x.person_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM payroll_employees    x WHERE x.person_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM person_congregations x WHERE x.person_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM person_documents     x WHERE x.person_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM person_involvements  x WHERE x.person_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM person_notes         x WHERE x.person_id = p.id);

-- 3. Fail rather than half-finish: a carried field written next to a duplicate
--    still standing is worse than having done nothing.
DO $$
DECLARE survived INT; bishop INT;
BEGIN
  SELECT count(*) INTO survived FROM people
   WHERE id = 'dc025651-44d0-4185-ba27-3275376cecba';
  IF survived <> 0 THEN
    RAISE EXCEPTION 'The duplicate is still here — something now references it. Nothing has been changed.';
  END IF;

  SELECT count(*) INTO bishop FROM people
   WHERE lower(COALESCE(email,'')) LIKE '%bishopthomas@lcm.org.my'
      OR lower(COALESCE(user_email,'')) = 'bishopthomas@lcm.org.my';
  IF bishop <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 record for that address afterwards, found %. Nothing has been changed.', bishop;
  END IF;
END $$;

DROP TABLE merge;

-- One man, one record, and nothing left carrying a copied href.
SELECT p.full_name, p.email, p.user_email, p.affiliation, p.posting,
       (SELECT pe.emp_no FROM payroll_employees pe WHERE pe.person_id = p.id) AS payroll,
       (SELECT count(*) FROM office_holdings o WHERE o.person_id = p.id AND o.term_end IS NULL) AS open_offices,
       (SELECT count(*) FROM people WHERE email ILIKE 'mailto:%') AS mailto_rows_left,
       (SELECT count(*) FROM people WHERE category='PASTOR' AND status='ACTIVE') AS active_pastors
  FROM people p
 WHERE p.id = '9e112d27-7c25-499b-95a1-847e5485ab9b';

COMMIT;
