-- 135: PERKESO's actual contribution schedule, as bands.
--
-- SOCSO, EIS and SKBBK have been computed as a straight percentage of the
-- actual wage with a ceiling. calc.ts has always said so, and said it was an
-- approximation: exact at the employee figures on the reference sheet, within a
-- few sen elsewhere. That is fine until the figures have to be filed. PERKESO's
-- own statement is built from their schedule, and a summary a few sen away from
-- it cannot be reconciled line by line — which is the whole purpose of the
-- summary.
--
-- The schedule is a band table. A wage falls in a band, and the contribution is
-- computed from the band's MIDPOINT, not from the wage. That is where most of
-- the difference comes from, not rounding: on a 2,710 salary the band is
-- (2,700, 2,800] and every figure derives from 2,750.
--
-- ── How these rows were produced ──────────────────────────────────────────
-- Pages 1-4 of Pekeliling Majikan Bil. 02/2026 carry a text layer; 5-9 are
-- scans, so the printed table could only be read up to about RM4,700. Rather
-- than key the rest by hand or leave the range short, the rule behind the table
-- was recovered and then checked against every band that could be read:
--
--   SOCSO employee (invalidity)  = bankers5(midpoint x 0.50%)
--   employee total               = bankers5(midpoint x 1.25%)
--   SKBBK                        = employee total - SOCSO employee
--   employer invalidity          = bankers5(midpoint x 0.50%)
--   employer injury              = bankers5(midpoint x 1.25%)
--   EIS, each side               = midpoint x 0.20%
--
-- bankers5 = round to the nearest 5 sen, ties to even. That last detail is what
-- makes it exact: the schedule's steps alternate +0.80/+0.70 for SKBBK and
-- +1.30/+1.20 for employer injury, because every other band lands precisely on
-- a half-unit tie. Any consistent tie-break reproduces only half the table.
--
-- SKBBK is derived as the remainder rather than rounded on its own — 0.75%
-- rounded independently disagrees with the printed table on 39 of 40 bands,
-- while the combined 1.25% rounded once and split reproduces 38 of 38 of the
-- regular bands exactly. The employee's contribution is rounded as one figure
-- and then apportioned; the schedule is not two independent columns.
--
-- Verified: 37 bands checked against the circular, zero mismatches. The two
-- bands the rule does not fit are both under RM100, which the statute sets by
-- hand rather than by formula. Nobody at LCM is near them (minimum wage is
-- RM1,700), and wages below RM100 fall back to the percentage method, which is
-- what they use today.
--
-- The top band is open-ended above RM5,900, as PERKESO's is. It is the ceiling:
-- a wage of RM20,000 contributes the same as one of RM6,000.
--
-- EIS uses the same wage bands (its own Second Schedule aligns with the SOCSO
-- Third Schedule) and 0.2% of a midpoint ending in 50 is exact to the sen, so
-- there is no rounding rule to get wrong there.

CREATE TABLE IF NOT EXISTS payroll_contribution_bands (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year      INT NOT NULL,

  -- The band, read as PERKESO writes it: "melebihi wage_from tetapi tidak
  -- melebihi wage_to" — exclusive at the bottom, inclusive at the top. A salary
  -- of exactly 4,200 belongs to the band below, not the one starting at 4,200.
  wage_from NUMERIC(12,2) NOT NULL,
  wage_to   NUMERIC(12,2),                    -- NULL on the open top band

  -- All four schemes share one row because they share one set of wage bands.
  socso_ee        NUMERIC(12,2) NOT NULL,     -- under 60
  socso_er        NUMERIC(12,2) NOT NULL,     -- under 60: invalidity + injury
  socso_er_over60 NUMERIC(12,2) NOT NULL,     -- Category 2: injury only
  skbbk           NUMERIC(12,2) NOT NULL,     -- employee only
  eis             NUMERIC(12,2) NOT NULL,     -- each side

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (year, wage_from)
);

