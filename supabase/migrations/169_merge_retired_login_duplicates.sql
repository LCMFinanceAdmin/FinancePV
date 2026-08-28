-- 169: one directory record each for Jermaine and Eddie.
--
-- Migrations 158 and 159 retired two personal Gmail logins — an account that
-- could still sign in and act as the Bishop, and a second one that had never
-- been used. Both deleted the account and deliberately left the directory row:
-- "people.email, people.user_email and the INACTIVE directory record stay —
-- they are the record of who the account belonged to."
--
-- That held while the directory was a short list somebody read. It stopped
-- holding when 164 and 165 filled the directory with LCM's 81 employees. Both
-- leftover rows carry is_employed = true and category HQ_STAFF, so the People
-- Directory lists them as staff (greyed as "past", but listed), and the
-- Official Registers — which selects every people row with no status filter at
-- all — count each of these two men twice.
--
--   KEEP  Jermaine Aaron  <finance@lcm.org.my>           ACTIVE, payroll EMP-001,
--                                                        IC, DOB, date joined
--   DROP  Jermaine Aaron  <jermaineaaron1991@gmail.com>  INACTIVE, nothing else
--   KEEP  Eddie Kwan      <eddie.kwan@lcm.org.my>        ACTIVE
--   DROP  Eddie           <kpkwan63@gmail.com>           INACTIVE, nothing else
--
-- Checked before writing this, across all seven tables that hold a foreign key
-- onto people.id — office_holdings, person_involvements, person_documents,
-- person_notes, person_congregations, ministry_verifiers, payroll_employees:
-- both rows are referenced by none of them, zero times. That list is not from
-- memory; it is every FK in the database pointing at people.id, read from
-- pg_constraint. The delete below re-checks all seven rather than trusting this
-- comment, so a row that has gained something since is kept, not dropped.
--
-- ── The history, kept somewhere it can still be read ──────────────────────
-- Every text and json column in the public schema was searched for the two
-- addresses first, because 158 and 159 kept these rows precisely to preserve
-- them. What holds them today:
--
--   notifications.recipient_email    14 rows, jermaineaaron1991@gmail.com,
--                                    16 Jun – 4 Aug 2026. Keyed by email, not by
--                                    people.id, so this migration cannot touch
--                                    them and does not.
--   people.email / people.user_email the two rows being deleted here.
--
-- And nothing else. kpkwan63@gmail.com appears in no other column in the
-- database at all: deleting its row would erase the address outright. So each
-- address is written onto the surviving record as a person_notes entry before
-- the row goes — the person-history table from 112, which the profile page
-- shows, and which 112 itself used this same way to carry a free-text note
-- across rather than lose it.
--
-- One fact is recorded in that note and NOT written to a column: the dropped
-- row calls him "Eddie" where the survivor says "Eddie Kwan". That is the only
-- thing either copy holds that its survivor does not, and it would fit
-- preferred_name — but preferred_name is what the directory displays, and
-- choosing what a man is called on screen is not a decision to make silently
-- inside a merge. It is in the note; set it by hand if that is the intent.

BEGIN;

CREATE TEMP TABLE merge_pairs (keep_login TEXT, drop_login TEXT, retired_by TEXT)
  ON COMMIT DROP;
INSERT INTO merge_pairs VALUES
  ('finance@lcm.org.my',    'jermaineaaron1991@gmail.com', '158'),
  ('eddie.kwan@lcm.org.my', 'kpkwan63@gmail.com',          '159');

-- The pairs, resolved once so every step below works from the same rows. Keyed
-- on both logins: a row can only be merged into the person named above, never
-- into whoever else happens to share a name.
CREATE TEMP TABLE merges ON COMMIT DROP AS
SELECT mp.keep_login,
       mp.drop_login,
       mp.retired_by,
       keep.id       AS keep_id,
       dup.id        AS drop_id,
       dup.full_name AS drop_name
  FROM merge_pairs mp
  JOIN people keep ON lower(keep.user_email) = mp.keep_login
  JOIN people dup  ON lower(dup.user_email)  = mp.drop_login
 WHERE dup.id <> keep.id
   -- The retired account's record, still marked past by whoever retired it. If
   -- somebody has since made it active again, it is a record in use and this
   -- migration is not entitled to guess.
   AND dup.status = 'INACTIVE'
   AND dup.payroll_employee_id IS NULL;

