-- 164: LCM's employees, onto payroll.
--
-- Built from two reports of 24/08/2026, deliberately combined rather than
-- choosing one. The Employee Summary Report says who each person is — IC, EPF,
-- SOCSO, tax number, bank, date joined, date of birth, designation, department.
-- The September payroll run says what each was actually paid.
--
-- Where the two disagree on salary the payroll run wins, because it is what left
-- the bank. That decision changes exactly two records: Tan Ee Yan, whose master
-- rate reads 3,930 against 7,310 paid, and Chan Mun Kwan, 2,000 against 3,500.
--
-- 81 employees — those in the September run. Five more sit on the employee
-- master and were not paid that month (two Trustees, two Orang Asli workers, and
-- Sylvia Chong who joined in January and has no bank account on file). They are
-- left out until they appear on a payroll, rather than created as people the
-- system believes are owed a salary.
--
-- Employee numbers carry the church's own code — EMP-129 is code 129 in the
-- payroll software these reports came from — so the two can be reconciled.
-- EMP-001 is the exception: it exists already and its number is on payslips
-- that have been issued.

BEGIN;


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-006', 'CHAN LIEN THAI (LINDA)', '680828085342', '1968-08-28'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2001-12-01'::DATE,
   'Single', '11058052', '',
   'Malayan Banking Berhad', '108011785175', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 4390.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-006';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-007', 'CHAN MUN KWAN', '520423085261', '1952-04-23'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2022-03-01'::DATE,
   'Married', '3190681', 'SG3012982',
   'Malayan Banking Berhad', '114196420818', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 3500.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-007';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-012', 'CHUA TOH TECK (PETER)', '380422015593', '1938-04-22'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '1967-11-01'::DATE,
   'Single', '01925936', 'SG050868107',
   'Malayan Banking Berhad', '114196052298', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 3500.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-012';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-015', 'FOO SIN LEONG (TERENCE)', '641122015463', '1964-11-22'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2002-10-01'::DATE,
   'Married', '10672041', 'IG 3574610060',
   'Malayan Banking Berhad', '114114690155', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 4020.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-015';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-017', 'GOH HOOI PIN (MYRON)', '810208085889', '1981-02-08'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2010-08-01'::DATE,
   'Married', '19063147', '',
   'Malayan Banking Berhad', '112111481866', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 4030.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-017';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-018', 'HO CHEE FATT (FRANCIS)', '540910085769', '1954-09-10'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '1954-09-10'::DATE,
   'Married', '05653428', 'SG2557542',
   'Public Bank Bhd / Public Finance', '4693941935', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 3500.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-018';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-019', 'HO CHEE WAY (DAVID)', '750415145627', '1975-04-15'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2006-04-01'::DATE,
   'Married', '13915125', '',
   'Public Bank Bhd / Public Finance', '6073080309', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 4410.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-019';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-026', 'KUAN POY ONN', '740210015651', '1974-02-10'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2007-01-01'::DATE,
   'Married', '13095778', 'IG 23622752010',
   'Public Bank Bhd / Public Finance', '4939973035', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 4390.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-026';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-028', 'LAU TONG HOONG', '560112085359', '1956-01-12'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2022-06-01'::DATE,
   'Married', '12993531', 'SG3023899',
   'Malayan Banking Berhad', '114124183680', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 3750.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-028';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-030', 'LEE CHIN KHIANG', '700725075075', '1970-07-25'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2010-01-01'::DATE,
   'Married', '11587777', 'IG 3582334080',
   'Malayan Banking Berhad', '112790038942', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 4010.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-030';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-032', 'LEONG KAM KONG (MARCUS)', '680626107013', '1968-06-26'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2006-04-01'::DATE,
   'Married', '10968194', 'SG 04133446090',
   'Public Bank Bhd / Public Finance', '3080358117', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 4130.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-032';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-034', 'LEW NYAK JIN (REENA)', '800724145156', '1980-07-24'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2011-01-01'::DATE,
   'Single', '17133887', 'IG 54382104080',
   'Malayan Banking Berhad', '112389027625', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 3510.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-034';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-036', 'LIM SEOW PIN', '580907015264', '1958-09-07'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '1995-11-01'::DATE,
   'Married', '10320047', 'IG 4358715011',
   'Malayan Banking Berhad', '112857021169', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 4950.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-036';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-037', 'LIM SHIH HAN (CALVIN)', '751124145429', '1975-11-24'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2005-10-01'::DATE,
   'Married', '13897795', 'SG6178725',
   'Public Bank Bhd / Public Finance', '4445208201', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 3710.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-037';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-038', 'LING KONG HOON', '660702086165', '1966-07-02'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2023-01-01'::DATE,
   'Married', '15820717', '',
   'Malayan Banking Berhad', '162526071488', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 1980.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-038';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-040', 'LIONG FONG KENG', '571120015258', '1957-11-20'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2002-05-15'::DATE,
   'Single', '10822895', '',
   '', '', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 3500.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-040';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-041', 'LOH KAN HOOI', '630207085352', '1963-02-07'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '1996-04-01'::DATE,
   'Single', '13190497', 'IG 22301735030',
   'Malayan Banking Berhad', '108074263462', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 4630.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-041';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-043', 'LOW KOK CHAN (THOMAS)', '621125106469', '1962-11-25'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '1987-06-01'::DATE,
   'Married', '11371504', 'IG 5057440100',
   'Malayan Banking Berhad', '014196516201', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 6270.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-043';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-044', 'LUI BEE LENG', '620318065232', '1962-03-18'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '1991-10-01'::DATE,
   'Married', '10361372', 'IG 2744079061',
   'Malayan Banking Berhad', '114114850357', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 4650.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-044';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-047', 'MUALIP BIN ISMAIL', '680422125017', '1968-04-22'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2006-04-01'::DATE,
   'Married', '61242964', 'IG 20814701020',
   'Malayan Banking Berhad', '108075071615', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 3830.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-047';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-053', 'PAMELA JAU', '861207525416', '1986-12-07'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2011-01-01'::DATE,
   'Single', '19239406', '',
   'Malayan Banking Berhad', '161042142128', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 3130.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-053';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-059', 'TAN HEE MING', '700607025229', '1970-06-07'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2006-04-01'::DATE,
   'Married', '11421000', 'SG01339550',
   'Public Bank Bhd / Public Finance', '6053386414', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 4410.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-059';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-061', 'TAN SINK DARK (PHILLIP)', '580604086399', '1958-06-04'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '1984-07-01'::DATE,
   'Married', '3992583', 'IG 3036738070',
   'Public Bank Bhd / Public Finance', '4656748235', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 5500.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-061';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-063', 'TANG KAM POH', '710512085893', '1971-05-12'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '1997-06-01'::DATE,
   'Married', '12559836', '',
   'Malayan Banking Berhad', '114132561073', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 4650.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-063';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-065', 'WAK ZUSIANA A/P BAH DEK', '880607087076', '1988-06-07'::DATE,
   'MINISTRY ASSISTANT (OA)', 'PERMANENT', false,
   'OFFICE', 'Orang Asli Ministry', '2007-01-01'::DATE,
   'Married', '17642659', '',
   'Bank Kerjasama Rakyat Berhad', '2222101667', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 1120.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-065';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-066', 'WELL BIN LADOM', '770416125191', '1977-04-16'::DATE,
   'MINISTRY ASSISTANT (OA)', 'PERMANENT', false,
   'OFFICE', 'Orang Asli Ministry', '2010-02-01'::DATE,
   'Married', '13354580', '',
   'CIMB Bank Berhad', '7037234046', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 1045.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-066';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-070', 'YAP CHUAN CHING (AARON)', '680206105265', '1968-02-06'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2006-08-01'::DATE,
   'Married', '12641357', 'IG 4133912060',
   'Malayan Banking Berhad', '562384104430', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 6120.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-070';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-073', 'YEW SIE MING (EZRA)', '681008065009', '1968-10-08'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2004-11-01'::DATE,
   'Married', '11022121', 'SG004448891020',
   'Hong Leong Bank Bhd', '19000003974', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 4330.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-073';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-075', 'KUANG KAR LOONG', '760409145611', '1976-04-09'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2011-07-01'::DATE,
   'Married', '12728703', 'SG11481486040',
   'Malayan Banking Berhad', '514440051067', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 3810.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-075';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-077', 'WONG KEUN YIAU (LAVERNE)', '661007086176', '1966-10-07'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2011-01-01'::DATE,
   'Single', '10701527', 'IG 25690601070',
   'Public Bank Bhd / Public Finance', '4467904911', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 3630.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-077';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-087', 'ROSMAH A/P BAH HAU', '780827085074', '1978-08-27'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2012-06-15'::DATE,
   'Single', '13655827', '',
   'Malayan Banking Berhad', '108123002517', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 2600.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-087';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-091', 'ANDRY A/L ALANG', '860520436837', '1986-05-20'::DATE,
   'MINISTRY ASSISTANT (OA)', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2018-07-01'::DATE,
   'Single', '16685392', '',
   'Malayan Banking Berhad', '158257011163', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 3250.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-091';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-092', 'LIVAIA SIMON', '671005125644', '1967-10-05'::DATE,
   'MINISTRY ASSISTANT (OA)', 'PERMANENT', false,
   'OFFICE', 'Rumah Ros (Orang Asli)', '2013-01-01'::DATE,
   'Married', '61457524', '',
   'Malayan Banking Berhad', '152040353318', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 1850.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-092';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-109', 'JUHARI A/L LAMPAI', '790608105943', '1979-06-08'::DATE,
   'ORANG ASLI', 'PERMANENT', false,
   'OFFICE', 'Orang Asli Ministry', '2014-10-01'::DATE,
   'Single', '20750818', '',
   'Malayan Banking Berhad', '158079808640', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 787.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-109';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-110', 'ANNAM BIN KOPI', '830604125633', '1983-06-04'::DATE,
   'ORANG ASLI', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2014-10-01'::DATE,
   'Single', '61625981', '',
   'Malayan Banking Berhad', '108252010630', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 2770.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-110';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-112', 'CHONG CI EN (ANDREW)', '841119145183', '1984-11-19'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2014-12-01'::DATE,
   'Married', '15867934', '',
   'Public Bank Bhd / Public Finance', '4429048833', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 3540.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-112';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-116', 'SIA YEW WEE, KELVIN', '870807105065', '1987-08-07'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2015-01-01'::DATE,
   'Single', '16495752', '',
   'Malayan Banking Berhad', '162384867158', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 3480.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-116';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-124', 'SHAHARUL A/L JOHARI', '950115085315', '1995-01-15'::DATE,
   'ORANG ASLI', 'PERMANENT', false,
   'OFFICE', 'Orang Asli Ministry', '2015-06-01'::DATE,
   'Single', '20004719', '',
   'Malayan Banking Berhad', '156048221645', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 785.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-124';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-126', 'LING SOW WAN (ALEC)', '650508105933', '1965-05-08'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2016-01-01'::DATE,
   'Married', '10349506', '',
   'Malayan Banking Berhad', '114570023488', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 3630.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-126';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-129', 'THONG CHEE HOONG', '610412065037', '1961-04-12'::DATE,
   'SUPERVISOR', 'PERMANENT', false,
   'OFFICE', 'Lutheran Mission Bungalow', '2016-03-01'::DATE,
   'Single', '5065604', '',
   'Malayan Banking Berhad', '106044044345', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 2300.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-129';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-132', 'GOH YOUNG KIAN (ANDREW)', '691231015265', '1969-12-31'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2017-01-01'::DATE,
   'Single', '14461535', '',
   'Public Bank Bhd / Public Finance', '6447633722', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 3230.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-132';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-133', 'LIOW WENG SENG (WILSON)', '740223145455', '1974-02-23'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2017-01-01'::DATE,
   'Single', '12805686', '',
   'Public Bank Bhd / Public Finance', '4422979217', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 3430.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-133';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-135', 'THAM WAI HON (DAVID)', '760311065787', '1976-03-11'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2017-01-01'::DATE,
   'Single', '13500389', '',
   'Public Bank Bhd / Public Finance', '4467212335', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 3430.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-135';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-139', 'MAU HSIAO MING (ERIC)', '680523085341', '1968-05-23'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2017-07-01'::DATE,
   'Married', '10838372', '',
   'Malayan Banking Berhad', '114290008860', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 3730.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-139';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-141', 'SOJA BIN TAN', '950518086347', '1995-05-18'::DATE,
   'Penolong Pastor OA', 'PERMANENT', false,
   'OFFICE', 'Orang Asli Ministry', '2017-07-01'::DATE,
   'Single', '21930665', '',
   'Malayan Banking Berhad', '158079821422', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 695.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-141';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-143', 'KOO CHIA EN (DANIEL)', '841028086085', '1984-10-28'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2018-01-01'::DATE,
   'Married', '17913139', '',
   'Malayan Banking Berhad', '108178734843', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 3150.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-143';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-151', 'LIM THEIN CHEE (CALEB)', '820516075649', '1982-05-16'::DATE,
   'PASTORAL', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2018-07-01'::DATE,
   'Single', '15667482', '',
   'Malayan Banking Berhad', '107330049305', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 3630.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-151';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-155', 'ALVIN TAN WEI JIANH', '901030085243', '1990-10-30'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2019-01-01'::DATE,
   'Married', '18081912', '',
   'Public Bank Bhd / Public Finance', '4500878916', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 2960.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-155';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-156', 'AMELIA A/P JALI', '990411065710', '1999-04-11'::DATE,
   'Penolong Pastor', 'PERMANENT', false,
   'OFFICE', 'Orang Asli Ministry', '2019-01-01'::DATE,
   'Single', '22630767', '',
   'CIMB Bank Berhad', '7065501344', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 625.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-156';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-161', 'SAE- MING ARTOE', 'AC3815692', '1960-12-20'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2019-02-01'::DATE,
   'Married', '56629140', '',
   'Hong Leong Bank Bhd', '17050103864', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 3030.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-161';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-164', 'LIEW KIM FUNG', '631120125168', '1963-11-20'::DATE,
   'OFFICE STAFF', 'PERMANENT', false,
   'OFFICE', 'LCM Office Staff', '2020-02-03'::DATE,
   'Married', '61009455', 'SG 0729701809',
   'Malayan Banking Berhad', '164753036649', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 3700.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-164';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-165', 'BAH JAMAL BIN NGAH', '920505086631', '1992-05-05'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2021-01-01'::DATE,
   'Single', '18882697', '',
   'Malayan Banking Berhad', '156048215196', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 2670.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-165';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-171', 'MARIANA A/P NGEM', '970529065320', '1997-05-29'::DATE,
   'Penolong Pastor', 'PERMANENT', false,
   'OFFICE', 'Orang Asli Ministry', '2021-01-01'::DATE,
   'Single', '21458332', '',
   'Bank Simpanan Nasional Berhad', '0821441000039582', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 580.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-171';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-172', 'JEGADASS A/L KUVALA KRISNAN', '831219146301', '1983-12-19'::DATE,
   '', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2021-06-01'::DATE,
   'Single', '17552770', '',
   'CIMB Bank Berhad', '7008555567', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 3150.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-172';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-173', 'KATHRIN EVA ZAHA', 'CG693272R', '1990-11-21'::DATE,
   'REV', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2021-11-01'::DATE,
   'Married', '56638224', '',
   'Malayan Banking Berhad', '164306464967', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 3005.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-173';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-174', 'CHEE PEE LEE (JEANNIE)', '750603016662', '1975-06-03'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2022-01-01'::DATE,
   'Married', '19144071', '',
   'Hong Leong Bank Bhd', '00650211081', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 2760.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-174';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-175', 'KUNASEKAR PALRAS A/L SAMUEL (PAUL RAJ)', '610810106623', '1961-08-10'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2021-01-01'::DATE,
   'Married', '03753382', '',
   'CIMB Bank Berhad', '7003098177', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 3060.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-175';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-177', 'ADELINE LOW HUI CHING', '700611065450', '1970-06-11'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2022-04-01'::DATE,
   'Married', '13033489', 'SG01303460101',
   'Malayan Banking Berhad', '112204146936', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 2710.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-177';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-179', 'WONG SU CHARN (LYDIA)', '740612135488', '1974-06-12'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2023-01-01'::DATE,
   'Single', '71315327', 'IG 20320507030',
   'Hong Leong Bank Bhd', '27250075699', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 4270.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-179';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-181', 'WILFRED JOHN SUNDARAJ A/L SAMUEL', '560514715587', '1956-05-14'::DATE,
   'LUTHERAN STUDY CENTER', 'PERMANENT', false,
   'OFFICE', 'Lutheran Study Centre', '2023-02-01'::DATE,
   'Single', '03421975', 'IG 10480996050',
   'CIMB Bank Berhad', '7003074816', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 5920.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-181';