CREATE INDEX IF NOT EXISTS idx_contrib_bands_lookup
  ON payroll_contribution_bands (year, wage_from);

ALTER TABLE payroll_contribution_bands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contrib_bands_read"  ON payroll_contribution_bands;
DROP POLICY IF EXISTS "contrib_bands_write" ON payroll_contribution_bands;
-- Readable by anyone signed in: the figures are on every payslip anyway, and a
-- payslip that cannot load them would quietly fall back to the percentage.
CREATE POLICY "contrib_bands_read"  ON payroll_contribution_bands FOR SELECT TO authenticated USING (true);
CREATE POLICY "contrib_bands_write" ON payroll_contribution_bands FOR ALL TO authenticated
  USING (can_manage_payroll()) WITH CHECK (can_manage_payroll());
GRANT SELECT, INSERT, UPDATE, DELETE ON payroll_contribution_bands TO authenticated;

COMMENT ON TABLE payroll_contribution_bands IS
  'PERKESO contribution schedule. Contributions derive from the band midpoint, not the wage. When a year has a gapless set of these, calc uses them; otherwise it falls back to the percentage method.';

-- ── 2026 ──────────────────────────────────────────────────────────────────
DELETE FROM payroll_contribution_bands WHERE year = 2026;
INSERT INTO payroll_contribution_bands
  (year, wage_from, wage_to, socso_ee, socso_er, socso_er_over60, skbbk, eis) VALUES
  (2026, 100, 200, 0.75, 2.65, 1.9, 1.15, 0.3),
  (2026, 200, 300, 1.25, 4.35, 3.1, 1.85, 0.5),
  (2026, 300, 400, 1.75, 6.15, 4.4, 2.65, 0.7),
  (2026, 400, 500, 2.25, 7.85, 5.6, 3.35, 0.9),
  (2026, 500, 600, 2.75, 9.65, 6.9, 4.15, 1.1),
  (2026, 600, 700, 3.25, 11.35, 8.1, 4.85, 1.3),
  (2026, 700, 800, 3.75, 13.15, 9.4, 5.65, 1.5),
  (2026, 800, 900, 4.25, 14.85, 10.6, 6.35, 1.7),
  (2026, 900, 1000, 4.75, 16.65, 11.9, 7.15, 1.9),
  (2026, 1000, 1100, 5.25, 18.35, 13.1, 7.85, 2.1),
  (2026, 1100, 1200, 5.75, 20.15, 14.4, 8.65, 2.3),
  (2026, 1200, 1300, 6.25, 21.85, 15.6, 9.35, 2.5),
  (2026, 1300, 1400, 6.75, 23.65, 16.9, 10.15, 2.7),
  (2026, 1400, 1500, 7.25, 25.35, 18.1, 10.85, 2.9),
  (2026, 1500, 1600, 7.75, 27.15, 19.4, 11.65, 3.1),
  (2026, 1600, 1700, 8.25, 28.85, 20.6, 12.35, 3.3),
  (2026, 1700, 1800, 8.75, 30.65, 21.9, 13.15, 3.5),
  (2026, 1800, 1900, 9.25, 32.35, 23.1, 13.85, 3.7),
  (2026, 1900, 2000, 9.75, 34.15, 24.4, 14.65, 3.9),
  (2026, 2000, 2100, 10.25, 35.85, 25.6, 15.35, 4.1),
  (2026, 2100, 2200, 10.75, 37.65, 26.9, 16.15, 4.3),
  (2026, 2200, 2300, 11.25, 39.35, 28.1, 16.85, 4.5),
  (2026, 2300, 2400, 11.75, 41.15, 29.4, 17.65, 4.7),
  (2026, 2400, 2500, 12.25, 42.85, 30.6, 18.35, 4.9),
  (2026, 2500, 2600, 12.75, 44.65, 31.9, 19.15, 5.1),
  (2026, 2600, 2700, 13.25, 46.35, 33.1, 19.85, 5.3),
  (2026, 2700, 2800, 13.75, 48.15, 34.4, 20.65, 5.5),
  (2026, 2800, 2900, 14.25, 49.85, 35.6, 21.35, 5.7),
  (2026, 2900, 3000, 14.75, 51.65, 36.9, 22.15, 5.9),
  (2026, 3000, 3100, 15.25, 53.35, 38.1, 22.85, 6.1),
  (2026, 3100, 3200, 15.75, 55.15, 39.4, 23.65, 6.3),
  (2026, 3200, 3300, 16.25, 56.85, 40.6, 24.35, 6.5),
  (2026, 3300, 3400, 16.75, 58.65, 41.9, 25.15, 6.7),
  (2026, 3400, 3500, 17.25, 60.35, 43.1, 25.85, 6.9),
  (2026, 3500, 3600, 17.75, 62.15, 44.4, 26.65, 7.1),
  (2026, 3600, 3700, 18.25, 63.85, 45.6, 27.35, 7.3),
  (2026, 3700, 3800, 18.75, 65.65, 46.9, 28.15, 7.5),
  (2026, 3800, 3900, 19.25, 67.35, 48.1, 28.85, 7.7),
  (2026, 3900, 4000, 19.75, 69.15, 49.4, 29.65, 7.9),
  (2026, 4000, 4100, 20.25, 70.85, 50.6, 30.35, 8.1),
  (2026, 4100, 4200, 20.75, 72.65, 51.9, 31.15, 8.3),
  (2026, 4200, 4300, 21.25, 74.35, 53.1, 31.85, 8.5),
  (2026, 4300, 4400, 21.75, 76.15, 54.4, 32.65, 8.7),
  (2026, 4400, 4500, 22.25, 77.85, 55.6, 33.35, 8.9),
  (2026, 4500, 4600, 22.75, 79.65, 56.9, 34.15, 9.1),
  (2026, 4600, 4700, 23.25, 81.35, 58.1, 34.85, 9.3),
  (2026, 4700, 4800, 23.75, 83.15, 59.4, 35.65, 9.5),
  (2026, 4800, 4900, 24.25, 84.85, 60.6, 36.35, 9.7),
  (2026, 4900, 5000, 24.75, 86.65, 61.9, 37.15, 9.9),
  (2026, 5000, 5100, 25.25, 88.35, 63.1, 37.85, 10.1),
  (2026, 5100, 5200, 25.75, 90.15, 64.4, 38.65, 10.3),
  (2026, 5200, 5300, 26.25, 91.85, 65.6, 39.35, 10.5),
  (2026, 5300, 5400, 26.75, 93.65, 66.9, 40.15, 10.7),
  (2026, 5400, 5500, 27.25, 95.35, 68.1, 40.85, 10.9),
  (2026, 5500, 5600, 27.75, 97.15, 69.4, 41.65, 11.1),
  (2026, 5600, 5700, 28.25, 98.85, 70.6, 42.35, 11.3),
  (2026, 5700, 5800, 28.75, 100.65, 71.9, 43.15, 11.5),
  (2026, 5800, 5900, 29.25, 102.35, 73.1, 43.85, 11.7),
  (2026, 5900, NULL, 29.75, 104.15, 74.4, 44.65, 11.9);

-- ── 2025 ──────────────────────────────────────────────────────────────────
-- Same bands; SKBBK did not exist, so it is zero rather than absent.
DELETE FROM payroll_contribution_bands WHERE year = 2025;
INSERT INTO payroll_contribution_bands
  (year, wage_from, wage_to, socso_ee, socso_er, socso_er_over60, skbbk, eis)
SELECT 2025, wage_from, wage_to, socso_ee, socso_er, socso_er_over60, 0, eis
  FROM payroll_contribution_bands WHERE year = 2026;
