-- 169: the contact sheet, into the directory.
--
-- Source: "Contact for Pastors & Office Staff.xlsx", sheet "Pastors + HQ",
-- rows 7-122. Below row 122 is out of scope and is not read.
--
-- What this adds: a personal email, an LCM workspace address, a mobile number,
-- a congregation and a district for the people the sheet lists — and the
-- churches and districts themselves, which the app barely held. Before this the
-- directory knew five districts and one congregation.
--
-- Four decisions worth stating, because each could have gone another way:
--
-- 1. The login is not touched where one already exists. Six people sign in with
--    a role address — secretary@, bishopthomas@, mission@, hq@, educationdesk@,
--    accountsgl@ — and the sheet also gives them a personal LCM address. Their
--    entry in user_roles hangs off the role address, so replacing it would have
--    cost the Bishop and the Secretary their approval powers at the next sign
--    in. The personal address goes in work_email; user_email is filled only
--    where it was empty, which is what finally lets a pastor open My Salary.
--
-- 2. Rows 102-111 are EXCO seats rather than people: column A names a portfolio
--    and column F is that seat's group address. Every holder already appears in
--    the sheet under their own name, so those rows are skipped and no person is
--    created called "stewardship".
--
-- 3. Titles are evidence. 164 left ordination blank on all 59 pastors because
--    the payroll reports do not record it. This sheet writes "Rev." or "Ps.",
--    which is precisely that distinction, so it is read from there — and only
--    where the record does not already say, so the work done on Chan Mun Kwan
--    stands.
--
-- 4. A cell naming two churches ("Sibu LC/Nang Sang LC") means the person
--    serves both. The first becomes their congregation and the rest are
--    recorded in person_congregations, rather than one being thrown away.

BEGIN;

-- The LCM workspace address. Separate from user_email, which is the login and
-- is not always the same thing, and from email, which is personal.
ALTER TABLE people ADD COLUMN IF NOT EXISTS work_email TEXT;
COMMENT ON COLUMN people.work_email IS
  'LCM workspace address. The login is user_email and may be a role address instead.';


-- Districts named in the sheet that the app did not hold.
INSERT INTO districts (name) SELECT 'Central District 1'
  WHERE NOT EXISTS (SELECT 1 FROM districts WHERE lower(name) = lower('Central District 1'));
INSERT INTO districts (name) SELECT 'Central District 2'
  WHERE NOT EXISTS (SELECT 1 FROM districts WHERE lower(name) = lower('Central District 2'));
INSERT INTO districts (name) SELECT 'Central District 3'
  WHERE NOT EXISTS (SELECT 1 FROM districts WHERE lower(name) = lower('Central District 3'));
INSERT INTO districts (name) SELECT 'Northern District'
  WHERE NOT EXISTS (SELECT 1 FROM districts WHERE lower(name) = lower('Northern District'));
INSERT INTO districts (name) SELECT 'Orang Asli District'
  WHERE NOT EXISTS (SELECT 1 FROM districts WHERE lower(name) = lower('Orang Asli District'));
INSERT INTO districts (name) SELECT 'Southern District'
  WHERE NOT EXISTS (SELECT 1 FROM districts WHERE lower(name) = lower('Southern District'));

-- The churches, each under the district whose pastors serve it.
INSERT INTO congregations (name, district_id)
SELECT '11th Mile Cheras Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Central District 1'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('11th Mile Cheras Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT '9th Miles Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Central District 1'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('9th Miles Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Balakong Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Central District 1'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Balakong Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Baling Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Orang Asli District'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Baling Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Bangsar Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Central District 2'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Bangsar Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Bukit Merah Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Northern District'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Bukit Merah Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Cameron Highland Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Orang Asli District'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Cameron Highland Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Chemor Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Northern District'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Chemor Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Chempaka Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Central District 3'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Chempaka Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Christ Centre Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Central District 3'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Christ Centre Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Christ Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Central District 2'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Christ Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Crossway Community Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Central District 2'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Crossway Community Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Damansara Utama Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Central District 3'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Damansara Utama Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Good Shepherd Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Central District 3'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Good Shepherd Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Grace Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Northern District'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Grace Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Gurun Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Northern District'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Gurun Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Harvest Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Central District 1'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Harvest Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Holy Cross Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Northern District'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Holy Cross Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Holy Light Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Central District 2'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Holy Light Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Holy Trinity Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Northern District'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Holy Trinity Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Jelapang Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Northern District'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Jelapang Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Johore Bahru Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Southern District'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Johore Bahru Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Kajang Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Central District 1'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Kajang Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Kota Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Central District 3'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Kota Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Kuala Kangsar Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Northern District'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Kuala Kangsar Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Kuching Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Central District 2'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Kuching Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Life Lutheran Church Semenyih', (SELECT id FROM districts WHERE lower(name) = lower('Central District 1'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Life Lutheran Church Semenyih'));
INSERT INTO congregations (name, district_id)
SELECT 'Luther House Chapel', (SELECT id FROM districts WHERE lower(name) = lower('Central District 3'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Luther House Chapel'));
INSERT INTO congregations (name, district_id)
SELECT 'Malacca Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Southern District'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Malacca Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Morning Star Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Southern District'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Morning Star Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Myanmar Ministry', (SELECT id FROM districts WHERE lower(name) = lower('Central District 2'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Myanmar Ministry'));
INSERT INTO congregations (name, district_id)
SELECT 'Nang Sang Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Central District 2'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Nang Sang Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Nepal Ministry', (SELECT id FROM districts WHERE lower(name) = lower('Central District 3'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Nepal Ministry'));
INSERT INTO congregations (name, district_id)
SELECT 'New Life Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Northern District'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('New Life Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Pengkalan Hulu Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Orang Asli District'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Pengkalan Hulu Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Permai Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Central District 2'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Permai Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Petros Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Central District 3'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Petros Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Pos Betau', (SELECT id FROM districts WHERE lower(name) = lower('Orang Asli District'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Pos Betau'));
INSERT INTO congregations (name, district_id)
SELECT 'Pos Woh Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Orang Asli District'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Pos Woh Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Puchong Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Central District 2'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Puchong Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Rawang Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Central District 3'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Rawang Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Selat Pagar Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Northern District'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Selat Pagar Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Seremban Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Southern District'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Seremban Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Sg Jor Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Orang Asli District'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Sg Jor Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Sibu Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Central District 2'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Sibu Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Sunway Community Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Central District 3'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Sunway Community Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Sunway Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Central District 3'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Sunway Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Taman Midah Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Central District 1'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Taman Midah Lutheran Church'));
INSERT INTO congregations (name, district_id)
SELECT 'Truth Lutheran Church', (SELECT id FROM districts WHERE lower(name) = lower('Northern District'))
 WHERE NOT EXISTS (SELECT 1 FROM congregations WHERE lower(name) = lower('Truth Lutheran Church'));

