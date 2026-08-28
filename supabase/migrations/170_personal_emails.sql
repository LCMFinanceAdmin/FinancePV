-- 170: the personal addresses 169 could not write.
--
-- 169 filled people.email with COALESCE, which writes only into an empty field.
-- Twelve records were not empty — they had been seeded from the login, so the
-- personal-email field held an @lcm.org.my address — and the real personal
-- address from column C of the contact sheet was skipped.
--
-- The guard below is what makes this safe to run: it only replaces a value that
-- is itself an lcm.org.my address. A personal address already on file, whether
-- typed by hand or written by 169, is left exactly as it is.

BEGIN;

UPDATE people SET email = 'mlpdnl@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('daniel.mualip@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Daniel Mualip Ismail
UPDATE people SET email = 'alviandry86@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('andry.alang@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Andry Alang
UPDATE people SET email = 'jelinaon@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('jelinson.aginggo@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Jelinson Aginggo
UPDATE people SET email = 'alolngah20@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('jamal.ngah@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Bah Jamal Bin Ngah
UPDATE people SET email = 'ros_mahjn@yahoo.com', updated_at = NOW()
 WHERE lower(work_email) = lower('rosmah.bahhau@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Rosmah Bah Hau
UPDATE people SET email = 'sumalakoi@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('annam.kopi@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Annam Bin Kopi
UPDATE people SET email = 'dkcedkce@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('daniel.koo@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Daniel Koo Chia En
UPDATE people SET email = 'ywcklee2@yahoo.com', updated_at = NOW()
 WHERE lower(work_email) = lower('chinkhiang.lee@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Lee Chin Khiang
UPDATE people SET email = 'lydiawongsc@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('lydia.wong@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Lydia Wong Su Charn
UPDATE people SET email = 'laverne.wky@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('laverne.wong@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Laverne Wong Keun Yiau
UPDATE people SET email = 'thlau56@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('tonghoong.lau@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Lau Tong Hoong
UPDATE people SET email = 'peterchuatt@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('peter.chua@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Peter Chua Toh Teck
UPDATE people SET email = 'lohkanhooi@yahoo.com', updated_at = NOW()
 WHERE lower(work_email) = lower('kanhooi.loh@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Loh Kan Hooi
UPDATE people SET email = 'cltchan@yahoo.com', updated_at = NOW()
 WHERE lower(work_email) = lower('linda.chan@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Linda Chan Lien Thai
UPDATE people SET email = 'pastorho@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('francis.ho@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Francis Ho Chee Fatt
UPDATE people SET email = 'kkarloong@yahoo.com', updated_at = NOW()
 WHERE lower(work_email) = lower('karloong.kuang@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Kuang Kar Loong
UPDATE people SET email = 'suitfong1998@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('lydia.chai@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Lydia Chai Suit Fong
UPDATE people SET email = 'smyew@yahoo.com', updated_at = NOW()
 WHERE lower(work_email) = lower('ezra.yew@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Ezra Yew Sie Ming
UPDATE people SET email = 'soolee.tan@yahoo.com', updated_at = NOW()
 WHERE lower(work_email) = lower('soolee.tan@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Tan Soo Lee
UPDATE people SET email = 'chw316@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('david.ho@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- David Ho Chee Way
UPDATE people SET email = 'kelvinsia_87@yahoo.com', updated_at = NOW()
 WHERE lower(work_email) = lower('kelvin.sia@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Kelvin Sia Yew Wee
UPDATE people SET email = 'pamela_jau@yahoo.com.my', updated_at = NOW()
 WHERE lower(work_email) = lower('pamela.jau@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Pamela Jau
UPDATE people SET email = 'alecling@hotmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('alec.ling@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Alec Ling Sow Wan
UPDATE people SET email = 'nlychg@hotmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('nelly.chong@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Nelly Chong Lee Nei
UPDATE people SET email = 'heemingtan@yahoo.com', updated_at = NOW()
 WHERE lower(work_email) = lower('heeming.tan@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Tan Hee Ming
UPDATE people SET email = 'joshua92ck@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('joshua.chong@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Joshua Chong Kok Wei
UPDATE people SET email = 'kate0327andrew@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('andrew.chong@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Andrew Chong Ci En
UPDATE people SET email = 'wsliow@yahoo.com', updated_at = NOW()
 WHERE lower(work_email) = lower('wengseng.liow@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Liow Weng Seng
UPDATE people SET email = 'choohualew@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('choohua.lew@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Lew Choo Hua
UPDATE people SET email = 'kmfhyap@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('kym.yap@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Kym Yap Kim Fah
UPDATE people SET email = 'khling72@yahoo.com', updated_at = NOW()
 WHERE lower(work_email) = lower('konghoon.ling@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Ling Kong Hoon
UPDATE people SET email = 'aaronyap68.llcs1@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('aaron.yap@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Aaron Yap Chuan Ching
UPDATE people SET email = 'revtangkampoh@yahoo.com', updated_at = NOW()
 WHERE lower(work_email) = lower('kampoh.tang@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Tang Kam Poh
UPDATE people SET email = 'tsurulee@outlook.com', updated_at = NOW()
 WHERE lower(work_email) = lower('chuiwoo.lee@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Lee Chul Woo
UPDATE people SET email = 'brand93wong@yahoo.com', updated_at = NOW()
 WHERE lower(work_email) = lower('brandon.wong@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Brandon Wong
UPDATE people SET email = 'rumahpapa.admin@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('adeline.low@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Adeline Low Hui Ching
UPDATE people SET email = 'rev.tan.clc@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('philip.tan@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Philip Tan Sink Dark
UPDATE people SET email = 'ericmau@clc.org.my', updated_at = NOW()
 WHERE lower(work_email) = lower('eric.mau@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Eric Mau Hsiao Ming
UPDATE people SET email = 'jegadass@hotmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('jegadass.krisnan@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Rev.Jegadass A/L Kuvala Krisnan
UPDATE people SET email = 'saikiewlock@yahoo.com', updated_at = NOW()
 WHERE lower(work_email) = lower('saikiew.lock@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Lock Sai Kiew
UPDATE people SET email = 'angeltheinchee@yahoo.com', updated_at = NOW()
 WHERE lower(work_email) = lower('caleb.lim@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Caleb Lim Thien Chee
UPDATE people SET email = 'marc_leo@yahoo.com', updated_at = NOW()
 WHERE lower(work_email) = lower('marcus.leong@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Marcus Leong Kam Kong
UPDATE people SET email = 'eeyantan@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('eeyan.tan@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Tan Ee Yan
UPDATE people SET email = 'rev.bllui@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('beeleng.lui@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Lui Bee Leng
UPDATE people SET email = 'twaihon@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('david.tham@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- David Tham
UPDATE people SET email = 'richardaimaung@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('richard.aimaung@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Richard Ai Maung
UPDATE people SET email = 'poyonnkuan@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('poyonn.kuan@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Kuan Poy Onn
UPDATE people SET email = 'jchee603@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('jeannie.chee@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Jeannie Chee Pee Lee
UPDATE people SET email = 'pastor.ting@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('elijah.ting@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Elijah Ting Moi Kieng
UPDATE people SET email = 'deoaishi@yahoo.com.sg', updated_at = NOW()
 WHERE lower(work_email) = lower('catherine.teo@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Catherine Teo
UPDATE people SET email = 'ladybirdmoh@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('chiouing.moh@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Moh Chiou Ing
UPDATE people SET email = 'tanalvin777.at@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('alvin.tan@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Alvin Tan Wei Jianh
UPDATE people SET email = 'kathrin-zaha@gmx.de', updated_at = NOW()
 WHERE lower(work_email) = lower('kathrin.zahalee@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Kathrin Zaha Lee
UPDATE people SET email = 'myrongoh@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('myron.goh@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Myron Goh Hooi Pin
UPDATE people SET email = 'calvinlim75@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('calvin.lim@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Calvin Lim Shih Han
UPDATE people SET email = 'damianloke@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('damian.loke@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Damian Loke Weng Yew
UPDATE people SET email = 'slfoo99@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('terence.foo@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Terence Foo Sin Leong
UPDATE people SET email = 'mary_lim1@yahoo.com', updated_at = NOW()
 WHERE lower(work_email) = lower('mary.lim@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Mary Lim
UPDATE people SET email = 'benedict.muthusamy@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('benedict.muthusamy@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Benedict Muthusamy
UPDATE people SET email = 'khadka.lcm@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('sujan.khadka@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Sujan Khadka
UPDATE people SET email = 'reenalew@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('reena.lew@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Reena Lew Nyak Jin
UPDATE people SET email = 'limsp97@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('seowpin.lim@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Lim Seow Pin
UPDATE people SET email = 'tayaudrey61@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('audrey.tay@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Audrey Tay
UPDATE people SET email = 'rev.chanmk@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('munkwan.chan@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Chan Mun Kwan
UPDATE people SET email = 'fongkeng1040@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('fongkeng.liong@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Liong Fong Keng
UPDATE people SET email = 'hpc2020@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('andrew.goh@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Andrew Goh Young Kian
UPDATE people SET email = 'revkpaul61@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('paul.raj@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Paul Raj
UPDATE people SET email = 'artoesm@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('artoe.saeming@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Artoe Sae-Ming
UPDATE people SET email = 'hooilip68@hotmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('hooilip.tan@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Tan Hooi Lip
UPDATE people SET email = 'drcsfung@stm2.edu.my', updated_at = NOW()
 WHERE lower(work_email) = lower('siawfung.chong@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Chong Siaw Fung
UPDATE people SET email = 'rev.chanmk@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('munkwan.chan@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Chan Mun Kwan
UPDATE people SET email = 'philiplok318@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('philip.lok@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Philip Lok Oi Peng
UPDATE people SET email = 'sivin.kit@lutheranworld.org', updated_at = NOW()
 WHERE lower(work_email) = lower('sivin.kit@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Sivin Kit
UPDATE people SET email = 'jermaineaaron7@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('aaron.jeyaraj@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Aaron Jeyaraj
UPDATE people SET email = 'kpkwan63@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('eddie.kwan@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Eddie Kwan
UPDATE people SET email = 'jeffkoi@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('jeff.koit@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Jeff Koit
UPDATE people SET email = 'chan.siewfun@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('siewfun.chan@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Chan Siew Fun
UPDATE people SET email = 'kimflyap@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('kimfung.liew@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Kim Fung
UPDATE people SET email = 'lyviachanly@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('lyvia.chan@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Lyvia Chan
UPDATE people SET email = 'bkcham@gmail.com', updated_at = NOW()
 WHERE lower(work_email) = lower('sean.cham@lcm.org.my')
   AND (email IS NULL OR email = '' OR email ILIKE '%@lcm.org.my');  -- Sean Cham

SELECT count(*) FILTER (WHERE email ILIKE '%@lcm.org.my')                       AS still_holding_a_work_address,
       count(*) FILTER (WHERE email IS NOT NULL AND email <> ''
                        AND email NOT ILIKE '%@lcm.org.my')                     AS personal_on_file,
       count(*) FILTER (WHERE work_email IS NOT NULL AND work_email <> '')      AS work_on_file
  FROM people;

COMMIT;
