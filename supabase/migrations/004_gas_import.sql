-- 004_gas_import.sql
-- Extend frequency constraint, add JomPAY columns, and import GAS recurring templates
-- RUN ONCE ONLY — check recurring_pvs table is empty before running

-- 1. Extend frequency check to include HALF_YEARLY
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'recurring_pvs'::regclass AND contype = 'c' AND conname LIKE '%frequency%'
  LOOP
    EXECUTE 'ALTER TABLE recurring_pvs DROP CONSTRAINT ' || r.conname;
  END LOOP;
END $$;
ALTER TABLE recurring_pvs ADD CONSTRAINT recurring_pvs_frequency_check
  CHECK (frequency IN ('WEEKLY','MONTHLY','QUARTERLY','ANNUAL','HALF_YEARLY'));

-- 2. Add JomPAY columns
ALTER TABLE recurring_pvs
  ADD COLUMN IF NOT EXISTS biller_code TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS ref_no     TEXT DEFAULT '';

-- 3. Import all 58 GAS recurring expense templates
INSERT INTO recurring_pvs (
  name, payee_name, dept, project, amount, frequency, next_due,
  ministry, term_type, term_end_date, final_payment_note, purpose,
  active, pv_label, current_pv_no, payment_method,
  payee_bank_name, payee_bank_acct, biller_code, ref_no,
  payment_type, line_items, created_by, created_at
) VALUES

-- Utilities
('PJ Bungalow Electricity','Tenaga Nasional Berhad','LCM Property','PJ Bungalow',1221,'MONTHLY','2026-04-26','','INFINITE',NULL,'','PJ Bungalow Electricity',true,'','PV-2026-0007','Bank transfer','','','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2025-12-30 17:53:39'),
('Unifi - 5th Floor','TM Technology Services Sdn Bhd','','',274.55,'MONTHLY','2026-04-13','LCM HQ Office','INFINITE',NULL,'','Luther Centre - 5th Floor Unifi - A/C No. 1022077000',true,'LCM - PBB','PV-2026-0003','JomPAY','','','8888','1022077000','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-07 20:48:29'),

-- Staff Allowances
('Staff Allowances','ANDRY A/L ALANG','','',430,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Telephone RM30 + Petrol RM300 + Car Maintenance RM100. Email instruction from Thomas Lim 14/12/2018. Petrol increased 30/3/2023.',true,'','','Bank transfer','Maybank','158257011163','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Staff Allowances','ANNAM BIN KOPI','','',350,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Transport RM300 + Handphone Allowance RM50.',true,'','','Bank transfer','','','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Staff Allowances','AUDREY TAY SWEE LIN','','',1350,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Housing RM700 + Handphone RM100 + Utilities RM50 + Petrol RM200 + COLA RM300.',true,'','','Bank transfer','Public Bank Berhad (PBB)','4318354631','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Staff Allowances','BAH JAMAL A/L NGAH','','',350,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Transport Allowance RM300 + Handphone Allowance RM50. (Housing stopped September 2023). Letter of employment dated 14 Dec 2020.',true,'','','Bank transfer','Maybank','156048215196','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Staff Allowance (Communicating Dept)','CHAN SIEW FUN','','',600,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Monthly allowance for Communicating Dept.',true,'','','Bank transfer','','','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Staff Allowance','CHAN MUN KWAN','','',1500,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Allowance revised from RM1,350 to RM1,500 effective Jan 2026.',true,'','','Bank transfer','Maybank','114196420818','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Staff Allowances','KUNASEKAR PALRAS A/L SAMUEL','','',1500,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Housing RM900 + Telephone RM100 + Transport RM350 + COLA RM150.',true,'','','Bank transfer','','','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Staff Allowances (Transport + Handphone)','JELINSON AGINGGO','','',150,'MONTHLY','2026-04-30','','INFINITE',NULL,'','Transport RM100 + Handphone RM50.',true,'','10','Bank transfer','Agrobank','2006931000193812','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Monthly Allowance','MUALIP BIN ISMAIL','','',450,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Petrol RM300 + Car Maintenance RM100 + Telephone RM50. Petrol increase instruction from Thomas Lim 30/03/2023.',true,'','','Bank transfer','','','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Staff Allowances','ROSMAH A/P BAH HAU','','',450,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Housing RM100 + Handphone RM50 + Car Maintenance RM100 + Petrol RM200. Petrol increased to RM200 per Thomas Lim email 12 Jan 2026. Parish Worker since 15/06/2012, Officer since 01/01/2020, Pastor August 2023.',true,'','','Bank transfer','','','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),

