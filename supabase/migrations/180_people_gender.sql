-- 180: gender in the directory, from the report that already recorded it.
--
-- people.gender existed and was blank on all 107 records, which is why leave
-- cannot yet be tailored: maternity and paternity are shown to everybody
-- because there is no basis on which to show them to anyone in particular.
--
-- The Employee Summary Report carries it for all 86 people it covers, and that
-- data was checked before being trusted: a Malaysian IC encodes sex in its last
-- digit, odd for male and even for female. Of the 86, 84 have a well-formed
-- 12-digit IC and every one of those agrees with what the report says. Two have
-- an IC that cannot be checked that way and are taken as reported.
--
-- Matched on IC rather than name, because an IC is exact and a name is a
-- spelling — which is the lesson of migration 168, where five people ended up
-- with two directory records each because the two sources wrote their names
-- differently.
--
-- A CHECK is added at the same time. The column was free text, so a stray
-- "M" or "male" would sit alongside "Male" and quietly fail every comparison
-- made against it.

BEGIN;

CREATE TEMP TABLE gender_import (ic TEXT PRIMARY KEY, gender TEXT, who TEXT) ON COMMIT DROP;
INSERT INTO gender_import (ic, gender, who) VALUES
  ('710424045269', 'Male', 'CHAM BOON KONG (SEAN)'),
  ('610713106007', 'Male', 'KWAN KAM PENG'),
  ('610412065037', 'Male', 'THONG CHEE HOONG'),
  ('560514715587', 'Male', 'WILFRED JOHN SUNDARAJ A/L SAMUEL'),
  ('990411065710', 'Female', 'AMELIA A/P JALI'),
  ('880925135838', 'Female', 'AMMYLYN ANAK ARDY'),
  ('940505125360', 'Female', 'DEIRDRE MUALIP'),
  ('000204080728', 'Female', 'HAMISAH BINTI YUSMAN'),
  ('720616035152', 'Female', 'JAMILAH A/P UDA'),
  ('790608105943', 'Male', 'JUHARI A/L LAMPAI'),
  ('780910125671', 'Male', 'LEUSIE SINTO'),
  ('980729086088', 'Female', 'MARAIANA A/P JUSA'),
  ('970529065320', 'Female', 'MARIANA A/P NGEM'),
  ('940122086624', 'Female', 'MASTURA A/P BAH NGEM'),
  ('880820085176', 'Female', 'ROSLAINI A/P BAH HAU'),
  ('950115085315', 'Male', 'SHAHARUL A/L JOHARI'),
  ('730514065034', 'Female', 'SINAH A/P BAH HAU'),
  ('950518086347', 'Male', 'SOJA BIN TAN'),
  ('880607087076', 'Female', 'WAK ZUSIANA A/P BAH DEK'),
  ('770416125191', 'Male', 'WELL BIN LADOM'),
  ('700611065450', 'Female', 'ADELINE LOW HUI CHING'),
  ('901030085243', 'Male', 'ALVIN TAN WEI JIANH'),
  ('860520436837', 'Male', 'ANDRY A/L ALANG'),
  ('830604125633', 'Male', 'ANNAM BIN KOPI'),
  ('610826105828', 'Female', 'AUDREY TAY SWEE LIN'),
  ('920505086631', 'Male', 'BAH JAMAL BIN NGAH'),
  ('800305135252', 'Female', 'CATHERINE TEO AI SZU'),
  ('681205085332', 'Female', 'CHAI SUIT FONG'),
  ('680828085342', 'Female', 'CHAN LIEN THAI (LINDA)'),
  ('520423085261', 'Male', 'CHAN MUN KWAN'),
  ('750603016662', 'Female', 'CHEE PEE LEE (JEANNIE)'),
  ('841119145183', 'Male', 'CHONG CI EN (ANDREW)'),
  ('921121146409', 'Male', 'CHONG KOK WAI (JOSHUA)'),
  ('380422015593', 'Male', 'CHUA TOH TECK (PETER)'),
  ('570316715059', 'Male', 'EBENEZER BENEDICT MUTHUSAMY'),
  ('641122015463', 'Male', 'FOO SIN LEONG (TERENCE)'),
  ('810208085889', 'Male', 'GOH HOOI PIN (MYRON)'),
  ('691231015265', 'Male', 'GOH YOUNG KIAN (ANDREW)'),
  ('540910085769', 'Male', 'HO CHEE FATT (FRANCIS)'),
  ('750415145627', 'Male', 'HO CHEE WAY (DAVID)'),
  ('831219146301', 'Male', 'JEGADASS A/L KUVALA KRISNAN'),
  ('010314121315', 'Male', 'JELINSON AGINGGO'),
  ('CG693272R', 'Female', 'KATHRIN EVA ZAHA'),
  ('601111135885', 'Male', 'KHIEW SAK JOON'),
  ('841028086085', 'Male', 'KOO CHIA EN (DANIEL)'),
  ('740210015651', 'Male', 'KUAN POY ONN'),
  ('760409145611', 'Male', 'KUANG KAR LOONG'),
  ('610810106623', 'Male', 'KUNASEKAR PALRAS A/L SAMUEL (PAUL RAJ)'),
  ('560112085359', 'Male', 'LAU TONG HOONG'),
  ('700725075075', 'Male', 'LEE CHIN KHIANG'),
  ('680626107013', 'Male', 'LEONG KAM KONG (MARCUS)'),
  ('800724145156', 'Female', 'LEW NYAK JIN (REENA)'),
  ('580907015264', 'Female', 'LIM SEOW PIN'),
  ('751124145429', 'Male', 'LIM SHIH HAN (CALVIN)'),
  ('820516075649', 'Male', 'LIM THEIN CHEE (CALEB)'),
  ('660702086165', 'Male', 'LING KONG HOON'),
  ('650508105933', 'Male', 'LING SOW WAN (ALEC)'),
  ('571120015258', 'Female', 'LIONG FONG KENG'),
  ('740223145455', 'Male', 'LIOW WENG SENG (WILSON)'),
  ('630207085352', 'Female', 'LOH KAN HOOI'),
  ('621125106469', 'Male', 'LOW KOK CHAN (THOMAS)'),
  ('620318065232', 'Female', 'LUI BEE LENG'),
  ('680523085341', 'Male', 'MAU HSIAO MING (ERIC)'),
  ('680422125017', 'Male', 'MUALIP BIN ISMAIL'),
  ('671103106113', 'Male', 'NGIAM SAI YIN'),
  ('861207525416', 'Female', 'PAMELA JAU'),
  ('780827085074', 'Female', 'ROSMAH A/P BAH HAU'),
  ('AC3815692', 'Female', 'SAE- MING ARTOE'),
  ('870807105065', 'Male', 'SIA YEW WEE, KELVIN'),
  ('830928145366', 'Female', 'TAN EE YAN'),
  ('700607025229', 'Male', 'TAN HEE MING'),
  ('580604086399', 'Male', 'TAN SINK DARK (PHILLIP)'),
  ('921028105485', 'Male', 'TAN SOO LEE'),
  ('710512085893', 'Male', 'TANG KAM POH'),
  ('760311065787', 'Male', 'THAM WAI HON (DAVID)'),
  ('661007086176', 'Female', 'WONG KEUN YIAU (LAVERNE)'),
  ('740612135488', 'Female', 'WONG SU CHARN (LYDIA)'),
  ('680206105265', 'Male', 'YAP CHUAN CHING (AARON)'),
  ('681008065009', 'Male', 'YEW SIE MING (EZRA)'),
  ('671005125644', 'Female', 'LIVAIA SIMON'),
  ('821022085382', 'Female', 'CHAN LAM YENG (LYVIA)'),
  ('810505085658', 'Female', 'CHAN SIEW FUN'),
  ('910827105111', 'Male', 'JERMAINE AARON JAYARAJ'),
  ('590108085871', 'Male', 'KOIT KONG SENG (JEFFREY)'),
  ('631120125168', 'Female', 'LIEW KIM FUNG'),
  ('720718145088', 'Female', 'SYLVIA CHONG MEEI HUEY');

UPDATE people p
   SET gender = gi.gender, updated_at = NOW()
  FROM gender_import gi
 WHERE p.ic_no = gi.ic
   AND (p.gender IS NULL OR p.gender = '');

ALTER TABLE people DROP CONSTRAINT IF EXISTS people_gender_check;
ALTER TABLE people ADD CONSTRAINT people_gender_check
  CHECK (gender IS NULL OR gender IN ('Male', 'Female'));

SELECT count(*) FILTER (WHERE gender = 'Male')                    AS male,
       count(*) FILTER (WHERE gender = 'Female')                  AS female,
       count(*) FILTER (WHERE gender IS NULL OR gender = '')      AS still_blank,
       count(*)                                                   AS people
  FROM people;

COMMIT;