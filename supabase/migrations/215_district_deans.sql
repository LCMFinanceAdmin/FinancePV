-- 215: the six District Deans.
--
-- Named by the General Manager, 16 September 2026. Central District 1 already
-- held Tan Hee Ming and matches the list, so five are new.
--
--   Orang Asli District   Andry A/L Alang           andry.alang@lcm.org.my
--   Northern District     Koo Chia En (Daniel)      daniel.koo@lcm.org.my
--   Central District 1    Tan Hee Ming              heeming.tan@lcm.org.my   (already held)
--   Central District 2    Tan Sink Dark (Phillip)   philip.tan@lcm.org.my
--   Central District 3    Alvin Tan Wei Jianh       alvin.tan@lcm.org.my
--   Southern District     Goh Young Kian (Andrew)   andrew.goh@lcm.org.my
--
-- The names as given differ slightly from the directory — Daniel Koo Cia En is
-- recorded as Koo Chia En (Daniel), Andreh Goh Young Kian as Goh Young Kian
-- (Andrew). Each matched exactly one person, and the directory then confirmed
-- the appointment independently: every one of the six is a REVEREND serving a
-- church in precisely the district they are being given. That is the rule the
-- Dean's post carries, and it agreeing with a list drawn up elsewhere is the
-- best evidence available that the right people have been matched.
--
-- Written through set_district_dean rather than by setting districts.dean_email,
-- because the Dean goes on the register: the function opens a term, closes any
-- term it replaces, and keeps the derived column in step. Setting the column by
-- hand would give the districts table the right answer and the office register
-- no record of how it got there.
--
-- That function asks who is calling and admits only Finance or the General
-- Manager, which as a migration is nobody. The claim below runs the function's
-- own code path as the account the General Manager works from, rather than
-- going around the check — the alternative was to reimplement the term handling
-- here and have two descriptions of it.

DO $$
DECLARE
  r         RECORD;
  v_person  UUID;
  v_dist    UUID;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"email":"finance@lcm.org.my","role":"authenticated"}', true);

  FOR r IN
    SELECT * FROM (VALUES
      ('Orang Asli District',  'Andry A/L Alang'),
      ('Northern District',    'Koo Chia En (Daniel)'),
      ('Central District 1',   'Tan Hee Ming'),
      ('Central District 2',   'Tan Sink Dark (Phillip)'),
      ('Central District 3',   'Alvin Tan Wei Jianh'),
      ('Southern District',    'Goh Young Kian (Andrew)')
    ) AS t(district, person)
  LOOP
    SELECT id INTO v_dist   FROM districts WHERE name = r.district;
    SELECT id INTO v_person FROM people    WHERE full_name = r.person;

    IF v_dist IS NULL   THEN RAISE EXCEPTION 'No district named %', r.district;   END IF;
    IF v_person IS NULL THEN RAISE EXCEPTION 'Nobody named % in the directory', r.person; END IF;

    -- Already held by this person: leave the existing term alone rather than
    -- closing it and opening an identical one, which would read as a handover
    -- that never happened.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM districts d
        JOIN people p ON lower(COALESCE(NULLIF(p.user_email,''), p.email)) = lower(d.dean_email)
       WHERE d.id = v_dist AND p.id = v_person);

    PERFORM set_district_dean(v_dist, v_person, CURRENT_DATE, NULL);
  END LOOP;

  PERFORM set_config('request.jwt.claims', '', true);
END $$;

SELECT d.name AS district,
       COALESCE(p.full_name, '(vacant)') AS dean,
       COALESCE(d.dean_email, '—')       AS login,
       COALESCE(p.ordination, '—')       AS ordination,
       COALESCE((SELECT h.term_start::text FROM office_holdings h
                   JOIN offices o ON o.id = h.office_id
                  WHERE o.district_id = d.id AND o.kind = 'DEAN' AND h.term_end IS NULL
                  ORDER BY h.term_start DESC LIMIT 1), '—') AS term_from
  FROM districts d
  LEFT JOIN people p ON lower(COALESCE(NULLIF(p.user_email,''), p.email)) = lower(d.dean_email)
 ORDER BY d.name;