-- Dean Allowances
('Dean Allowance (Southern District)','GOH YOUNG KIAN','','',400,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Monthly Dean Allowance for Southern District.',true,'','','Bank transfer','','','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Dean Allowance (Northern District)','KOO CHIA EN','','',400,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Monthly Dean Allowance for Northern District.',true,'','','Bank transfer','Maybank','108178734843','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Dean Allowance (Central District 2)','TAN SINK DARK','','',400,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Monthly Dean Allowance for Central District 2.',true,'','','Bank transfer','Public Bank Berhad (PBB)','4656748235','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Dean Allowance (Central District 3)','ALVIN TAN WEI JIANH','','',400,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Monthly Dean Allowance for Central District 3.',true,'','','Bank transfer','','','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Dean Allowance (OA District)','ANDRY A/L ALANG','','',400,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Monthly Dean Allowance for OA District.',true,'','','Bank transfer','Maybank','158257011163','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),

-- Other Allowances
('Housing Allowance','LIONG FONG KENG','','',500,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Monthly Housing Allowance.',true,'','','Bank transfer','Maybank','114179397521','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Secretary Allowance','HO CHEE WAY','','',1200,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Monthly Secretary Allowance.',true,'','','Bank transfer','','','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Bishop Allowances','LOW KOK CHAN','','',6850,'MONTHLY','2026-04-30','','INFINITE',NULL,'','Bishop Allowance RM4,000 + Housing RM2,000 + COLA RM300 + Home Internet RM200 + Mobile Data RM160 + Electricity RM150 + Water RM40 (internet/mobile/utilities per EXCO 18/03/2022).',true,'','12','Bank transfer','','','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Contract Sum - Counselling','LIM CHU YUEH','','',2000,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Monthly contract sum for counselling services.',true,'','','Bank transfer','CIMB Bank','7017776433','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Jelapang LC Pastoral Allowance','LEE CHIN KIANG','','',300,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Jelapang LC Monthly Allowance for Pastor In Charge.',true,'','','Bank transfer','Maybank','700725075075','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Handphone Allowance','DEIRDRE MUALIP','','',30,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Monthly handphone allowance.',true,'','','Bank transfer','Maybank','152040446738','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Pastoral Allowances (Bukit Merah)','CHAI SUIT FONG (LYDIA)','','',1100,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Housing RM500 + COLA RM200 + Utilities RM200 + Petrol RM200. New pastor from Bukit Merah Church, appointed Jan 2026.',true,'','','Bank transfer','','','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Pastoral Allowances (Bukit Merah)','CATHERINE TEO AI SZU','','',1530,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Housing RM580 + COLA RM300 + Utilities RM250 + Petrol RM400. Pastor from Bukit Merah Church.',true,'','','Bank transfer','','','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),