-- Everyone the directory already knew.
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'mlpdnl@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'daniel.mualip@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '019-5220166'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'daniel.mualip@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Cameron Highland Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Orang Asli District'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = '16ab4b6f-bd43-4112-acc6-1c857eafc7ca';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'alviandry86@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'andry.alang@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '019-5544536'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'andry.alang@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Pos Woh Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Orang Asli District'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = '009b17d4-f262-4f8e-90d2-1b06588d551b';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'jelinaon@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'jelinson.aginggo@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '014-2890793'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'jelinson.aginggo@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Pos Betau'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Orang Asli District'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'PASTOR'),
    updated_at     = NOW()
  WHERE id = '382a202f-360f-41f2-a60a-0c6da3ed58f9';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'alolngah20@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'jamal.ngah@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '019-5508774'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'jamal.ngah@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Pengkalan Hulu Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Orang Asli District'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'PASTOR'),
    updated_at     = NOW()
  WHERE id = '9f40edc3-67a6-45aa-953c-146e8d95a0a1';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'ros_mahjn@yahoo.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'rosmah.bahhau@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '019-4430751'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'rosmah.bahhau@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Sg Jor Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Orang Asli District'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'PASTOR'),
    updated_at     = NOW()
  WHERE id = '270cdc2e-d77a-4080-8080-b9ce71c96156';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'sumalakoi@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'annam.kopi@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '016-3386604'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'annam.kopi@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Pengkalan Hulu Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Orang Asli District'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'PASTOR'),
    updated_at     = NOW()
  WHERE id = 'dc26739b-9893-4b06-8e01-2bfa2f42fbfe';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'dkcedkce@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'daniel.koo@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '012-3756085'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'daniel.koo@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Chemor Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Northern District'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = '78ff18a5-bb28-4d46-9f4a-32f1ceaf9ea0';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'ywcklee2@yahoo.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'chinkhiang.lee@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '019-6967174'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'chinkhiang.lee@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Grace Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Northern District'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = '47047918-c955-4f26-a724-104c301ffb58';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'lydiawongsc@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'lydia.wong@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '012-4706780'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'lydia.wong@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Gurun Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Northern District'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'PASTOR'),
    updated_at     = NOW()
  WHERE id = 'dbad46c6-b6ca-4135-b0e9-a9da0750c4e4';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'laverne.wky@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'laverne.wong@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '017-5150779'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'laverne.wong@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Holy Cross Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Northern District'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = '4a55ee45-29fa-440f-9f14-b2e0642cfa56';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'thlau56@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'tonghoong.lau@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '012-3511044'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'tonghoong.lau@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Holy Trinity Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Northern District'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = 'bb2b2dc1-01cd-4982-945d-5d2fdd125d35';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'peterchuatt@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'peter.chua@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '012-5937828'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'peter.chua@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Jelapang Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Northern District'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = '289eeb4e-c5e2-444e-9432-44ace1b5bcc3';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'lohkanhooi@yahoo.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'kanhooi.loh@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '019-4482227'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'kanhooi.loh@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Kuala Kangsar Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Northern District'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = '43e087c9-d09a-4a3d-bc94-3504b72079dd';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'cltchan@yahoo.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'linda.chan@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '016-4915366'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'linda.chan@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('New Life Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Northern District'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = '7cd9c2ad-f0c5-4967-8e90-e7b39170e211';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'pastorho@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'francis.ho@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '016-3609587'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'francis.ho@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Selat Pagar Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Northern District'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = '7aa39c22-d004-4745-98fc-87011b48e651';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'kkarloong@yahoo.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'karloong.kuang@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '016-2212718'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'karloong.kuang@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Truth Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Northern District'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = 'b4f586f3-8987-41d4-925f-41192fc7cf44';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'suitfong1998@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'lydia.chai@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '014-3743102'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'lydia.chai@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Bukit Merah Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Northern District'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'PASTOR'),
    updated_at     = NOW()
  WHERE id = 'b473f1ba-b7aa-4a79-b679-54614d7c4f42';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'smyew@yahoo.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'ezra.yew@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '012-2239155'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'ezra.yew@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('9th Miles Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 1'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = 'acf35dc9-5ff3-48c2-9c71-b3f1c94db5de';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'soolee.tan@yahoo.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'soolee.tan@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '017-3787611'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'soolee.tan@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('9th Miles Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 1'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'PASTOR'),
    updated_at     = NOW()
  WHERE id = 'b548fad2-f604-44dc-be0b-ee98c2a7e354';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'chw316@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'david.ho@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '016-2784706'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('11th Mile Cheras Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 1'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = '896d180a-239d-40b1-be70-6a6c82ef33cf';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'kelvinsia_87@yahoo.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'kelvin.sia@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '016-6547803'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'kelvin.sia@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('11th Mile Cheras Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 1'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = '5282318b-f160-4b58-83ad-ed1a04c4be44';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'pamela_jau@yahoo.com.my'),
    work_email     = COALESCE(NULLIF(work_email,''), 'pamela.jau@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '012-8780883'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'pamela.jau@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('11th Mile Cheras Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 1'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = 'b6b9f0fa-0cb3-4f51-845b-d5ffc9e000c6';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'alecling@hotmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'alec.ling@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '012-3249175'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'alec.ling@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('11th Mile Cheras Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 1'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = '135d8c4b-52cf-46a5-8a01-7346734e8448';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'heemingtan@yahoo.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'heeming.tan@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '012-3554831'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'heeming.tan@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Balakong Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 1'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = '269b2759-c5a4-4cd9-b0bd-6f92236a1f57';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'joshua92ck@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'joshua.chong@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '016-3023316'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'joshua.chong@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Balakong Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 1'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'PASTOR'),
    updated_at     = NOW()
  WHERE id = '33344a42-a0d7-42e8-83b1-4a4e76b7e6b9';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'kate0327andrew@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'andrew.chong@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '012-2702924'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'andrew.chong@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Harvest Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 1'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = 'f9f21365-d258-4fe4-9475-d8af653b97fb';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'wsliow@yahoo.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'wengseng.liow@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '012-2380983'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'wengseng.liow@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Kajang Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 1'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = '3fec8d19-5438-438a-88e9-358e5b4618df';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'khling72@yahoo.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'konghoon.ling@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '016-6840826'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'konghoon.ling@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Kajang Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 1'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = '3e41a20a-5f1b-492e-a6d2-ee18e05b1a1f';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'aaronyap68.llcs1@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'aaron.yap@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '016-3382797'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'aaron.yap@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Life Lutheran Church Semenyih'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 1'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = '441b9ecb-33b8-4d99-ad13-d71808cab0b3';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'revtangkampoh@yahoo.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'kampoh.tang@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '017-3366770'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'kampoh.tang@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Taman Midah Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 1'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = 'ed8f5124-7bbe-4dec-90e9-589b1b8162c7';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'rumahpapa.admin@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'adeline.low@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '012-2402811'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'adeline.low@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Bangsar Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 2'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'PASTOR'),
    updated_at     = NOW()
  WHERE id = '75eda6fb-29c2-46ec-8599-20a23efd9087';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'rev.tan.clc@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'philip.tan@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '012-3535838'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'philip.tan@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Christ Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 2'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = '49523847-97a6-4254-a86b-5a7a746d2bdf';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'ericmau@clc.org.my'),
    work_email     = COALESCE(NULLIF(work_email,''), 'eric.mau@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '019-3597201'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Christ Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 2'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = '2f561f08-e634-4abc-a1c3-a8e16f96a661';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'jegadass@hotmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'jegadass.krisnan@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '012-2524232'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'jegadass.krisnan@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Christ Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 2'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = '7440ff9b-3acb-4b69-9c16-074423ecd700';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'angeltheinchee@yahoo.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'caleb.lim@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '018-3103001'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'caleb.lim@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Christ Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 2'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = 'a1038804-9416-43ab-91b5-a02be180bfa0';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'marc_leo@yahoo.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'marcus.leong@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '012-2861557'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'marcus.leong@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Crossway Community Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 2'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = 'cccd283c-ed2c-490e-aae7-dfbde80221e2';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'eeyantan@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'eeyan.tan@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '012-2001723'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'eeyan.tan@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Crossway Community Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 2'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'PASTOR'),
    updated_at     = NOW()
  WHERE id = 'e7593084-2e6b-48d4-8371-0b61219eb55d';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'rev.bllui@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'beeleng.lui@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '011-12240318'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'beeleng.lui@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Holy Light Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 2'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = 'e4dd3e4f-c187-46b9-b4c3-05e9e220a6eb';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'twaihon@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'david.tham@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '012-5170030'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'david.tham@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Holy Light Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 2'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = '15f5baca-a60e-4589-9f46-07211f8a30e6';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'poyonnkuan@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'poyonn.kuan@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '012-6821441'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'poyonn.kuan@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Permai Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 2'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = '225b37e8-7178-4d71-8437-edef467b0e8b';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'jchee603@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'jeannie.chee@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '018-7645200'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'jeannie.chee@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Puchong Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 2'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'PASTOR'),
    updated_at     = NOW()
  WHERE id = '483dcef2-b44a-4fb8-989e-9682c81ae71d';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'deoaishi@yahoo.com.sg'),
    work_email     = COALESCE(NULLIF(work_email,''), 'catherine.teo@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '010-2164556'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'catherine.teo@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Kuching Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 2'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'PASTOR'),
    updated_at     = NOW()
  WHERE id = '8a9cd235-1ba2-4397-adce-eb8fe5a71189';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'ngiam2001@yahoo.com'),
    work_email     = COALESCE(NULLIF(work_email,''), NULL),
    phone          = COALESCE(NULLIF(phone,''), '019-3275307'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Chempaka Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 3'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'PASTOR'),
    updated_at     = NOW()
  WHERE id = '7c757916-a674-4a24-bc6f-fb2fc343e450';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'tanalvin777.at@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'alvin.tan@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '012-5740020'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'alvin.tan@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Christ Centre Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 3'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = '5bb57c7d-2801-4eaf-8562-5be53239391c';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'myrongoh@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'myron.goh@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '010-5257656'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'myron.goh@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Damansara Utama Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 3'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = 'd9f8faa7-7375-4f69-96a5-9068b99c50f7';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'calvinlim75@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'calvin.lim@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '016-6102844'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'calvin.lim@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Good Shepherd Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 3'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = '002a7177-5dcc-4599-aaaf-13dfaad2fb78';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'slfoo99@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'terence.foo@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '012-6981318'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'terence.foo@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Kota Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 3'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = 'fe551040-76a5-4ff0-b885-4cba550d12ab';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'benedict.muthusamy@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'benedict.muthusamy@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '016-6638789'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'benedict.muthusamy@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Luther House Chapel'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 3'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = '923abdc8-ab0b-4714-b9ef-f10fb80d0813';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), NULL),
    work_email     = COALESCE(NULLIF(work_email,''), 'joshua.khiew@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '011-61588599'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'joshua.khiew@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Petros Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 3'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'PASTOR'),
    updated_at     = NOW()
  WHERE id = 'debe296e-0ebc-4ba5-9d7d-8fc15bcb4460';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'reenalew@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'reena.lew@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '016-9819413'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'reena.lew@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Rawang Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 3'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = '65bd97d3-1322-4571-95a7-e36cf659ab95';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'limsp97@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'seowpin.lim@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '012-2218535'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'seowpin.lim@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Sunway Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 3'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = 'e2ed04c0-45d8-4393-bf62-a57b73dd8ece';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'tayaudrey61@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'audrey.tay@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '016-6415866'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'audrey.tay@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Sunway Community Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Central District 3'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'PASTOR'),
    updated_at     = NOW()
  WHERE id = 'f00886e6-db6e-4d7f-9caa-4f131934a664';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'fongkeng1040@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'fongkeng.liong@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '019-6198033'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'fongkeng.liong@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Malacca Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Southern District'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = '267f876d-85b9-436f-922e-35d078e8d989';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'hpc2020@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'andrew.goh@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '011-10548869'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'andrew.goh@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Johore Bahru Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Southern District'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = '09ac54b5-f650-4bbb-9188-0bbf8eab397a';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'artoesm@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'artoe.saeming@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '018-7624900'),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'artoe.saeming@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, (SELECT id FROM congregations WHERE lower(name) = lower('Seremban Lutheran Church'))),
    district_id    = COALESCE(district_id, (SELECT id FROM districts WHERE lower(name) = lower('Southern District'))),
    posting        = COALESCE(posting, 'CONGREGATION'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = 'aa29751d-0475-4e2a-a877-a5625b7e608f';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'bishopthomas@lcm.org.my'),
    work_email     = COALESCE(NULLIF(work_email,''), 'thomas.low@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '012-3172632'),
    congregation_id = COALESCE(congregation_id, NULL),
    district_id    = COALESCE(district_id, NULL),
    posting        = COALESCE(posting, 'HQ'),
    ordination     = COALESCE(ordination, NULL),
    updated_at     = NOW()
  WHERE id = '9e112d27-7c25-499b-95a1-847e5485ab9b';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'rev.chanmk@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'munkwan.chan@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), '012-3638952'),
    congregation_id = COALESCE(congregation_id, NULL),
    district_id    = COALESCE(district_id, NULL),
    posting        = COALESCE(posting, 'HQ'),
    ordination     = COALESCE(ordination, 'REVEREND'),
    updated_at     = NOW()
  WHERE id = 'cc3e649b-89e9-47f1-875d-9176faf15982';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'jermaineaaron7@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'aaron.jeyaraj@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), NULL),
    congregation_id = COALESCE(congregation_id, NULL),
    district_id    = COALESCE(district_id, NULL),
    posting        = COALESCE(posting, 'HQ'),
    ordination     = COALESCE(ordination, NULL),
    updated_at     = NOW()
  WHERE id = '5fd0a442-367f-46ac-8413-4b5f61fe2f5f';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'kpkwan63@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'eddie.kwan@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), NULL),
    congregation_id = COALESCE(congregation_id, NULL),
    district_id    = COALESCE(district_id, NULL),
    posting        = COALESCE(posting, 'HQ'),
    ordination     = COALESCE(ordination, NULL),
    updated_at     = NOW()
  WHERE id = 'ae3ba8b7-301b-4e3a-9c48-c9779837f6af';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'jeffkoi@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'jeff.koit@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), NULL),
    congregation_id = COALESCE(congregation_id, NULL),
    district_id    = COALESCE(district_id, NULL),
    posting        = COALESCE(posting, 'HQ'),
    ordination     = COALESCE(ordination, NULL),
    updated_at     = NOW()
  WHERE id = '5af999d4-2524-45e3-967c-f06955062e27';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'chan.siewfun@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'siewfun.chan@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), NULL),
    user_email     = COALESCE(NULLIF(people.user_email,''), 'siewfun.chan@lcm.org.my'),
    congregation_id = COALESCE(congregation_id, NULL),
    district_id    = COALESCE(district_id, NULL),
    posting        = COALESCE(posting, 'HQ'),
    ordination     = COALESCE(ordination, NULL),
    updated_at     = NOW()
  WHERE id = '9dc43ce0-712a-4084-9650-98d43e19eecd';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'kimflyap@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'kimfung.liew@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), NULL),
    congregation_id = COALESCE(congregation_id, NULL),
    district_id    = COALESCE(district_id, NULL),
    posting        = COALESCE(posting, 'HQ'),
    ordination     = COALESCE(ordination, NULL),
    updated_at     = NOW()
  WHERE id = '7fd03684-a976-46cb-9a01-21812d87da8b';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'lyviachanly@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'lyvia.chan@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), NULL),
    congregation_id = COALESCE(congregation_id, NULL),
    district_id    = COALESCE(district_id, NULL),
    posting        = COALESCE(posting, 'HQ'),
    ordination     = COALESCE(ordination, NULL),
    updated_at     = NOW()
  WHERE id = '30c7e356-e4c4-424d-8f33-bce102ad594d';
