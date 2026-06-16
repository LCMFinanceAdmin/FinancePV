-- Add per-year interest tracking to withdrawal records
ALTER TABLE fd_withdrawals
  ADD COLUMN IF NOT EXISTS interest_by_year JSONB DEFAULT '{}';

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed FD Certificates from Excel: LIST OF FIXED DEPOSIT 31/12/2025
-- All maturities are now past (June 2026) so status = MATURED
-- ─────────────────────────────────────────────────────────────────────────────

-- RHB Bank FD (Study Centre) — 1 cert
INSERT INTO fd_certificates
  (account_id, date_of_issue, certificate_no, principal, term_months, interest_rate, maturity_date, is_reissued, status, notes)
SELECT
  (SELECT id FROM bank_accounts WHERE bank_name = 'RHB Bank' AND account_type = 'FIXED_DEPOSIT' LIMIT 1),
  '2025-08-21', '112-102061-238', 130000.00, 6, 3.5000, '2026-02-21', false, 'MATURED',
  'On behalf of Lutheran Study Centre (LSC)';

-- Public Bank FD (LCM) — 9 active certs, all reissued 12 Nov 2021
INSERT INTO fd_certificates
  (account_id, date_of_issue, certificate_no, principal, term_months, interest_rate, maturity_date,
   is_reissued, reissue_date, new_certificate_no, new_principal, status)
SELECT
  (SELECT id FROM bank_accounts WHERE bank_name = 'Public Bank' AND account_type = 'FIXED_DEPOSIT' LIMIT 1),
  t.issue_date, t.orig_cert, t.orig_principal, t.term, t.rate, t.maturity,
  true, '2021-11-12', t.new_cert, t.new_principal, 'MATURED'
FROM (VALUES
  ('2016-01-14'::DATE, '983352', 200000.00, 3, 1.9500, '2026-01-14'::DATE, '863206', 234825.21),
  ('2016-01-14'::DATE, '983354', 200000.00, 3, 1.9500, '2026-01-14'::DATE, '863207', 234825.21),
  ('2016-01-14'::DATE, '983353', 200000.00, 3, 1.9500, '2026-01-14'::DATE, '863208', 234825.21),
  ('2016-01-14'::DATE, '983357', 300000.00, 6, 2.1500, '2026-01-14'::DATE, '863209', 351859.10),
  ('2016-01-14'::DATE, '983359', 200000.00, 6, 2.1500, '2026-01-14'::DATE, '863210', 234572.74),
  ('2016-01-14'::DATE, '983360', 200000.00, 6, 2.1500, '2026-01-14'::DATE, '863211', 234572.74),
  ('2016-01-14'::DATE, '983361', 200000.00, 6, 2.1500, '2026-01-14'::DATE, '863212', 234572.74),
  ('2016-01-14'::DATE, '983362', 200000.00, 6, 2.1500, '2026-01-14'::DATE, '863213', 234572.74),
  ('2016-01-14'::DATE, '983363', 200000.00, 6, 2.1500, '2026-01-14'::DATE, '863214', 234572.74)
) AS t(issue_date, orig_cert, orig_principal, term, rate, maturity, new_cert, new_principal);

-- Public Bank FD (LCM) — 4 withdrawn certs (from Withdrawal sheet)
INSERT INTO fd_certificates
  (account_id, date_of_issue, certificate_no, principal, term_months, interest_rate, maturity_date, status)
SELECT
  (SELECT id FROM bank_accounts WHERE bank_name = 'Public Bank' AND account_type = 'FIXED_DEPOSIT' LIMIT 1),
  '2021-12-14', t.cert_no, 104595.47, t.term, t.rate, t.maturity, 'WITHDRAWN'
FROM (VALUES
  ('863369', 1, 2.5000, '2025-02-04'::DATE),
  ('863368', 1, 2.5000, '2025-04-04'::DATE),
  ('863367', 1, 2.5000, '2025-04-04'::DATE),
  ('863366', 1, 2.1000, '2025-12-04'::DATE)
) AS t(cert_no, term, rate, maturity);

-- Affin Bank FD (General) — 9 certs, auto-renewed Mar 2025 → new maturity Mar 2026
INSERT INTO fd_certificates
  (account_id, date_of_issue, certificate_no, principal, term_months, interest_rate, maturity_date,
   is_reissued, reissue_date, status, notes)
SELECT
  (SELECT id FROM bank_accounts WHERE bank_name = 'Affin Bank' AND account_type = 'FIXED_DEPOSIT' LIMIT 1),
  '2024-03-27', t.cert_no, t.principal, 12, 3.7500, '2026-03-27',
  true, '2025-03-27', 'MATURED', NULL
FROM (VALUES
  ('30-191-000155-5', 200000.00),
  ('30-191-000156-8', 200000.00),
  ('30-191-000157-1', 200000.00),
  ('30-191-000158-4', 200000.00),
  ('30-191-000159-7', 200000.00),
  ('30-191-000160-7', 200000.00),
  ('30-191-000161-0', 200000.00),
  ('30-191-000162-3',  88110.29),
  ('30-191-000163-6', 135517.53)
) AS t(cert_no, principal);