-- LMB
('LMB Allowance','THONG CHEE HOONG','','',300,'MONTHLY','2026-04-30','','INFINITE',NULL,'','Monthly LMB allowance.',true,'','13','Bank transfer','Maybank','106044044345','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('LMB Grass Cutting','JALI A/L BUSU KECHIL','','',400,'MONTHLY','2026-04-30','','INFINITE',NULL,'','Monthly grass cutting service at LMB.',true,'','14','Bank transfer','CIMB Bank','7059547031','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('LMB Extra Work Booking','KWAN KAM PENG','','',200,'MONTHLY','2026-04-30','','INFINITE',NULL,'','Extra work booking at LMB.',true,'','15','Bank transfer','','','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),

-- Rentals
('Rental - Chalet No. 8 (Cameron Highlands)','HIGHLANDS LAKEVIEW ENTERPRISES SDN BHD','','',700,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Rental for Chalet No. 8, 39200 Ringlet, Cameron Highlands, Pahang. Used by Rev. Mualip. Email instruction from Thomas Lim Feb 17, 2023.',true,'','','Bank transfer','Maybank','514169655409','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Rental - OATCC Office (Cameron Highlands)','HIGHLANDS LAKEVIEW ENTERPRISES SDN BHD','','',1200,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Rental for OATCC Office, 39200 Ringlet, Cameron Highlands, Pahang. Funded from ELCA Special Grant. Email instruction from Thomas Lim 16 Jan 2023.',true,'','','Bank transfer','Maybank','514169655409','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Rental - Rumah Ros Premises','LEE SOO MOI','','',800,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Rental for Rumah Ros premises.',true,'','','Bank transfer','Maybank','108074282381','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('House Rental - Annam Bin Kopi (Pengkalan Hulu)','PRAK TOM SI THONG','','',600,'MONTHLY','2026-04-01','','INFINITE',NULL,'','House rental for Annam Bin Kopi at Pengkalan Hulu. Address: No. 58, Taman Sri Kroh, Jalan Kuak Luar, 33100 Pengkalan Hulu, Perak.',true,'','','Bank transfer','Maybank','108074315376','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('House Rental - Rev. Jamal (Grik)','SEE SHU LING','','',500,'MONTHLY','2026-04-01','','INFINITE',NULL,'','House rental for Rev. Jamal. Rev. Jamal moved to Grik. Payment started Mar 2026.',true,'','','Bank transfer','Maybank','108074315376','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Shop Lot Rental - Nepal Ministry','YEOH CHENG LIANG','','',1000,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Rental of shop lot for Nepal Ministry. Address: No. 53A, Jln Utarid B U 5/B, 40150 Shah Alam, Selangor. Property sold to new owner starting 01/07/2022.',true,'','','Bank transfer','Maybank','114187124291','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('House Rental - Rev. Andry','KAVITHA A/P MANICKAM','','',800,'MONTHLY','2026-05-02','LCM Orang Asli','INFINITE',NULL,'','House rental for Andry Alang. Tenure 1 year (Jan 2025 - Jan 2026). Verify current status.',true,'LCM - PBB','','Bank transfer','PUBLIC BANK','4454242527','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('OA Community Centre Premises Rental','TRUTH LUTHERAN CHURCH','','',500,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Rental of premises for Orang Asli Community Centre. Address: 45-48, Jalan Intan, 33300 Gerik, Perak.',true,'','','Bank transfer','Maybank','108075055155','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Baling Lutheran Church Rental (OA)','LEE SIEW KHAM','','',600,'MONTHLY','2026-04-30','','FIXED','2034-11-17','Final rental payment — 9-year lease concluded Nov 2034.','Rental for Baling Lutheran Church (OA - Annam Bin Kopi). Scheme: Nov 2025-Nov 2028: RM600, Nov 2029-Nov 2031: RM660, Nov 2032-Nov 2034: RM726. (Update amount per scheme.)',true,'','11','Bank transfer','','','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),

-- COLA
('COLA','LIEW KIM FUNG','','',300,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Monthly Cost of Living Allowance.',true,'','','Bank transfer','','','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('COLA','JERMAINE AARON JAYARAJ','','',300,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Monthly Cost of Living Allowance.',true,'','','Bank transfer','','','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('COLA','KOIT KONG SENG (JEFFREY)','','',300,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Monthly Cost of Living Allowance.',true,'','','Bank transfer','Maybank','14084244333','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('COLA','MUALIP BIN ISMAIL','','',150,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Monthly Cost of Living Allowance (RM150).',true,'','','Bank transfer','','','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('COLA','CHAN LAM YENG','','',300,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Monthly Cost of Living Allowance.',true,'','','Bank transfer','Maybank','114067156366','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('COLA','CHAM BOON KONG','','',300,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Monthly Cost of Living Allowance.',true,'','','Bank transfer','Maybank','314084009801','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),

-- Church Subsidies
('Church Subsidy - LCM&S Penang','LUTHERAN CHURCH IN MALAYSIA AND SINGAPORE, THE CONGREGATION, PENANG','','',3000,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Monthly church subsidy. Refer to email 22/07/2025 (Mike).',true,'','','Bank transfer','Maybank','507152306355','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Church Subsidy - Jelapang','LCM - JELAPANG OUR SAVIOUR LUTHERAN CHURCH','','',300,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Monthly subsidy starting Jan 2023.',true,'','','Bank transfer','RHB Bank','20804300067730','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Church Subsidy - Seremban','LCM - SEREMBAN LUTHERAN CHURCH','','',1000,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Monthly subsidy starting Jan 2026. 12 months total @ RM1,000 (verify remaining term).',true,'','','Bank transfer','RHB Bank','20804300067730','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),

-- Love Gifts & Missionary Support
('LCMS Office Cleaning Allowance','ARUMUGAM A/L A SUPPIAH','','',600,'MONTHLY','2026-04-01','','INFINITE',NULL,'','LCMS Office cleaning services. Increased Jan 2020 (+RM100), Jan 2023 (+RM50), Oct 2025 (+RM50).',true,'','','Bank transfer','','','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Missionary Support - OMF (Lock Sai Kiew)','OVERSEAS MISSIONARY FELLOWSHIP','','',1000,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Financial support for Lock Sai Kiew, co-worker & secondment to OMF. Approved EXCO meeting 24 Sept 2014.',true,'','','Bank transfer','OCBC Bank','7041275699','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Love Gift & Rental - Myanmar Outreach (Ps. Richard)','JERMAINE AARON JAYARAJ','','',2450,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Love Gift for Ps. Richard (Myanmar) RM1,800 + Rental RM650. New premises from Apr 2016. Increased RM300 by Bishop Thomas Low Jun 2022.',true,'','','Bank transfer','CIMB Bank','7073742531','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Nepal Ministry Levy','COMY VENTURE SDN BHD','','',700,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Nepal Ministry Levy. Commenced Nov 2019.',true,'','','Bank transfer','Public Bank Berhad (PBB)','3174627227','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Missionary Support - YFC (Rev. Lew Choo Hua)','YFC RESOURCES BERHAD','','',2100,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Financial support for 1/3 salary of Rev. Lew Choo Hua at Youth for Christ.',true,'','','Bank transfer','Public Bank Berhad (PBB)','3190516134','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('STM Studies Support - Nantida','NANTIDA A/P SENGMANI','','',612,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Financial support for STM Studies. Proposed by Benson Yeoh, approved by Treasurer 3 Jan 2026.',true,'','','Bank transfer','Maybank','152040499217','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('STM Studies Support - Norma','NORMA A/P UDA','','',750,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Financial support for STM Studies. Proposed by Benson Yeoh, approved by Treasurer 3 Jan 2026.',true,'','','Bank transfer','Bank Simpanan Nasional (BSN)','870029000086726','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Love Gift - Sujan Khadka','SUJAN KHADKA','','',1600,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Love Gift RM1,500 + Phone Allowance RM100. Commenced 01/01/2021.',true,'','','Bank transfer','','','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),

-- Rumah Ros
('Monthly Subsidy to Rumah Ros','PERTUBUHAN KEBAJIKAN KANAK KANAK KRISTIAN PENGKALAN HULU','','',5950,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Monthly subsidy to ROS: RM9,150 gross less Rumah Ros Rental (-RM800) + Touching Heart 6 students (-RM600) + Livaia Salary (-RM1,800) = RM5,950. Instruction by Thomas Lim email Feb 4, 2020.',true,'','','Bank transfer','Maybank','558257022429','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Touching Heart (6 Students) - Rumah Ros','PERTUBUHAN KEBAJIKAN KANAK KANAK KRISTIAN PENGKALAN HULU','','',600,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Monthly allowance for 6 students under Touching Heart programme. Starting Jan 2021.',true,'','','Bank transfer','Maybank','558257022429','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),

-- PCB & Car Loan
('PCB Monthly Contributions','KETUA PENGARAH HASIL DALAM NEGERI','','',5217.95,'MONTHLY','2026-04-01','','INFINITE',NULL,'','Monthly PCB (Potongan Cukai Berjadual) contributions via e-PCB. NOTE: Amount varies monthly — update before generating PV. Last recorded amount (Dec 2025): RM5,217.95.',true,'','','Bank transfer','','','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07'),
('Car Loan Interest - Proton Exora (VBE 5893)','KUAN POH ONN','','',305,'HALF_YEARLY','2026-07-01','','INFINITE',NULL,'','Half-yearly car loan interest for Proton Exora 1.6 2018, Reg. VBE 5893. Loan RM40,000, Interest 3.05%, 60 months. Period July-Dec: RM305 (6 months x RM50.83). Kindly notify if car is sold.',true,'','','Bank transfer','','','','','GENERAL','[]'::jsonb,'finance@lcm.org.my','2026-03-27 12:14:07');