UPDATE people SET
    email          = COALESCE(NULLIF(email,''), 'bkcham@gmail.com'),
    work_email     = COALESCE(NULLIF(work_email,''), 'sean.cham@lcm.org.my'),
    phone          = COALESCE(NULLIF(phone,''), NULL),
    congregation_id = COALESCE(congregation_id, NULL),
    district_id    = COALESCE(district_id, NULL),
    posting        = COALESCE(posting, 'HQ'),
    ordination     = COALESCE(ordination, NULL),
    updated_at     = NOW()
  WHERE id = 'cd2e01e5-07c2-4dea-aa54-f1b962ecf7a2';

-- Everyone it did not. These are church-employed workers and HQ
-- postings, so is_employed stays false: they are not on LCM's payroll.
INSERT INTO people
  (full_name, category, status, email, work_email, user_email, phone,
   congregation_id, district_id, posting, ordination, ministry_status, is_employed, created_by)
SELECT 'Sarah Deidre', 'PARISH_WORKER', 'ACTIVE',
       NULL, NULL, NULL, '013-9497023',
       NULL, (SELECT id FROM districts WHERE lower(name) = lower('Orang Asli District')), NULL, NULL,
       NULL, FALSE, 'migration 169'
 WHERE NOT EXISTS (SELECT 1 FROM people WHERE lower(full_name) = lower('Sarah Deidre'));
