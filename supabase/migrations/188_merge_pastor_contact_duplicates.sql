-- 188: one record each for Kathrin and for Paul Raj.
--
-- Went looking for the twenty-six people with no gender on file, to fill it in.
-- Two of them turned out not to be missing a field at all: they are the same
-- two people already in the directory under a second row, and that row has the
-- gender. Nothing can be derived for the other twenty-four — no IC, no
-- passport, no honorific, no salutation on the contact sheet they came from —
-- so they are left alone here and want a person to fill them in.
--
-- The pair is 164/165 meeting 169. The payroll import created a row from the
-- Employee Summary Report; the contact sheet import created another from the
-- church's own list. Neither could see the other, because the payroll row has
-- no email at all and the contact sheet has no IC — there was nothing to match
-- on. Only the names overlap, and they overlap loosely:
--
--   payroll        KATHRIN EVA ZAHA                          EMP-173
--   contact sheet  Kathrin Zaha Lee                          kathrin.zahalee@lcm.org.my
--   payroll        KUNASEKAR PALRAS A/L SAMUEL (PAUL RAJ)    EMP-175
--   contact sheet  Paul Raj                                  paul.raj@lcm.org.my
--
-- Neither row on its own is the person. The payroll row holds who they are —
-- IC or passport, date of birth, gender, marital status, date joined, the link
-- to their pay. The contact sheet row holds what they do — congregation,
-- district, ordination, posting — and how to reach them. Every field that is
-- set on one is blank on the other, with the single exception of the name.
--
-- So the payroll row survives, because it is the one the payroll table already
-- points at, and everything from the contact sheet row is written onto it.
--
-- ── Checked before writing this ───────────────────────────────────────────
-- All seven foreign keys onto people.id, read from pg_constraint rather than
-- from memory — ministry_verifiers, office_holdings, payroll_employees,
-- person_congregations, person_documents, person_involvements, person_notes.
-- The two rows being dropped are referenced by none of them, zero times. The
-- delete re-checks all seven rather than trusting this comment, so a row that
-- has gained a reference since is kept, not dropped.
--
-- And every text, varchar and json column in the public schema — 615 of them —
-- was searched for all four addresses. They appear on these people rows and
-- nowhere else: no notification, no congregation's head_pastor_email, no
-- district's dean_email. Deleting the rows without moving the addresses first
-- would erase them from the database outright, so the copy below runs before
-- the delete and the delete is conditional on it.
--
-- ── The name ──────────────────────────────────────────────────────────────
-- 171 merged two rows with differing names and deliberately did not touch
-- preferred_name: "choosing what a man is called on screen is not a decision to
-- make silently inside a merge." That was right there, where the difference was
-- a truncation — "Eddie" against "Eddie Kwan" — and nothing said which was
-- meant.
--
-- Here it is not a truncation. It is a legal name against a used name, which is
-- exactly what preferred_name is for, and the church's own contact sheet is the
-- evidence for what it calls them. AutoCount says as much itself in Paul Raj's
-- case: it carries "(PAUL RAJ)" in parentheses after the legal name. So the
-- legal name stays on full_name, where it matches the IC and the payslip, and
-- the used name goes to preferred_name, where the directory will display it.
-- Both names are in the note either way, and preferred_name is one field to
-- clear if this reads wrong.
--
-- After this, twenty-four people have no gender, not twenty-six.

BEGIN;

CREATE TEMP TABLE merge_pairs (keep_id UUID, drop_id UUID, used_name TEXT) ON COMMIT DROP;
INSERT INTO merge_pairs VALUES
  ('5618f664-a018-4107-b02d-299f7895e4f5', 'f55c6e1c-8c59-4290-bb26-7ce83f0e9b5c', 'Kathrin Zaha Lee'),
  ('f130d08d-16c2-4939-8259-821dbf8d3170', 'cebeb26b-b90a-4ea4-9d3e-63f6de96b8ad', 'Paul Raj');

