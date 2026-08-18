-- 133: the SKBBK rate, and the month it starts.
--
-- From PERKESO's Pekeliling Majikan Bil. 02/2026, which extends Skim Lindung
-- 24 Jam and takes effect 1 June 2026. The rate comes off the Third Schedule
-- attached to it, where SKBBK is the employee's "BUKAN BENCANA KERJA"
-- (non-employment injury) column — the 24-hour cover, employee-side only, with
-- no employer twin, which is why there is one field here and not two.
--
-- 0.75%. The schedule is a wage-band table rather than a percentage, so this
-- was derived from it: employee invalidity is exactly 0.5% of each band's
-- midpoint, which gives the wage for every row, and SKBBK against that wage
-- comes to a mean of 0.7502% across the 44 bands (min 0.7462%, max 0.7545% —
-- the spread is entirely the schedule rounding to 5 sen). SKBBK is exactly
-- 1.5x the SOCSO employee rate in every band.
--
-- Using a straight percentage rather than the band table is the same choice
-- already made for SOCSO and EIS, and calc.ts documents the tradeoff: within a
-- few sen of the published schedule, exact at the employee figures. Wiring the
-- cent-perfect PERKESO schedule is a separate piece of work and would want to
-- cover SOCSO and EIS at the same time.

-- ── When it starts ────────────────────────────────────────────────────────
-- The rate table is keyed by year, and this scheme begins in June. Without a
-- start month, setting the rate for 2026 would deduct SKBBK from January and
-- the yearly sheet would show five months of contributions that were never
-- taken — with the annual total wrong to match.
--
-- Deliberately a column on the rate row rather than a hardcoded date: every
-- other statutory change so far has arrived the same way, part-way through a
-- year, and the next one will too.
ALTER TABLE payroll_statutory_rates
  ADD COLUMN IF NOT EXISTS skbbk_from_month INT NOT NULL DEFAULT 1
    CHECK (skbbk_from_month BETWEEN 1 AND 13);

COMMENT ON COLUMN payroll_statutory_rates.skbbk_from_month IS
  'First month of the year SKBBK is deducted. 1 = the whole year. 2026 = 6, per PERKESO Bil. 02/2026 effective 01.06.2026.';

UPDATE payroll_statutory_rates
   SET skbbk_ee = 0.0075, skbbk_ceiling = socso_ceiling, skbbk_from_month = 6
 WHERE year = 2026;

-- 2025 and earlier predate the scheme entirely: rate stays zero, and the start
-- month is irrelevant while it is.