INSERT INTO people
  (full_name, category, status, email, work_email, user_email, phone,
   congregation_id, district_id, posting, ordination, ministry_status, is_employed, created_by)
SELECT 'Nelly Chong Lee Nei', 'PARISH_WORKER', 'ACTIVE',
       'nlychg@hotmail.com', 'nelly.chong@lcm.org.my', 'nelly.chong@lcm.org.my', '012-8989466',
       (SELECT id FROM congregations WHERE lower(name) = lower('11th Mile Cheras Lutheran Church')), (SELECT id FROM districts WHERE lower(name) = lower('Central District 1')), 'CONGREGATION', NULL,
       NULL, FALSE, 'migration 169'
 WHERE NOT EXISTS (SELECT 1 FROM people WHERE lower(COALESCE(work_email,'')) = lower('nelly.chong@lcm.org.my')
       OR lower(COALESCE(user_email,'')) = lower('nelly.chong@lcm.org.my'));
INSERT INTO people
  (full_name, category, status, email, work_email, user_email, phone,
   congregation_id, district_id, posting, ordination, ministry_status, is_employed, created_by)
SELECT 'Lew Choo Hua', 'PASTOR', 'ACTIVE',
       'choohualew@gmail.com', 'choohua.lew@lcm.org.my', 'choohua.lew@lcm.org.my', '012-6176458',
       (SELECT id FROM congregations WHERE lower(name) = lower('Kajang Lutheran Church')), (SELECT id FROM districts WHERE lower(name) = lower('Central District 1')), 'CONGREGATION', 'REVEREND',
       'ACTIVE', FALSE, 'migration 169'
 WHERE NOT EXISTS (SELECT 1 FROM people WHERE lower(COALESCE(work_email,'')) = lower('choohua.lew@lcm.org.my')
       OR lower(COALESCE(user_email,'')) = lower('choohua.lew@lcm.org.my'));