-- JERMAINE AARON JAYARAJ — already on payroll as EMP-001. Corrected, not duplicated: the
-- salary held was 4,240 against 4,340 on both reports, and the account number
-- was truncated to 7 digits.
UPDATE payroll_employees SET
  ic_no = '910827105111', dob = '1991-08-27'::DATE,
  designation = 'ADMINSTRATION', date_commenced = '2023-04-03'::DATE,
  epf_no = '20700125', tin = 'IG 27573218050',
  bank_name = 'Alliance Bank Berhad', bank_acct = '140370020164440',
  marital_status = 'Single', department = 'LCM Office Staff',
  posting_type = 'OFFICE', is_pastor = false,
  updated_at = NOW()
WHERE emp_no = 'EMP-001';

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 4340.00, 'Corrected from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-001';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-185', 'DEIRDRE MUALIP', '940505125360', '1994-05-05'::DATE,
   'ADMINISTRATIVE ASSISTANT', 'PERMANENT', false,
   'OFFICE', 'Orang Asli Ministry', '2023-06-01'::DATE,
   'Married', '20827375', '',
   'Malayan Banking Berhad', '152040446738', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 1800.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-185';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-187', 'CHONG KOK WAI (JOSHUA)', '921121146409', '1992-11-21'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2024-01-01'::DATE,
   'Single', '19710235', 'SG24457828010',
   'Malayan Banking Berhad', '162385032034', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 2400.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-187';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-188', 'TAN EE YAN', '830928145366', '1983-09-28'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2024-01-01'::DATE,
   'Single', '17904154', 'IG 20188635090',
   'HSBC Amanah Malaysia Berhad', '352128540025', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 7310.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-188';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-189', 'TAN SOO LEE', '921028105485', '1992-10-28'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2024-01-01'::DATE,
   'Single', '20463575', '',
   'RHB Bank Berhad', '11209500450990', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 2400.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-189';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-190', 'EBENEZER BENEDICT MUTHUSAMY', '570316715059', '1957-03-16'::DATE,
   'PASTOR OF LUTHER HOUSE CHAPEL', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2024-01-01'::DATE,
   'Married', '5551389', 'E02920372',
   'Malayan Banking Berhad', '112464195030', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 2600.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-190';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-192', 'AMMYLYN ANAK ARDY', '880925135838', '1988-09-25'::DATE,
   'CO-ORDINATOR (SAMBAL PETAI)', 'PERMANENT', false,
   'OFFICE', 'Orang Asli Ministry', '2024-07-01'::DATE,
   'Single', '18838041', '',
   'Malayan Banking Berhad', '108075001784', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 1050.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-192';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-193', 'LEUSIE SINTO', '780910125671', '1978-09-10'::DATE,
   'ASSISTANT PASTOR', 'PERMANENT', false,
   'OFFICE', 'Orang Asli Ministry', '2024-11-01'::DATE,
   'Single', '61404589', '',
   'Public Islamic Bank Bhd', '6910492135', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 520.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-193';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-194', 'AUDREY TAY SWEE LIN', '610826105828', '1961-08-26'::DATE,
   'Pastor', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2024-12-01'::DATE,
   'Divorced', '05446668', '',
   'Public Bank Bhd / Public Finance', '4318354631', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 3450.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-194';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-195', 'JELINSON AGINGGO', '010314121315', '2001-03-14'::DATE,
   'PASTOR', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2025-03-01'::DATE,
   'Single', '25427377', '',
   'Agro Bank', '2006931000193812', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 1990.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-195';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-196', 'MARAIANA A/P JUSA', '980729086088', '1998-07-29'::DATE,
   '', 'PERMANENT', false,
   'OFFICE', 'Orang Asli Ministry', '2025-04-01'::DATE,
   'Single', '25476767', '',
   'Bank Simpanan Nasional Berhad', '0699541100393432', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 515.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-196';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-197', 'CHAN SIEW FUN', '810505085658', '1981-05-05'::DATE,
   'CHURCH COMMUNICATIONS COORDINATOR', 'PERMANENT', false,
   'OFFICE', 'LCM Office Staff', '2025-07-18'::DATE,
   'Married', '16101289', 'IG 12027010020',
   'MayBank Islamic Berhad', '112308011482', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 4980.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-197';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-198', 'ROSLAINI A/P BAH HAU', '880820085176', '1988-08-20'::DATE,
   '', 'PERMANENT', false,
   'OFFICE', 'Orang Asli Ministry', '2025-10-01'::DATE,
   'Single', '17642645', '',
   'MayBank Islamic Berhad', '558127560040', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 500.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-198';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-199', 'KHIEW SAK JOON', '601111135885', '1960-11-11'::DATE,
   '', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2025-10-01'::DATE,
   'Married', '07195051', '',
   'Public Bank Bhd / Public Finance', '5064539830', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 3500.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-199';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-200', 'CHAI SUIT FONG', '681205085332', '1968-12-05'::DATE,
   '', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2026-01-01'::DATE,
   'Single', '11332338', '',
   'Malayan Banking Berhad', '158145753892', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 2750.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-200';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-201', 'CATHERINE TEO AI SZU', '800305135252', '1980-03-05'::DATE,
   '', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2026-01-01'::DATE,
   'Married', '71567250', '',
   'Malayan Banking Berhad', '111057051116', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 2750.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-201';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-204', 'MASTURA A/P BAH NGEM', '940122086624', '1994-01-22'::DATE,
   '', 'PERMANENT', false,
   'OFFICE', 'Orang Asli Ministry', '2026-01-01'::DATE,
   'Single', '20199071', '',
   'Bank Simpanan Nasional Berhad', '0870041000018459', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 500.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-204';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-205', 'KOIT KONG SENG (JEFFREY)', '590108085871', '1959-01-08'::DATE,
   'GENERAL MANAGER', 'PERMANENT', false,
   'OFFICE', 'LCM Office Staff', '2026-02-01'::DATE,
   'Married', '13619552', 'IG03343587010',
   'Malayan Banking Berhad', '014084244333', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 7000.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-205';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-206', 'CHAN LAM YENG (LYVIA)', '821022085382', '1982-10-22'::DATE,
   'ADMIN EXECUTIVE cum P.A.', 'PERMANENT', false,
   'OFFICE', 'LCM Office Staff', '2026-03-01'::DATE,
   'Married', '17419907', '',
   'Malayan Banking Berhad', '114067156366', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 4000.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-206';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-208', 'HAMISAH BINTI YUSMAN', '000204080728', '2000-02-04'::DATE,
   '', 'PERMANENT', false,
   'OFFICE', 'Orang Asli Ministry', '2026-04-01'::DATE,
   'Married', '23907683', '',
   'Bank Simpanan Nasional Berhad', '0200541000090620', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 300.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-208';


