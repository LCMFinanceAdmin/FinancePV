-- 224: the ROS numbers, from the Council tab of the church's own contact sheet.
--
-- Typed in once already, on 21 September 2026, and lost: the Administrator had
-- no write access to congregations and row-level security refuses silently, so
-- the page reported forty-nine saves that never happened. 223 gave her the
-- access and the page now checks what it actually wrote; this puts the numbers
-- in so she does not have to type them a third time.
--
-- Matched by hand where a machine should not be trusted. "9th Mile Cheras"
-- scores 0.86 against *11th* Mile Cheras by word overlap, and they are
-- different churches with a row each — that pairing alone is why this was
-- reviewed before it was written rather than after.
--
-- Three councils in the spreadsheet have no congregation of that name on
-- record and are deliberately not here: Tronoh, Lenggong, Air Kala.
--
-- Three numbers do not follow the house pattern PPM-001-10-09031964-0000NN and
-- are entered exactly as the church wrote them, because correcting somebody's
-- registry number on their behalf is not a thing to do quietly:
--   Petros    PPM-001-10-0903164-000042    seven digits where there are
--             usually eight
--   Truth     PPM-001-10-19031964-000010   19 where the others have 09
--   Sg Jor    PPM-001-10-000069            middle block missing entirely
--
-- Only fills a blank. A number already on record was put there by somebody and
-- is not overwritten from here.