INSERT INTO people
  (full_name, category, status, email, work_email, user_email, phone,
   congregation_id, district_id, posting, ordination, ministry_status, is_employed, created_by)
SELECT 'Kym Yap Kim Fah', 'PASTOR', 'ACTIVE',
       'kmfhyap@gmail.com', 'kym.yap@lcm.org.my', 'kym.yap@lcm.org.my', '017-2264362',
       (SELECT id FROM congregations WHERE lower(name) = lower('Kajang Lutheran Church')), (SELECT id FROM districts WHERE lower(name) = lower('Central District 1')), 'CONGREGATION', 'REVEREND',
       'ACTIVE', FALSE, 'migration 169'
 WHERE NOT EXISTS (SELECT 1 FROM people WHERE lower(COALESCE(work_email,'')) = lower('kym.yap@lcm.org.my')
       OR lower(COALESCE(user_email,'')) = lower('kym.yap@lcm.org.my'));
INSERT INTO people
  (full_name, category, status, email, work_email, user_email, phone,
   congregation_id, district_id, posting, ordination, ministry_status, is_employed, created_by)
SELECT 'Lee Chul Woo', 'PASTOR', 'ACTIVE',
       'tsurulee@outlook.com', 'chuiwoo.lee@lcm.org.my', 'chuiwoo.lee@lcm.org.my', '011-9478676',
       (SELECT id FROM congregations WHERE lower(name) = lower('Taman Midah Lutheran Church')), (SELECT id FROM districts WHERE lower(name) = lower('Central District 1')), 'CONGREGATION', 'REVEREND',
       'ACTIVE', FALSE, 'migration 169'
 WHERE NOT EXISTS (SELECT 1 FROM people WHERE lower(COALESCE(work_email,'')) = lower('chuiwoo.lee@lcm.org.my')
       OR lower(COALESCE(user_email,'')) = lower('chuiwoo.lee@lcm.org.my'));
INSERT INTO people
  (full_name, category, status, email, work_email, user_email, phone,
   congregation_id, district_id, posting, ordination, ministry_status, is_employed, created_by)