-- Refuse to run on anything other than the two pairs described above. A partial
-- match means the directory has changed since this was written, and merging on
-- a guess is how one person's record absorbs another's.
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM merges;
  IF n <> 2 THEN
    RAISE EXCEPTION 'Expected 2 merges, found %. The directory has changed — re-check the pairs before running this.', n;
  END IF;
END $$;

-- 1. Write the retired address onto the record being kept, before anything is
--    deleted. Skipped if a note already names that address, so re-running this
--    migration does not stack up copies of the same entry.
INSERT INTO person_notes (person_id, body, tag, author_name)
SELECT m.keep_id,
       'Retired login ' || m.drop_login || ' — the directory record for it ("'
         || m.drop_name || '") was merged into this one by migration 169. The '
         || 'account itself was removed by migration ' || m.retired_by || '.'
         || CASE WHEN COALESCE(TRIM(d.notes), '') = '' THEN ''
                 ELSE ' Note carried across: ' || TRIM(d.notes) END,
       'ADMIN',
       'migration 169'
  FROM merges m
  JOIN people d ON d.id = m.drop_id
 WHERE NOT EXISTS (
         SELECT 1 FROM person_notes n
          WHERE n.person_id = m.keep_id
            AND n.body LIKE '%' || m.drop_login || '%');

-- 2. Carry across anything the surviving record is missing. Nothing today —
--    both copies were seeded from a login and never filled in, while the
--    survivors carry the IC, the date of birth and the payroll link. COALESCE
--    throughout regardless, so that a detail either row has gained since this
--    was written moves rather than being deleted with the row, and so that a
--    value already on the survivor always wins.
UPDATE people p SET
  preferred_name = COALESCE(NULLIF(p.preferred_name, ''), d.preferred_name),
  phone          = COALESCE(NULLIF(p.phone, ''),          d.phone),
  alt_phone      = COALESCE(NULLIF(p.alt_phone, ''),      d.alt_phone),
  address        = COALESCE(NULLIF(p.address, ''),        d.address),
  ic_no          = COALESCE(NULLIF(p.ic_no, ''),          d.ic_no),
  passport_no    = COALESCE(NULLIF(p.passport_no, ''),    d.passport_no),
  dob            = COALESCE(p.dob,                        d.dob),
  gender         = COALESCE(NULLIF(p.gender, ''),         d.gender),
  marital_status = COALESCE(NULLIF(p.marital_status, ''), d.marital_status),
  hq_department  = COALESCE(NULLIF(p.hq_department, ''),  d.hq_department),
  date_joined    = COALESCE(p.date_joined,                d.date_joined),
  photo_path     = COALESCE(NULLIF(p.photo_path, ''),     d.photo_path),
  bio            = COALESCE(NULLIF(p.bio, ''),            d.bio),
  district_id    = COALESCE(p.district_id,                d.district_id),
  updated_at     = NOW()
  FROM merges m
  JOIN people d ON d.id = m.drop_id
 WHERE p.id = m.keep_id;

-- 3. Remove the copy. Nothing references it — checked before this was written,
--    and re-checked here against all seven tables so the delete fails closed.
DELETE FROM people p
 USING merges m
 WHERE p.id = m.drop_id
   AND p.status = 'INACTIVE'
   AND NOT EXISTS (SELECT 1 FROM office_holdings      x WHERE x.person_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM person_involvements  x WHERE x.person_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM person_documents     x WHERE x.person_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM person_notes         x WHERE x.person_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM person_congregations x WHERE x.person_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM ministry_verifiers   x WHERE x.person_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM payroll_employees    x WHERE x.person_id = p.id);

-- Fail rather than half-finish. If a guard held a row back, the note has been
-- written and the duplicate is still in the directory, which is the one outcome
-- worse than doing nothing; the exception rolls the whole file back.
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM people
   WHERE lower(user_email) IN ('jermaineaaron1991@gmail.com', 'kpkwan63@gmail.com');
  IF n <> 0 THEN
    RAISE EXCEPTION '% duplicate row(s) survived the delete — something now references them. Nothing has been changed.', n;
  END IF;
END $$;

-- What this leaves: the two men, once each, and the addresses still on record.
SELECT (SELECT count(*) FROM people WHERE full_name ILIKE 'Jermaine%') AS jermaine_rows,
       (SELECT count(*) FROM people WHERE full_name ILIKE 'Eddie%')    AS eddie_rows,
       (SELECT count(*) FROM people)                                   AS people_total,
       (SELECT count(*) FROM person_notes WHERE author_name = 'migration 169')
                                                                       AS history_notes;

COMMIT;