-- Only ever fills a blank. COALESCE(keep, drop) means the payroll row wins any
-- field where both are set, so nothing already known is overwritten by the
-- contact sheet — which matters for is_employed, where the contact sheet says
-- false about two people who are demonstrably on the payroll.
UPDATE people k SET
  preferred_name  = COALESCE(k.preferred_name,  m.used_name),
  email           = COALESCE(k.email,           d.email),
  work_email      = COALESCE(k.work_email,      d.work_email),
  user_email      = COALESCE(k.user_email,      d.user_email),
  phone           = COALESCE(k.phone,           d.phone),
  alt_phone       = COALESCE(k.alt_phone,       d.alt_phone),
  address         = COALESCE(k.address,         d.address),
  congregation_id = COALESCE(k.congregation_id, d.congregation_id),
  district_id     = COALESCE(k.district_id,     d.district_id),
  posting         = COALESCE(k.posting,         d.posting),
  ordination      = COALESCE(k.ordination,      d.ordination),
  ministry_status = COALESCE(k.ministry_status, d.ministry_status),
  marital_status  = COALESCE(k.marital_status,  d.marital_status),
  bio             = COALESCE(k.bio,             d.bio),
  photo_path      = COALESCE(k.photo_path,      d.photo_path),
  updated_at      = now()
FROM merge_pairs m
JOIN people d ON d.id = m.drop_id
WHERE k.id = m.keep_id;

-- The names, kept where the profile page shows them. Tagged ADMIN and guarded
-- against a second run the same way 171 did — person_notes takes one of six
-- tags and there is no MERGE among them.
INSERT INTO person_notes (person_id, body, tag, author_name)
SELECT m.keep_id,
       'Merged with a second directory record for the same person (migration 188). '
    || 'The payroll import held the identity — ' || k.full_name
    || ' — and the contact sheet held the posting and contact details under the name '
    || d.full_name || '. Both are kept: the legal name on the record, the used name as '
    || 'the preferred name the directory displays.',
       'ADMIN', 'migration 188'
  FROM merge_pairs m
  JOIN people k ON k.id = m.keep_id
  JOIN people d ON d.id = m.drop_id
 WHERE NOT EXISTS (
         SELECT 1 FROM person_notes n
          WHERE n.person_id = m.keep_id
            AND n.author_name = 'migration 188');

-- Conditional on the copy above having landed, and on the row still being
-- referenced by nothing.
DELETE FROM people d
 USING merge_pairs m, people k
 WHERE d.id = m.drop_id
   AND k.id = m.keep_id
   AND (d.user_email IS NULL OR k.user_email = d.user_email)
   AND (d.email      IS NULL OR k.email      = d.email)
   AND (d.congregation_id IS NULL OR k.congregation_id = d.congregation_id)
   AND NOT EXISTS (SELECT 1 FROM ministry_verifiers   t WHERE t.person_id = d.id)
   AND NOT EXISTS (SELECT 1 FROM office_holdings      t WHERE t.person_id = d.id)
   AND NOT EXISTS (SELECT 1 FROM payroll_employees    t WHERE t.person_id = d.id)
   AND NOT EXISTS (SELECT 1 FROM person_congregations t WHERE t.person_id = d.id)
   AND NOT EXISTS (SELECT 1 FROM person_documents     t WHERE t.person_id = d.id)
   AND NOT EXISTS (SELECT 1 FROM person_involvements  t WHERE t.person_id = d.id)
   AND NOT EXISTS (SELECT 1 FROM person_notes         t WHERE t.person_id = d.id);

COMMIT;

SELECT p.full_name, p.preferred_name, p.gender, p.user_email, p.phone,
       p.ordination, p.congregation_id IS NOT NULL AS has_congregation,
       p.payroll_employee_id IS NOT NULL AS has_payroll
  FROM people p
 WHERE p.id IN ('5618f664-a018-4107-b02d-299f7895e4f5','f130d08d-16c2-4939-8259-821dbf8d3170');