SELECT 'Brandon Wong', 'PARISH_WORKER', 'ACTIVE',
       'brand93wong@yahoo.com', 'brandon.wong@lcm.org.my', 'brandon.wong@lcm.org.my', '016-5526225',
       (SELECT id FROM congregations WHERE lower(name) = lower('Taman Midah Lutheran Church')), (SELECT id FROM districts WHERE lower(name) = lower('Central District 1')), 'CONGREGATION', NULL,
       NULL, FALSE, 'migration 169'
 WHERE NOT EXISTS (SELECT 1 FROM people WHERE lower(COALESCE(work_email,'')) = lower('brandon.wong@lcm.org.my')
       OR lower(COALESCE(user_email,'')) = lower('brandon.wong@lcm.org.my'));
INSERT INTO people
  (full_name, category, status, email, work_email, user_email, phone,
   congregation_id, district_id, posting, ordination, ministry_status, is_employed, created_by)
SELECT 'Lock Sai Kiew', 'PASTOR', 'ACTIVE',
       'saikiewlock@yahoo.com', 'saikiew.lock@lcm.org.my', 'saikiew.lock@lcm.org.my', '013-3013415',
       (SELECT id FROM congregations WHERE lower(name) = lower('Christ Lutheran Church')), (SELECT id FROM districts WHERE lower(name) = lower('Central District 2')), 'CONGREGATION', 'REVEREND',
       'ACTIVE', FALSE, 'migration 169'
 WHERE NOT EXISTS (SELECT 1 FROM people WHERE lower(COALESCE(work_email,'')) = lower('saikiew.lock@lcm.org.my')
       OR lower(COALESCE(user_email,'')) = lower('saikiew.lock@lcm.org.my'));
INSERT INTO people
  (full_name, category, status, email, work_email, user_email, phone,
   congregation_id, district_id, posting, ordination, ministry_status, is_employed, created_by)
SELECT 'Richard Ai Maung', 'PASTOR', 'ACTIVE',
       'richardaimaung@gmail.com', 'richard.aimaung@lcm.org.my', 'richard.aimaung@lcm.org.my', '011-21106009',
       (SELECT id FROM congregations WHERE lower(name) = lower('Myanmar Ministry')), (SELECT id FROM districts WHERE lower(name) = lower('Central District 2')), 'CONGREGATION', 'PASTOR',
       'ACTIVE', FALSE, 'migration 169'
 WHERE NOT EXISTS (SELECT 1 FROM people WHERE lower(COALESCE(work_email,'')) = lower('richard.aimaung@lcm.org.my')
       OR lower(COALESCE(user_email,'')) = lower('richard.aimaung@lcm.org.my'));
INSERT INTO people
  (full_name, category, status, email, work_email, user_email, phone,
   congregation_id, district_id, posting, ordination, ministry_status, is_employed, created_by)
SELECT 'Elijah Ting Moi Kieng', 'PASTOR', 'ACTIVE',
       'pastor.ting@gmail.com', 'elijah.ting@lcm.org.my', 'elijah.ting@lcm.org.my', '013-8095221',
       (SELECT id FROM congregations WHERE lower(name) = lower('Sibu Lutheran Church')), (SELECT id FROM districts WHERE lower(name) = lower('Central District 2')), 'CONGREGATION', 'REVEREND',
       'ACTIVE', FALSE, 'migration 169'
 WHERE NOT EXISTS (SELECT 1 FROM people WHERE lower(COALESCE(work_email,'')) = lower('elijah.ting@lcm.org.my')
       OR lower(COALESCE(user_email,'')) = lower('elijah.ting@lcm.org.my'));
INSERT INTO people
  (full_name, category, status, email, work_email, user_email, phone,
   congregation_id, district_id, posting, ordination, ministry_status, is_employed, created_by)
SELECT 'Moh Chiou Ing', 'PARISH_WORKER', 'ACTIVE',
       'ladybirdmoh@gmail.com', 'chiouing.moh@lcm.org.my', 'chiouing.moh@lcm.org.my', '011-10659899',
       (SELECT id FROM congregations WHERE lower(name) = lower('Sibu Lutheran Church')), (SELECT id FROM districts WHERE lower(name) = lower('Central District 2')), 'CONGREGATION', NULL,
       NULL, FALSE, 'migration 169'
 WHERE NOT EXISTS (SELECT 1 FROM people WHERE lower(COALESCE(work_email,'')) = lower('chiouing.moh@lcm.org.my')
       OR lower(COALESCE(user_email,'')) = lower('chiouing.moh@lcm.org.my'));
INSERT INTO people
  (full_name, category, status, email, work_email, user_email, phone,
   congregation_id, district_id, posting, ordination, ministry_status, is_employed, created_by)
SELECT 'Wong See Wei', 'PARISH_WORKER', 'ACTIVE',
       NULL, 'seewei.wong@lcm.org.my', 'seewei.wong@lcm.org.my', '019-8181551',
       (SELECT id FROM congregations WHERE lower(name) = lower('Sibu Lutheran Church')), (SELECT id FROM districts WHERE lower(name) = lower('Central District 2')), 'CONGREGATION', NULL,
       NULL, FALSE, 'migration 169'
 WHERE NOT EXISTS (SELECT 1 FROM people WHERE lower(COALESCE(work_email,'')) = lower('seewei.wong@lcm.org.my')
       OR lower(COALESCE(user_email,'')) = lower('seewei.wong@lcm.org.my'));
INSERT INTO people
  (full_name, category, status, email, work_email, user_email, phone,
   congregation_id, district_id, posting, ordination, ministry_status, is_employed, created_by)
SELECT 'Summer Chan Kim Hung', 'PARISH_WORKER', 'ACTIVE',
       NULL, 'summer.chan@lcm.org.my', 'summer.chan@lcm.org.my', '014-3950710',
       (SELECT id FROM congregations WHERE lower(name) = lower('Sibu Lutheran Church')), (SELECT id FROM districts WHERE lower(name) = lower('Central District 2')), 'CONGREGATION', NULL,
       NULL, FALSE, 'migration 169'
 WHERE NOT EXISTS (SELECT 1 FROM people WHERE lower(COALESCE(work_email,'')) = lower('summer.chan@lcm.org.my')
       OR lower(COALESCE(user_email,'')) = lower('summer.chan@lcm.org.my'));
