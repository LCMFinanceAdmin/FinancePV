-- 264 — What else follows from not being a citizen: SOCSO and EPF.
--
-- Migration 263 took EIS out for foreign nationals and deliberately stopped
-- there, because the other two are not one rule each.
--
-- SOCSO. Foreign workers other than domestic servants have been covered since
-- January 2019 under the Employment Injury Scheme only — Category 2, the
-- employer contributing and the employee nothing. That is the same category
-- an employee of 60 falls into for an entirely different reason, and PERKESO
-- files both off the same column of the same schedule. So nothing new is
-- needed: the existing Category 2 figures serve, and the only change is who
-- reaches them. The column keeps the name `socso_er_over60` because renaming
-- it across the bands, the rate table and two pages would move no money and
-- break every query written against it.
--
-- EPF. This one is an election, not a status. A foreign employee is not an
-- EPF member by default; they may choose to contribute, and then the employee
-- pays a rate while the EMPLOYER pays a flat sum per month rather than a
-- percentage — the only place in this payroll where an employer contribution
-- is not a rate on the wage. So it takes a flag on the person and three
-- figures on the rate table.
--
-- THE THREE FIGURES ARE SET HERE AT THE COMMONLY CITED ONES AND ARE EDITABLE
-- ON THE STATUTORY RATES PAGE. They are not derived from anything and must be
-- confirmed against KWSP's own Third Schedule before the first run that uses
-- them. A rate nobody checked is worth less than a blank one, because a blank
-- is visibly unset.

BEGIN;

-- ── The election ─────────────────────────────────────────────────────────
ALTER TABLE payroll_employees
  ADD COLUMN IF NOT EXISTS epf_foreigner_elected BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN payroll_employees.epf_foreigner_elected IS
  'A foreign national who has elected to contribute to EPF. Read only when '
  'is_foreigner is true: without the election neither side contributes at all, '
  'because a foreign employee is not an EPF member by default. With it, the '
  'employee pays epf_ee_foreigner (or the 60+ rate) and the employer the flat '
  'epf_er_foreigner_flat. See migration 264.';

-- ── The three figures ────────────────────────────────────────────────────
ALTER TABLE payroll_statutory_rates
  ADD COLUMN IF NOT EXISTS epf_ee_foreigner        NUMERIC,
  ADD COLUMN IF NOT EXISTS epf_ee_foreigner_over60 NUMERIC,
  ADD COLUMN IF NOT EXISTS epf_er_foreigner_flat   NUMERIC;

COMMENT ON COLUMN payroll_statutory_rates.epf_ee_foreigner IS
  'Employee EPF rate for a foreign national who has elected to contribute, '
  'under 60. Banded and rounded like every other EPF rate.';
COMMENT ON COLUMN payroll_statutory_rates.epf_ee_foreigner_over60 IS
  'The same, from 60. Only reached where they are still contributing at 60+, '
  'which epf_over60_contributing governs exactly as it does for a citizen.';
COMMENT ON COLUMN payroll_statutory_rates.epf_er_foreigner_flat IS
  'The employer share for a contributing foreign national: a FLAT SUM IN '
  'RINGGIT per month, not a rate on the wage. The only employer contribution '
  'in this payroll that is not a percentage.';

UPDATE payroll_statutory_rates
   SET epf_ee_foreigner        = COALESCE(epf_ee_foreigner,        0.11),
       epf_ee_foreigner_over60 = COALESCE(epf_ee_foreigner_over60, 0.055),
       epf_er_foreigner_flat   = COALESCE(epf_er_foreigner_flat,   5.00);

-- ── The two people it applies to ─────────────────────────────────────────
-- Both have had an employee share deducted all year, so both have evidently
-- been contributing. Recording that keeps the employee side as it stands and
-- moves only the employer's, which is the half that was wrong.
UPDATE payroll_employees
   SET epf_foreigner_elected = TRUE, updated_at = NOW()
 WHERE is_foreigner AND emp_no IN ('EMP-173', 'EMP-161');

COMMIT;