-- Maybank FD (LCM) — 3 active certs, reissued May 2022
INSERT INTO fd_certificates
  (account_id, date_of_issue, certificate_no, principal, term_months, interest_rate, maturity_date,
   is_reissued, reissue_date, new_certificate_no, new_principal, status)
SELECT
  (SELECT id FROM bank_accounts WHERE bank_name = 'Maybank' AND account_type = 'FIXED_DEPOSIT' LIMIT 1),
  t.issue_date, t.orig_cert, t.orig_principal, t.term, t.rate, t.maturity,
  true, '2022-05-10', t.new_cert, t.new_principal, 'MATURED'
FROM (VALUES
  ('1995-03-23'::DATE, '006611',  3000.00,    12, 2.4500, '2026-03-23'::DATE, '5071108',  8687.20),
  ('2015-10-08'::DATE, 'A440897', 107971.13,   5, 2.0500, '2026-03-08'::DATE, 'A831916',  129041.76),
  ('2015-10-08'::DATE, 'A440898', 155331.62,   5, 2.0500, '2026-03-08'::DATE, 'A831917',  185644.65)
) AS t(issue_date, orig_cert, orig_principal, term, rate, maturity, new_cert, new_principal);

-- Maybank FD (LCM) — 1 withdrawn cert (from Withdrawal sheet)
INSERT INTO fd_certificates
  (account_id, date_of_issue, certificate_no, principal, term_months, interest_rate, maturity_date, status)
SELECT
  (SELECT id FROM bank_accounts WHERE bank_name = 'Maybank' AND account_type = 'FIXED_DEPOSIT' LIMIT 1),
  '2022-05-10', '5071109', 356756.45, 6, 2.4500, '2025-12-17', 'WITHDRAWN';

-- Hong Leong Bank FD (Lutheran Garden) — 7 certs, auto-renewed, interest paid separately to account
INSERT INTO fd_certificates
  (account_id, date_of_issue, certificate_no, principal, term_months, interest_rate, maturity_date, status, notes)
SELECT
  (SELECT id FROM bank_accounts WHERE bank_name = 'Hong Leong Bank' AND account_type = 'FIXED_DEPOSIT' LIMIT 1),
  '2024-05-03', t.cert_no, t.principal, 6, 2.0500, '2026-05-04', 'MATURED',
  'Interest payable to account (not added to principal)'
FROM (VALUES
  ('177-68041858', 200000.00),
  ('177-68041859', 200000.00),
  ('177-68041860', 200000.00),
  ('177-68041861', 200000.00),
  ('177-68041862', 200000.00),
  ('177-68041863', 200000.00),
  ('177-68041874',  86992.25)
) AS t(cert_no, principal);

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed FD Withdrawal records
-- ─────────────────────────────────────────────────────────────────────────────

-- PBB withdrawals (4 certs) — credited to Public Bank Disbursement Account
INSERT INTO fd_withdrawals
  (certificate_id, withdrawal_date, credit_to_account_id, amount_credited, notes, interest_by_year)
SELECT
  c.id,
  t.withdrawal_date,
  (SELECT id FROM bank_accounts WHERE bank_name = 'Public Bank' AND account_type = 'CURRENT' LIMIT 1),
  t.amount_credited,
  'Credited to PBB 3139186733',
  t.interest_by_year
FROM fd_certificates c
JOIN (VALUES
  ('863369', '2025-02-04'::DATE, 112164.20, '{"2023": 9090.23, "2024": 2616.19, "2025": 457.78}'::JSONB),
  ('863368', '2025-04-04'::DATE, 112545.27, '{"2023": 9090.23, "2024": 2616.19, "2025": 838.85}'::JSONB),
  ('863367', '2025-04-04'::DATE, 112545.27, '{"2023": 9090.23, "2024": 2616.19, "2025": 838.85}'::JSONB),
  ('863366', '2025-12-04'::DATE, 114011.39, '{"2023": 9090.23, "2024": 2616.19, "2025": 2304.97}'::JSONB)
) AS t(cert_no, withdrawal_date, amount_credited, interest_by_year)
  ON c.certificate_no = t.cert_no
WHERE c.account_id = (SELECT id FROM bank_accounts WHERE bank_name = 'Public Bank' AND account_type = 'FIXED_DEPOSIT' LIMIT 1);

-- MBB withdrawal (1 cert) — credited to Main Collection Account (Maybank LCM)
INSERT INTO fd_withdrawals
  (certificate_id, withdrawal_date, credit_to_account_id, amount_credited, notes, interest_by_year)
SELECT
  c.id,
  '2025-12-17'::DATE,
  (SELECT id FROM bank_accounts WHERE bank_name = 'Maybank' AND entity = 'LCM' AND account_type = 'CURRENT' LIMIT 1),
  394126.62,
  'Credited to MBB 014169325999',
  '{"2023": 70843.33, "2024": 9413.08, "2025": 13870.21}'::JSONB
FROM fd_certificates c
WHERE c.certificate_no = '5071109'
  AND c.account_id = (SELECT id FROM bank_accounts WHERE bank_name = 'Maybank' AND account_type = 'FIXED_DEPOSIT' LIMIT 1);