INSERT INTO people
  (full_name, category, status, email, work_email, user_email, phone,
   congregation_id, district_id, posting, ordination, ministry_status, is_employed, created_by)
SELECT 'Kathrin Zaha Lee', 'PASTOR', 'ACTIVE',
       'kathrin-zaha@gmx.de', 'kathrin.zahalee@lcm.org.my', 'kathrin.zahalee@lcm.org.my', '019-2177467',
       (SELECT id FROM congregations WHERE lower(name) = lower('Damansara Utama Lutheran Church')), (SELECT id FROM districts WHERE lower(name) = lower('Central District 3')), 'CONGREGATION', 'REVEREND',
       'ACTIVE', FALSE, 'migration 169'
 WHERE NOT EXISTS (SELECT 1 FROM people WHERE lower(COALESCE(work_email,'')) = lower('kathrin.zahalee@lcm.org.my')
       OR lower(COALESCE(user_email,'')) = lower('kathrin.zahalee@lcm.org.my'));
INSERT INTO people
  (full_name, category, status, email, work_email, user_email, phone,
   congregation_id, district_id, posting, ordination, ministry_status, is_employed, created_by)
SELECT 'Damian Loke Weng Yew', 'PARISH_WORKER', 'ACTIVE',
       'damianloke@gmail.com', 'damian.loke@lcm.org.my', 'damian.loke@lcm.org.my', '013-3370223',
       (SELECT id FROM congregations WHERE lower(name) = lower('Good Shepherd Lutheran Church')), (SELECT id FROM districts WHERE lower(name) = lower('Central District 3')), 'CONGREGATION', NULL,
       NULL, FALSE, 'migration 169'
 WHERE NOT EXISTS (SELECT 1 FROM people WHERE lower(COALESCE(work_email,'')) = lower('damian.loke@lcm.org.my')
       OR lower(COALESCE(user_email,'')) = lower('damian.loke@lcm.org.my'));
INSERT INTO people
  (full_name, category, status, email, work_email, user_email, phone,
   congregation_id, district_id, posting, ordination, ministry_status, is_employed, created_by)
SELECT 'Mary Lim', 'PARISH_WORKER', 'ACTIVE',
       'mary_lim1@yahoo.com', 'mary.lim@lcm.org.my', 'mary.lim@lcm.org.my', '018-3810599',
       (SELECT id FROM congregations WHERE lower(name) = lower('Kota Lutheran Church')), (SELECT id FROM districts WHERE lower(name) = lower('Central District 3')), 'CONGREGATION', NULL,
       NULL, FALSE, 'migration 169'
 WHERE NOT EXISTS (SELECT 1 FROM people WHERE lower(COALESCE(work_email,'')) = lower('mary.lim@lcm.org.my')
       OR lower(COALESCE(user_email,'')) = lower('mary.lim@lcm.org.my'));
INSERT INTO people
  (full_name, category, status, email, work_email, user_email, phone,
   congregation_id, district_id, posting, ordination, ministry_status, is_employed, created_by)
SELECT 'Sujan Khadka', 'PASTOR', 'ACTIVE',
       'khadka.lcm@gmail.com', 'sujan.khadka@lcm.org.my', 'sujan.khadka@lcm.org.my', '014-3613580',
       (SELECT id FROM congregations WHERE lower(name) = lower('Nepal Ministry')), (SELECT id FROM districts WHERE lower(name) = lower('Central District 3')), 'CONGREGATION', 'PASTOR',
       'ACTIVE', FALSE, 'migration 169'
 WHERE NOT EXISTS (SELECT 1 FROM people WHERE lower(COALESCE(work_email,'')) = lower('sujan.khadka@lcm.org.my')
       OR lower(COALESCE(user_email,'')) = lower('sujan.khadka@lcm.org.my'));
INSERT INTO people
  (full_name, category, status, email, work_email, user_email, phone,
   congregation_id, district_id, posting, ordination, ministry_status, is_employed, created_by)
SELECT 'Paul Raj', 'PASTOR', 'ACTIVE',
       'revkpaul61@gmail.com', 'paul.raj@lcm.org.my', 'paul.raj@lcm.org.my', '012-2729583',
       (SELECT id FROM congregations WHERE lower(name) = lower('Morning Star Lutheran Church')), (SELECT id FROM districts WHERE lower(name) = lower('Southern District')), 'CONGREGATION', 'REVEREND',
       'ACTIVE', FALSE, 'migration 169'
 WHERE NOT EXISTS (SELECT 1 FROM people WHERE lower(COALESCE(work_email,'')) = lower('paul.raj@lcm.org.my')
       OR lower(COALESCE(user_email,'')) = lower('paul.raj@lcm.org.my'));
INSERT INTO people
  (full_name, category, status, email, work_email, user_email, phone,
   congregation_id, district_id, posting, ordination, ministry_status, is_employed, created_by)
SELECT 'Tan Hooi Lip', 'PASTOR', 'ACTIVE',
       'hooilip68@hotmail.com', 'hooilip.tan@lcm.org.my', 'hooilip.tan@lcm.org.my', '016-5383609',
       NULL, NULL, 'HQ', 'PASTOR',
       'ACTIVE', FALSE, 'migration 169'
 WHERE NOT EXISTS (SELECT 1 FROM people WHERE lower(COALESCE(work_email,'')) = lower('hooilip.tan@lcm.org.my')
       OR lower(COALESCE(user_email,'')) = lower('hooilip.tan@lcm.org.my'));