INSERT INTO payroll_employees
  (emp_no, full_name, ic_no, dob, designation, employment_type, is_pastor,
   posting_type, department, date_commenced, marital_status, epf_no, tin,
   bank_name, bank_acct, status, created_by)
VALUES
  ('EMP-209', 'NGIAM SAI YIN', '671103106113', '1967-11-03'::DATE,
   '', 'PERMANENT', true,
   'OFFICE', 'Pastor Department', '2026-09-01'::DATE,
   'Married', 'PASTOR', '',
   'Public Bank Bhd / Public Finance', '4563251636', 'ACTIVE', 'migration 164')
ON CONFLICT (emp_no) DO NOTHING;

INSERT INTO payroll_salary (employee_id, effective_from, base_salary, reason, created_by)
SELECT id, DATE '2026-08-01', 2660.00, 'Imported from LCM payroll, September 2026 run', 'migration 164'
  FROM payroll_employees WHERE emp_no = 'EMP-209';


-- What was loaded, so the run can be checked against the reports it came from.
SELECT count(*) AS employees,
       to_char(sum(s.base_salary), 'FM999,999,990.00') AS monthly_basic
  FROM payroll_employees e
  JOIN LATERAL (SELECT base_salary FROM payroll_salary
                 WHERE employee_id = e.id ORDER BY effective_from DESC LIMIT 1) s ON TRUE
 WHERE e.status = 'ACTIVE';

COMMIT;