UPDATE congregations c
   SET ros_number = v.ros,
       updated_at = NOW()
  FROM (VALUES
    ('11th Mile Cheras Lutheran Church'        , 'PPM-001-10-09031964-000038'),  -- r457 11m Cheras LC Council 2026
    ('9th Miles Lutheran Church'               , 'PPM-001-10-09031964-000035'),  -- r318 9th Mile Cheras LC Council 2026
    ('Balakong Lutheran Church'                , 'PPM-001-10-09031964-000063'),  -- r3 Balakong Unity LC Council 2026
    ('Baling Lutheran Church'                  , 'PPM-001-10-09031964-000005'),  -- r425 Baling LC Council 2026
    ('Bangsar Lutheran Church'                 , 'PPM-001-10-09031964-000058'),  -- r15 Bangsar LC Council 2026
    ('Bukit Merah Lutheran Church'             , 'PPM-001-10-09031964-000013'),  -- r28 Bukit Merah LC Council 2026
    ('Cameron Highland Lutheran Church'        , 'PPM-001-10-09031964-000047'),  -- r38 Cameron Highlands LC Council 2026
    ('Chemor Lutheran Church'                  , 'PPM-001-10-09031964-000011'),  -- r59 Chemor LC Council 2026
    ('Chempaka Lutheran Church'                , 'PPM-001-10-09031964-000033'),  -- r392 Chempaka Hope LC Council 2026
    ('Christ Centre Lutheran Church'           , 'PPM-001-10-09031964-000066'),  -- r48 CCLC Council 2026
    ('Christ Lutheran Church'                  , 'PPM-001-10-09031964-000056'),  -- r71 Christ LC Council 2026
    ('Crossway Community Lutheran Church'      , 'PPM-001-10-09031964-000067'),  -- r380 Crossway Community LC Council 2026
    ('Damansara Utama Lutheran Church'         , 'PPM-001-10-09031964-000032'),  -- r86 DULC Council 2026
    ('Good Shepherd Lutheran Church'           , 'PPM-001-10-09031964-000036'),  -- r355 Good Shepherd LC Council 2026
    ('Grace Lutheran Church'                   , 'PPM-001-10-09031964-000021'),  -- r101 Grace LC Council 2026
    ('Gurun Lutheran Church'                   , 'PPM-001-10-09031964-000004'),  -- r111 Gurun LC Council 2026
    ('Harvest Lutheran Church'                 , 'PPM-001-10-09031964-000062'),  -- r121 Harvest LC Council 2026
    ('Holy Cross Lutheran Church'              , 'PPM-001-10-09031964-000019'),  -- r133 Holy Cross LC Council 2026
    ('Holy Light Lutheran Church'              , 'PPM-001-10-09031964-000057'),  -- r143 Holy Light Council 2026
    ('Holy Trinity Lutheran Church'            , 'PPM-001-10-09031964-000018'),  -- r154 Holy Trinity LC Council 2026
    ('Jelapang Lutheran Church'                , 'PPM-001-10-09031964-000015'),  -- r164 Jelapang Our Saviour LC Council 2026
    ('Johore Bahru Lutheran Church'            , 'PPM-001-10-09031964-000001'),  -- r435 Johor Bahru LC Council 2026
    ('Kajang Lutheran Church'                  , 'PPM-001-10-09031964-000034'),  -- r174 Kajang LC Council 2026
    ('Kota Lutheran Church'                    , 'PPM-001-10-09031964-000043'),  -- r184 Kota LC Council 2026
    ('Kuala Kangsar Lutheran Church'           , 'PPM-001-10-09031964-000009'),  -- r194 Kuala Kangsar LC Council 2026
    ('Life Lutheran Church Semenyih'           , 'PPM-001-10-09031964-000039'),  -- r204 Life LC Council 2026
    ('Luther House Chapel'                     , 'PPM-001-10-09031964-000037'),  -- r445 Luther House Chapel LC Council 2026
    ('Malacca Lutheran Church'                 , 'PPM-001-10-09031964-000006'),  -- r216 Malacca LC Council 2026
    ('Morning Star Lutheran Church'            , 'PPM-001-10-09031964-000060'),  -- r334 Morning Star LC Council 2026
    ('New Life Lutheran Church'                , 'PPM-001-10-09031964-000017'),  -- r226 New Life LC Council 2026
    ('Pengkalan Hulu Lutheran Church'          , 'PPM-001-10-09031964-000022'),  -- r403 Pengkalan Hulu LC Council 2026
    ('Permai Lutheran Church'                  , 'PPM-001-10-09031964-000061'),  -- r236 Permai LC Council 2026
    ('Petros Lutheran Church'                  , 'PPM-001-10-0903164-000042'),  -- r245 Petros LC Council 2026
    ('Pos Woh Lutheran Church'                 , 'PPM-001-10-09031964-000068'),  -- r414 Pos Woh LC Council 2026
    ('Puchong Lutheran Church'                 , 'PPM-001-10-09031964-000064'),  -- r495 Puchong LC Council 2026
    ('Rawang Lutheran Church'                  , 'PPM-001-10-09031964-000044'),  -- r255 Rawang LC Council 2026
    ('Seremban Lutheran Church'                , 'PPM-001-10-09031964-000007'),  -- r265 Seremban LC Council 2026
    ('Sg Jor Lutheran Church'                  , 'PPM-001-10-000069'),  -- r275 Sg Jor LC Council 2026
    ('Sibu Lutheran Church'                    , 'PPM-001-10-09031964-000048'),  -- r370 Sibu LC Council 2026
    ('Sunway Lutheran Church'                  , 'PPM-001-10-09031964-000040'),  -- r307 Sunway LC Council 2026
    ('Taman Midah Lutheran Church'             , 'PPM-001-10-09031964-000049'),  -- r344 Taman Midah LC Council 2026
    ('Truth Lutheran Church'                   , 'PPM-001-10-19031964-000010')  -- r295 Truth LC Council 2026
  ) AS v(name, ros)
 WHERE c.name = v.name
   AND COALESCE(c.ros_number, '') = '';

-- Applied 22 September 2026. Forty-one rows took the number from here; the
-- forty-second, 9th Miles, already held "000" — typed the day before by the
-- Administrator checking that saving worked now that 223 had given her access,
-- which it did. Only-fill-a-blank left it alone, correctly, and it was set to
-- its real number by hand afterwards.
