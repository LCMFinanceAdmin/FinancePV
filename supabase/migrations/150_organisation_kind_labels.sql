-- 150: keep the wording the organisations page already used.
--
-- 149 seeded organisation_kinds from the constraint values, which are terser
-- than what the page actually showed: it grouped under "Companion Churches"
-- and described them as church bodies overseas that walk with LCM. Taking the
-- list out of code should not quietly reword the screen.
--
-- plural_label exists because the page needs both — a filter chip reads
-- "Companion Churches", the picker reads "Companion Church" — and deriving one
-- from the other means guessing at English plurals.
ALTER TABLE organisation_kinds ADD COLUMN IF NOT EXISTS plural_label TEXT;

UPDATE organisation_kinds SET label = v.label, plural_label = v.plural, description = v.descr
FROM (VALUES
  ('PARTNER_CHURCH', 'Companion Church', 'Companion Churches',
   'Lutheran church bodies overseas that walk with LCM'),
  ('INSTITUTION',    'Institution',      'Institutions',
   'Study centres, schools and training bodies'),
  ('TRUST',          'Trust',            'Trusts',
   'Bodies holding property or funds for the church'),
  ('COMPANY',        'Company',          'Companies',
   'Enterprises associated with LCM'),
  ('FOUNDATION',     'Foundation',       'Foundations',
   'Charitable foundations supporting the work'),
  ('MISSION_AGENCY', 'Mission Agency',   'Mission Agencies',
   'Sending and mission societies'),
  ('OTHER',          'Other',            'Other',
   'Anyone else LCM works closely with')
) AS v(key, label, plural, descr)
WHERE organisation_kinds.key = v.key;

-- A kind added later without one falls back to its own label, which reads
-- acceptably on a chip and is better than an empty heading.
UPDATE organisation_kinds SET plural_label = label WHERE plural_label IS NULL;