INSERT INTO people
  (full_name, category, status, email, work_email, user_email, phone,
   congregation_id, district_id, posting, ordination, ministry_status, is_employed, created_by)
SELECT 'Chong Siaw Fung', 'PASTOR', 'ACTIVE',
       'drcsfung@stm2.edu.my', 'siawfung.chong@lcm.org.my', 'siawfung.chong@lcm.org.my', '013-8516329',
       NULL, NULL, 'HQ', 'REVEREND',
       'ACTIVE', FALSE, 'migration 169'
 WHERE NOT EXISTS (SELECT 1 FROM people WHERE lower(COALESCE(work_email,'')) = lower('siawfung.chong@lcm.org.my')
       OR lower(COALESCE(user_email,'')) = lower('siawfung.chong@lcm.org.my'));
INSERT INTO people
  (full_name, category, status, email, work_email, user_email, phone,
   congregation_id, district_id, posting, ordination, ministry_status, is_employed, created_by)
SELECT 'Philip Lok Oi Peng', 'PASTOR', 'ACTIVE',
       'philiplok318@gmail.com', 'philip.lok@lcm.org.my', 'philip.lok@lcm.org.my', '013-2222162',
       NULL, NULL, 'HQ', 'REVEREND',
       'ACTIVE', FALSE, 'migration 169'
 WHERE NOT EXISTS (SELECT 1 FROM people WHERE lower(COALESCE(work_email,'')) = lower('philip.lok@lcm.org.my')
       OR lower(COALESCE(user_email,'')) = lower('philip.lok@lcm.org.my'));
INSERT INTO people
  (full_name, category, status, email, work_email, user_email, phone,
   congregation_id, district_id, posting, ordination, ministry_status, is_employed, created_by)
SELECT 'Sivin Kit', 'PASTOR', 'ACTIVE',
       'sivin.kit@lutheranworld.org', 'sivin.kit@lcm.org.my', 'sivin.kit@lcm.org.my', '41787898529',
       NULL, NULL, 'HQ', 'REVEREND',
       'ACTIVE', FALSE, 'migration 169'
 WHERE NOT EXISTS (SELECT 1 FROM people WHERE lower(COALESCE(work_email,'')) = lower('sivin.kit@lcm.org.my')
       OR lower(COALESCE(user_email,'')) = lower('sivin.kit@lcm.org.my'));
INSERT INTO people
  (full_name, category, status, email, work_email, user_email, phone,
   congregation_id, district_id, posting, ordination, ministry_status, is_employed, created_by)
SELECT 'Joy Lim', 'HQ_STAFF', 'ACTIVE',
       'joylim.slg@gmail.com', NULL, NULL, NULL,
       NULL, NULL, 'HQ', NULL,
       NULL, FALSE, 'migration 169'
 WHERE NOT EXISTS (SELECT 1 FROM people WHERE lower(full_name) = lower('Joy Lim'));

-- Second congregations, for those serving more than one.
INSERT INTO person_congregations (person_id, congregation_id)
SELECT p.id, c.id
  FROM people p, congregations c
 WHERE (lower(COALESCE(p.work_email,'')) = lower('jamal.ngah@lcm.org.my') OR lower(COALESCE(p.email,'')) = lower('jamal.ngah@lcm.org.my'))
   AND lower(c.name) = lower('Baling Lutheran Church')
   AND NOT EXISTS (SELECT 1 FROM person_congregations x
                    WHERE x.person_id = p.id AND x.congregation_id = c.id);  -- Bah Jamal Bin Ngah
INSERT INTO person_congregations (person_id, congregation_id)
SELECT p.id, c.id
  FROM people p, congregations c
 WHERE (lower(COALESCE(p.work_email,'')) = lower('elijah.ting@lcm.org.my') OR lower(COALESCE(p.email,'')) = lower('elijah.ting@lcm.org.my'))
   AND lower(c.name) = lower('Nang Sang Lutheran Church')
   AND NOT EXISTS (SELECT 1 FROM person_congregations x
                    WHERE x.person_id = p.id AND x.congregation_id = c.id);  -- Elijah Ting Moi Kieng
INSERT INTO person_congregations (person_id, congregation_id)
SELECT p.id, c.id
  FROM people p, congregations c
 WHERE (lower(COALESCE(p.work_email,'')) = lower('poyonnkuan@gmail.com') OR lower(COALESCE(p.email,'')) = lower('poyonnkuan@gmail.com'))
   AND lower(c.name) = lower('Chempaka Lutheran Church')
   AND NOT EXISTS (SELECT 1 FROM person_congregations x
                    WHERE x.person_id = p.id AND x.congregation_id = c.id);  -- Kuan Poy Onn

-- What this leaves, to be read against the sheet it came from.
SELECT (SELECT count(*) FROM districts)                                        AS districts,
       (SELECT count(*) FROM congregations)                                    AS congregations,
       (SELECT count(*) FROM people)                                           AS people,
       (SELECT count(*) FROM people WHERE work_email IS NOT NULL AND work_email <> '') AS with_lcm_email,
       (SELECT count(*) FROM people WHERE phone IS NOT NULL AND phone <> '')   AS with_phone,
       (SELECT count(*) FROM people WHERE congregation_id IS NOT NULL)         AS with_congregation,
       (SELECT count(*) FROM payroll_employees pe JOIN people p ON p.id = pe.person_id
         WHERE pe.status='ACTIVE' AND p.user_email IS NOT NULL AND p.user_email <> '')
                                                                               AS can_open_my_salary;

COMMIT;
