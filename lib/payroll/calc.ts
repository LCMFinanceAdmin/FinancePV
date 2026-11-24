// Payroll calculation engine — Phase 2.
//
// Hybrid statutory model: EPF / SOCSO / EIS are auto-calculated here; PCB is keyed
// manually. Rates are current LCM policy hardcoded for now; Phase 3 moves them into
// admin-editable rate tables. Verified against the TAN EE YAN (2025) reference sheet.
//
// NOTE on exactness: EPF matches KWSP's contribution schedule via the RM20 wage-band
// + round-up method.
//
// SOCSO, EIS and SKBBK come from PERKESO's own contribution schedule when it is
// loaded for the year (payroll_contribution_bands, migration 135). Those figures
// derive from the band's MIDPOINT rather than the wage, which is what PERKESO's
// statement is built from, so a filed summary reconciles against theirs line by
// line.
//
// The straight-percentage method below is the fallback, used when no band covers
// the wage — in practice only below the bottom of the schedule. It is within a
// few sen of the published figures but not identical, and the two are never
// mixed within one payslip: a wage either finds a band or it does not.

import type { AdjustmentCategory, EmploymentType } from "@/lib/types";

export type { AdjustmentCategory };

// Editable statutory rate config (from payroll_statutory_rates; fractions, 0.11 = 11%).
export interface RateConfig {
  epf_ee_under60: number; epf_er_under60: number;
  epf_ee_over60: number; epf_er_over60: number;
  epf_ee_orang_asli: number; epf_er_orang_asli: number;
  socso_ee: number; socso_er: number; socso_er_over60: number; socso_ceiling: number;
  eis_rate: number; eis_ceiling: number;
  // SKBBK (Lindung 24) — employee side only, so there is no employer twin here.
  skbbk_ee: number; skbbk_ceiling: number;
  /**
   * First month of the year SKBBK applies. 1 means the whole year.
   *
   * The rate table is keyed by year and this scheme began in June 2026, so
   * without this the rate would reach back to January and deduct five months
   * that were never taken. See migration 133.
   */
  skbbk_from_month?: number;
  /**
   * The last month of the year in which SKBBK is compulsory for everybody,
   * opt-out or not. Undefined means an opt-out is honoured all year.
   *
   * The scheme opened in June 2026 with everyone enrolled, and leaving it
   * takes effect from a later month rather than unwinding the ones already
   * deducted, remitted and filed. Without this, ticking "opted out" emptied
   * June as well and the sheet no longer matched the PERKESO return.
   *
   * Counts from the scheme's start, never before it: see `skbbk_from_month`.
   */
  skbbk_mandatory_to_month?: number;
  /**
   * EPF for a foreign national who has elected to contribute.
   *
   * The employee pays a rate like anybody else; the employer pays a FLAT SUM
   * IN RINGGIT per month, which is the only employer contribution in this
   * payroll that is not a percentage of the wage. Without the election
   * neither side pays at all — a foreign employee is not a member by default.
   *
   * Set from the rate table and editable there. Nothing derives them.
   */
  epf_ee_foreigner?: number;
  epf_ee_foreigner_over60?: number;
  epf_er_foreigner_flat?: number;
  /**
   * The age at which EPF stops accepting contributions altogether.
   *
   * Distinct from 60. At 60 an employee may keep contributing or step out,
   * and the employer pays either way. At this age neither side may pay in,
   * so there is nothing to opt into and nothing for the employer to match.
   */
  epf_ceases_age?: number;
  /**
   * The wage at which EPF's Third Schedule changes shape.
   *
   * At or below it the table steps in RM20 and the employer's statutory
   * share is 13%. Above it the steps are RM100 and the statutory share is
   * 12%. LCM pays three points above statutory, so its own employer rate
   * steps down with it — 16% to 15% — while the employee's 11% does not
   * move. Getting the step wrong is worth tens of ringgit a month to the
   * handful of people it reaches.
   */
  epf_wage_threshold?: number;
  /** Employer rate above the threshold: statutory 12% plus LCM's three. */
  epf_er_under60_over_threshold?: number;
  /**
   * Orang Asli employer rate above the threshold: plain statutory 12%.
   *
   * Their rate below the threshold is the bare statutory 13% rather than
   * 16%, so the three points are not added here either. Nobody on the
   * current payroll earns above the threshold, so unlike every other rate
   * here this one has never been checked against a real payslip.
   */
  epf_er_orang_asli_over_threshold?: number;
}

// Current LCM defaults — used when no year row is loaded.
export const DEFAULT_RATES: RateConfig = {
  epf_ee_under60: 0.11, epf_er_under60: 0.16,
  epf_ee_over60: 0.0, epf_er_over60: 0.07,
  epf_ee_orang_asli: 0.11, epf_er_orang_asli: 0.13,
  socso_ee: 0.005, socso_er: 0.0175, socso_er_over60: 0.0125, socso_ceiling: 6000,
  eis_rate: 0.002, eis_ceiling: 6000,
  // Zero until Finance enters the PERKESO figure. A blank deducts nothing and
  // is visibly unset; a guessed rate would quietly take the wrong amount from
  // every salary, which is the worse failure by far.
  skbbk_ee: 0, skbbk_ceiling: 6000, skbbk_from_month: 1,
  epf_ee_foreigner: 0.11, epf_ee_foreigner_over60: 0.055, epf_er_foreigner_flat: 5,
  epf_ceases_age: 75,
  epf_wage_threshold: 5000,
  epf_er_under60_over_threshold: 0.15,
  epf_er_orang_asli_over_threshold: 0.12,
};

export interface CalcAdjustment {
  category: AdjustmentCategory;
  /** Signed. Always means "add this to the named figure" — see migration 131. */
  amount: number;
  reason?: string;
}

/** What the adjustments come to, per figure. Absent categories are simply 0. */
function sumAdjustments(adj: CalcAdjustment[]): Record<AdjustmentCategory, number> {
  const out = {
    GROSS: 0, PCB: 0, EPF_EE: 0, EPF_ER: 0, SOCSO_EE: 0, SOCSO_ER: 0,
    SKBBK: 0, EIS_EE: 0, EIS_ER: 0, NET: 0,
  } as Record<AdjustmentCategory, number>;
  for (const a of adj) out[a.category] = round2(out[a.category] + Number(a.amount || 0));
  return out;
}

/**
 * One row of PERKESO's contribution schedule. See migration 135.
 *
 * The band is read as PERKESO writes it — "melebihi wage_from tetapi tidak
 * melebihi wage_to" — so it is exclusive at the bottom and inclusive at the top.
 * A salary of exactly 4,200 belongs to the band below the one starting there.
 */
export interface ContributionBand {
  wage_from: number;
  wage_to: number | null;   // null on the open top band, which is the ceiling
  socso_ee: number;
  socso_er: number;
  socso_er_over60: number;
  skbbk: number;
  eis: number;
}

/**
 * The band a wage falls in, or null if the schedule does not cover it.
 *
 * Null is the important case: it is what makes a partly-loaded schedule fall
 * back to the percentage method for everybody rather than apply the table to
 * some wages and the formula to others. Two methods running side by side would
 * be far harder to explain than one that is merely approximate.
 */
export function findBand(bands: ContributionBand[] | undefined, gross: number): ContributionBand | null {
  if (!bands?.length) return null;
  return bands.find(b =>
    gross > b.wage_from && (b.wage_to === null || gross <= b.wage_to)) ?? null;
}

export interface StatPortion {
  ee: number;
  er: number;
  total: number;
}

export interface CalcInput {
  gross: number;
  age: number;                 // age in the month being computed
  employmentType: EmploymentType;
  isOrangAsli: boolean;
  voluntaryEpf: number;        // fixed RM, added to employee EPF
  manualPcb: number;           // keyed by Finance
  eplDeduction: number;        // monthly loan installment
  // Directed by PTPTN and remitted to them. A deduction like EPF or SOCSO in
  // handling, but owed by the employee to a third party rather than to LCM,
  // which is why it is its own figure and not an EPL instalment.
  ptptnDeduction?: number;
  is13thMonth: boolean;        // 13th month: EPF + PCB only, no SOCSO/EIS
  skbbkOptedOut?: boolean;     // opted out of SKBBK (Lindung 24) — then nothing is deducted
  /**
   * Neither a Malaysian citizen nor a permanent resident.
   *
   * EIS (Act 800) covers citizens and PRs, so a foreign national is outside
   * the scheme and nothing is contributed either side. A permanent resident
   * is not a foreigner here.
   *
   * Governs EIS alone. SOCSO has covered foreign workers since January 2019
   * on an employment-injury basis, and EPF is an election they may make, but
   * both of those are decisions LCM takes with PERKESO and KWSP rather than
   * consequences of nationality — so neither is touched by this.
   */
  isForeigner?: boolean;
  /**
   * A foreign national who has elected to contribute to EPF.
   *
   * Read only alongside `isForeigner`. A foreign employee is not an EPF
   * member by default, so without this neither side contributes; with it the
   * employee pays a rate and the employer a flat monthly sum.
   */
  epfForeignerElected?: boolean;
  /**
   * An employee aged 60 or over who has chosen to keep contributing to EPF.
   *
   * Past 60 the employee's own contribution becomes a choice. Step out and
   * only the employer pays, at the over-60 rate — which is what this
   * calculation assumed of everyone, because there was no way to say
   * otherwise. Stay in and both sides carry on at the ordinary rate, the
   * employee's 11% and the employer's 16%; no separate rate exists for a
   * contributing over-60, and inventing one would put a figure on a payslip
   * that no schedule backs.
   *
   * Anything paid ON TOP of that is voluntaryEpf, a flat sum, not a rate.
   */
  epfOver60Contributing?: boolean;
  /**
   * Unpaid leave taken in this month.
   *
   * Deducted AFTER the statutory figures, not before — EPF, SOCSO and EIS are
   * worked out on the full agreed wage and the unpaid days come off take-home
   * alone. That is the General Manager's instruction of November 2026, and it
   * is a choice rather than an oversight: the other reading, where the wage
   * actually payable carries the contributions, is the one this file uses for
   * somebody who joins mid-month (see `monthFraction`). The two now differ on
   * purpose, so a payslip showing full EPF against a short wage is right.
   *
   * A day is worth the month's pay divided by the month's calendar days — the
   * Employment Act's basis for an incomplete month, and the same divisor
   * `monthDays` uses, so February is over 28 and nobody is deducted a 30th of
   * their salary for a day they were not there.
   */
  unpaidLeave?: { days: number; daysInMonth: number };
  /**
   * The month being computed, 1-13. Only SKBBK reads it, to honour a scheme
   * that starts part-way through the year. Optional: a caller that does not
   * pass it gets the rate applied to every month, which is the right answer
   * for any year the scheme ran throughout.
   */
  month?: number;
  rates?: RateConfig;          // editable statutory config; defaults to current rates
  customItems?: Array<{ label?: string; type: "allowance" | "deduction"; amount: number }>;
  /**
   * Corrections landing in this month.
   *
   * Applied AFTER the statutory formulas, never fed back into them. An
   * adjustment exists precisely because the formula produced the wrong answer,
   * so recomputing from an adjusted figure would re-derive the error it was
   * written to fix — and a GROSS correction that quietly moved EPF, SOCSO and
   * EIS as well would make the one number Finance typed into four they did not.
   * Anything that should move alongside it is its own adjustment, named.
   */
  adjustments?: CalcAdjustment[];
  /**
   * PERKESO's schedule for the year.
   *
   * When a band covers this wage, SOCSO / EIS / SKBBK come from it rather than
   * from a percentage — that is what the filed figures have to match, since
   * PERKESO's own statement is built from the same table. Absent or not
   * covering the wage, the percentage method applies exactly as before.
   */
  bands?: ContributionBand[];
}

export interface CalcLine {
  gross: number;
  pcb: number;
  epf: StatPortion;
  eis: StatPortion;
  socso: StatPortion;
  /**
   * SKBBK (Lindung 24), the employee's alone.
   *
   * Kept out of totalContrib on purpose. That figure means "EPF + EIS + SOCSO"
   * everywhere it is displayed and filed, and folding a fourth scheme into it
   * would overstate SOCSO in the year-end returns. It is subtracted from net
   * in its own right instead.
   */
  skbbk: number;
  totalContrib: StatPortion;   // EPF + EIS + SOCSO, per side
  eplDeduction: number;
  ptptnDeduction: number;
  /** Unpaid leave: the days taken, and what they come to. Both, so a payslip
      can show the working rather than an unexplained deduction. */
  unpaidLeave: { days: number; amount: number; dayRate: number };
  net: number;                 // gross − pcb − employee contributions − SKBBK − EPL − PTPTN − unpaid leave ± custom items
  totalLcmPayment: number;     // gross + employer contributions + custom allowances
  customAllowances: number;
  customDeductions: number;
  customItems: Array<{ label: string; type: "allowance" | "deduction"; amount: number }>;
  /** What was applied, kept so a payslip can itemise it rather than just differ. */
  adjustments: CalcAdjustment[];
  /** The net-only adjustment, separated because it belongs to no scheme. */
  netAdjustment: number;
  /** Whether anything was adjusted at all — cheaper than re-summing at each call site. */
  hasAdjustments: boolean;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** An employee/employer pair with its total, rounded once. */
function portion(ee: number, er: number): StatPortion {
  return { ee: round2(ee), er: round2(er), total: round2(ee + er) };
}

// EPF rate tiers (employee %, employer %), from the editable rate config.
export interface EpfRates {
  ee: number;
  er: number;
  /**
   * A flat monthly sum in ringgit in place of the employer rate.
   *
   * Only a contributing foreign national has one. Present, it is the whole
   * employer contribution and `er` is not consulted — the wage does not enter
   * into it, which is the one case in this payroll where that is true.
   */
  erFlat?: number;
}

export function resolveEpfRates(
  input: {
    gross: number; age: number; employmentType: EmploymentType; isOrangAsli: boolean;
    epfOver60Contributing?: boolean; isForeigner?: boolean; epfForeignerElected?: boolean;
  },
  rates: RateConfig = DEFAULT_RATES,
): EpfRates {
  // Past the ceasing age the scheme is closed to both sides, whatever else
  // is true of the person. Checked first for that reason: an Orang Asli rate
  // or a standing choice to contribute cannot reopen it.
  if (input.age >= (rates.epf_ceases_age ?? 75)) return { ee: 0, er: 0 };

  // "Exceeding", as the schedule words it — a wage of exactly the threshold
  // is still in the lower table.
  const aboveThreshold = input.gross > (rates.epf_wage_threshold ?? 5000);

  // A foreign national is not an EPF member by default, so this is settled
  // before any of the ordinary rates are reached — none of them apply to
  // somebody the scheme does not cover.
  if (input.isForeigner) {
    if (!input.epfForeignerElected) return { ee: 0, er: 0, erFlat: 0 };
    // Stepping out at 60 works the same way it does for a citizen: the
    // employee stops and the employer does not, which is why the flat sum
    // stands either way.
    const contributing = input.age < 60 || input.epfOver60Contributing === true;
    const eeRate = input.age >= 60
      ? rates.epf_ee_foreigner_over60 ?? 0
      : rates.epf_ee_foreigner ?? 0;
    return {
      ee: contributing ? eeRate : 0,
      er: 0,
      erFlat: rates.epf_er_foreigner_flat ?? 0,
    };
  }

  if (input.isOrangAsli) {
    return {
      ee: rates.epf_ee_orang_asli,
      er: aboveThreshold
        ? rates.epf_er_orang_asli_over_threshold ?? rates.epf_er_orang_asli
        : rates.epf_er_orang_asli,
    };
  }
  const stillContributing = input.age < 60 || input.epfOver60Contributing === true;
  if (input.employmentType === "PERMANENT" && stillContributing) {
    return {
      ee: rates.epf_ee_under60,
      er: aboveThreshold
        ? rates.epf_er_under60_over_threshold ?? rates.epf_er_under60
        : rates.epf_er_under60,
    };
  }
  // Stepped out at 60+, or contract. The over-60 employer rate is 4% statutory
  // plus LCM's three either side of the threshold, so it does not step.
  return { ee: rates.epf_ee_over60, er: rates.epf_er_over60 };
}

// Annual increment effective month: joined before July → effective Jan; after July → effective July.
// A per-employee override (1 or 7) takes precedence for T&C-carved exceptions.
export function incrementEffectiveMonth(dateCommenced: string | null, override?: number | null): number {
  if (override === 1 || override === 7) return override;
  if (!dateCommenced) return 1;
  const joinMonth = new Date(dateCommenced).getMonth() + 1; // 1-based
  return joinMonth < 7 ? 1 : 7;
}

/**
 * When the current increment starts being paid, as an absolute month.
 *
 * An increment belongs to a twelve-month period, and the period is the thing
 * that decides when it is paid. Somebody taken on between July and December
 * has periods running July to June, so the increment granted for July 2026 to
 * June 2027 is payable in every one of those twelve months — including the
 * January to June at the far end of it.
 *
 * That is what the first version of this got wrong. It asked only "is this
 * month before the cycle month", which is the right question inside the year
 * an increment was granted and the wrong one afterwards: come January the same
 * increment was withheld a second time, and a pastor who had been paid it
 * since July lost RM100 a month for six months, every year, forever.
 *
 * So the period is found from the salary row's own effective date — the row
 * carrying the increment names the period it belongs to — and the increment is
 * paid from the start of that period onwards.
 *
 * Returns null where the row has no effective date, and the caller then falls
 * back to the older reading rather than guessing a period.
 */
export function incrementPaidFrom(
  effectiveFrom: string | null | undefined,
  dateCommenced: string | null,
  incrementMonthOverride?: number | null,
): { year: number; month: number } | null {
  if (!effectiveFrom) return null;
  const d = new Date(effectiveFrom);
  if (Number.isNaN(d.getTime())) return null;
  const eff = incrementEffectiveMonth(dateCommenced, incrementMonthOverride);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  // The period containing the effective date. On a January cycle that is the
  // calendar year; on a July cycle it began in July of this year or last.
  return { year: month >= eff ? year : year - 1, month: eff };
}

/** Is `(year, month)` at or after the month an increment starts being paid? */
function atOrAfter(year: number, month: number, from: { year: number; month: number }): boolean {
  return year > from.year || (year === from.year && month >= from.month);
}

// Agreed salary components that build up the gross.
export interface SalaryComponents {
  base_salary: number;
  stm_allowance: number;
  experience_bonus: number;
  family_allowance: number;
  increment_carried: number;
  increment_current: number;
}

// Full gross = base + carried increment + current increment + experience + family + STM.
export function fullGross(s: SalaryComponents): number {
  return Number(s.base_salary) + Number(s.increment_carried) + Number(s.increment_current)
    + Number(s.experience_bonus) + Number(s.family_allowance) + Number(s.stm_allowance);
}

// Gross for a given month, applying increment timing (current-year increment only
// from its effective month). The 13th month always uses the full gross.
export function grossForMonth(
  s: SalaryComponents,
  dateCommenced: string | null,
  month: number,
  is13th: boolean,
  incrementMonthOverride?: number | null,
  /** Optional. Absent means a whole month, which is what it was before this. */
  days?: MonthDays | null,
  /**
   * The year being computed, and the salary row's effective date.
   *
   * Together they say which increment period this month falls in. Absent, the
   * older reading applies — the increment is withheld before the cycle month
   * of every year — which is right within the year an increment was granted
   * and wrong after it. Every caller inside the app passes them.
   */
  period?: { year: number; effectiveFrom: string | null } | null,
): number {
  const full = fullGross(s);
  // A 13th month is a payment, not a month worked, so it is never pro-rated.
  if (is13th) return full;
  const eff = incrementEffectiveMonth(dateCommenced, incrementMonthOverride);
  const paidFrom = period
    ? incrementPaidFrom(period.effectiveFrom, dateCommenced, incrementMonthOverride)
    : null;
  const hasIncrement = paidFrom
    ? atOrAfter(period!.year, month, paidFrom)
    : month >= eff;
  const earned = hasIncrement ? full : full - Number(s.increment_current);
  return round2(earned * monthFraction(days));
}

/**
 * How much of a month somebody was actually employed for.
 *
 * Calendar days of that particular month, which is the basis the Employment
 * Act uses for an incomplete month — monthly wages, divided by the days in
 * the month, times the days eligible. Not 26 working days, and not a flat
 * 30: February pays a full month at 28 days, and joining on the 1st of any
 * month is a full month whatever its length.
 *
 * Returns the whole month when nothing interrupts it, so the ordinary case
 * costs nothing and reads as untouched.
 */
export interface MonthDays {
  daysInMonth: number;
  daysPaid: number;
  /** Why it is short. Null when the whole month is paid. */
  reason: "joined" | "left" | "joined and left" | null;
}

function dayIfInMonth(iso: string | null, year: number, month: number): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getFullYear() !== year || d.getMonth() + 1 !== month) return null;
  return d.getDate();
}

export function monthDays(
  dateCommenced: string | null,
  resignedDate: string | null,
  year: number,
  month: number,
): MonthDays {
  const daysInMonth = new Date(year, month, 0).getDate();
  const whole: MonthDays = { daysInMonth, daysPaid: daysInMonth, reason: null };

  // Employed for none of it: started after this month, or left before it.
  const start = dateCommenced ? new Date(dateCommenced) : null;
  const end = resignedDate ? new Date(resignedDate) : null;
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  if (start && !Number.isNaN(start.getTime()) && start > monthEnd) {
    return { daysInMonth, daysPaid: 0, reason: "joined" };
  }
  if (end && !Number.isNaN(end.getTime()) && end < monthStart) {
    return { daysInMonth, daysPaid: 0, reason: "left" };
  }

  const from = dayIfInMonth(dateCommenced, year, month);
  const to = dayIfInMonth(resignedDate, year, month);
  if (from === null && to === null) return whole;

  const firstDay = from ?? 1;
  // The day they leave is worked, so it counts.
  const lastDay = to ?? daysInMonth;
  const daysPaid = Math.max(0, lastDay - firstDay + 1);
  const reason: MonthDays["reason"] =
    from !== null && to !== null ? "joined and left" : from !== null ? "joined" : "left";
  return { daysInMonth, daysPaid, reason };
}

/**
 * Is this person owed pay for the month a run is paying?
 *
 * The run used to ask only whether they were ACTIVE, and that dropped a
 * leaver's final month on the floor. Somebody who left on the 15th is owed
 * half of it — `monthDays` above exists to work out exactly that, and takes a
 * resignation date for no other reason — but the moment the record read
 * RESIGNED they fell out of the run before the question was ever asked. The
 * pay did not come out short; the person simply was not there, and a run that
 * silently omits somebody looks identical to one that paid everybody.
 *
 * So the leaving date decides it rather than the status, with two exceptions.
 *
 * No leaving date is not a claim that they are still here. It is the absence
 * of one, and paying a wage on the strength of a date nobody recorded is the
 * worse mistake of the two — so that one stays out.
 *
 * And the 13th month belongs to the year rather than to a month of it, so
 * somebody who left in April is still in its population. How much of a bonus
 * that earns them is `thirteenthMonthFor`'s question, not this one.
 */
export function owedForRunMonth(
  emp: { status: string; date_commenced: string | null; resigned_date: string | null },
  year: number,
  /** 1-12, or 13 for the bonus. */
  month: number,
): boolean {
  if (emp.status === "ACTIVE") return true;
  if (emp.status !== "RESIGNED") return false;
  if (!emp.resigned_date) return false;
  if (month === 13) return emp.resigned_date >= `${year}-01-01`;
  return monthDays(emp.date_commenced, emp.resigned_date, year, month).daysPaid > 0;
}

/** The fraction to apply, 1 when the whole month is paid. */
export function monthFraction(d?: MonthDays | null): number {
  if (!d || d.daysInMonth <= 0 || d.daysPaid >= d.daysInMonth) return 1;
  return d.daysPaid / d.daysInMonth;
}

/**
 * Which part of the gross a line belongs to.
 *
 * The payslip lists six named components; the yearly sheet has room for four
 * columns. Rather than a second rule deciding which is which — and drifting —
 * each component says what it is as it is built.
 */
// The two increments are kept apart, because they answer different
// questions: "carried" is everything awarded since the year they started,
// and "current" is this increment year's own award — the one that is
// withheld until its effective month and is what somebody asks about when
// their pay changes mid-year.
export type GrossBucket =
  | "basic" | "carried" | "current" | "experience" | "allowance" | "incomplete";

export interface EarningComponent {
  label: string;
  amount: number;
  /** Set by grossComponentsForMonth. Optional, so callers may build their own. */
  bucket?: GrossBucket;
}

/**
 * The same figure as grossForMonth, itemised.
 *
 * A payslip has to show what makes up the gross, and both payslips used to
 * build that list themselves from the salary record. That list included the
 * current year's increment whenever it was non-zero, while grossForMonth leaves
 * it out until its effective month — so for anyone who joined after July, the
 * earnings printed on a January payslip added up to more than the GROSS PAY
 * printed underneath them.
 *
 * Returning the breakdown from the same rule that computes the total is the
 * only version of this that stays fixed. The two cannot disagree, because
 * there is no longer a second copy of the rule to drift.
 */
export function grossComponentsForMonth(
  s: SalaryComponents,
  dateCommenced: string | null,
  month: number,
  is13th: boolean,
  incrementMonthOverride?: number | null,
  days?: MonthDays | null,
  /** As grossForMonth: which increment period this month falls in. */
  period?: { year: number; effectiveFrom: string | null } | null,
): EarningComponent[] {
  const eff = incrementEffectiveMonth(dateCommenced, incrementMonthOverride);
  const paidFrom = period
    ? incrementPaidFrom(period.effectiveFrom, dateCommenced, incrementMonthOverride)
    : null;
  // The 13th month is paid on the full gross, so the increment always counts.
  const incrementApplies = is13th
    || (paidFrom
      ? (period!.year > paidFrom.year
          || (period!.year === paidFrom.year && month >= paidFrom.month))
      : month >= eff);

  const out: EarningComponent[] = [
    // Always listed, even at zero: a payslip with no basic salary line reads as
    // though something failed to load.
    { label: "Basic Salary", amount: Number(s.base_salary), bucket: "basic" },
  ];
  const add = (label: string, amount: number, bucket: GrossBucket) => {
    if (amount > 0) out.push({ label, amount, bucket });
  };
  add("Increment (accumulated)", Number(s.increment_carried), "carried");
  if (incrementApplies) add("Current year increment", Number(s.increment_current), "current");
  add("Experience bonus", Number(s.experience_bonus), "experience");
  add("Family allowance", Number(s.family_allowance), "allowance");
  add("STM / Allowance", Number(s.stm_allowance), "allowance");

  // An incomplete month is shown as what was agreed, less a named deduction,
  // rather than by quietly shrinking every line above. The agreed salary is
  // what the person recognises; scaling each component would leave a payslip
  // where no figure matches their letter of appointment and nothing says why.
  const fraction = monthFraction(days);
  if (!is13th && fraction < 1 && days) {
    const full = out.reduce((t, c) => t + c.amount, 0);
    out.push({
      label: `Incomplete month (${days.daysPaid} of ${days.daysInMonth} days, ${days.reason})`,
      amount: round2(full * fraction) - round2(full),
      bucket: "incomplete",
    });
  }
  return out;
}

/** The five figures the gross is built from, in the order they are shown. */
export type GrossPartKey = "basic" | "carried" | "current" | "experience" | "allowances";
export const GROSS_PART_KEYS: readonly GrossPartKey[] =
  ["basic", "carried", "current", "experience", "allowances"] as const;

export interface GrossPartAsAt {
  key: GrossPartKey;
  /** What it stands at by the end of the year. */
  value: number;
  /**
   * The month it reached that figure, 1-12, or null where it never moved.
   *
   * Null is the ordinary case and reads as "this is what it has been all
   * year". A number is the month a revision or a new contract took effect,
   * and it is the only thing on a one-line summary that can say so.
   */
  changedIn: number | null;
}

/**
 * The gross as it stands at the end of the year, and when each part got there.
 *
 * The make-up used to print a row per span of months, which is accurate and
 * says the same five things over and over. This says them once, against the
 * figures in force, and marks the ones that moved with the month they moved
 * in — which is what somebody is asking when a revision or a new contract
 * changed their pay part-way through.
 *
 * Only the latest move is reported. A basic that went up in May and again in
 * November is shown at its November figure, dated November; the step in May is
 * in the table above, month by month, which is where a full history belongs.
 *
 * Months nobody was employed for are skipped rather than counted as zero, so
 * starting in March is not reported as a rise in March.
 */
export function grossPartsAsAt(parts: (GrossBreakdown | null | undefined)[]): GrossPartAsAt[] {
  const live = parts
    .map((g, i) => ({ month: i + 1, g }))
    .filter((x): x is { month: number; g: GrossBreakdown } => !!x.g && x.g.gross > 0);
  if (live.length === 0) return [];
  return GROSS_PART_KEYS.map(key => {
    const value = live[live.length - 1].g[key];
    // Back through the year while the figure is unchanged. Where that reaches
    // the first month they were employed, it never moved.
    let i = live.length - 1;
    while (i > 0 && live[i - 1].g[key] === value) i--;
    return { key, value, changedIn: i === 0 ? null : live[i].month };
  });
}

/** The gross in four figures, as the yearly sheet shows it. */
export interface GrossBreakdown {
  basic: number;
  experience: number;
  /** Increments awarded since the year they commenced. */
  carried: number;
  /** This increment year's own award, once it is in payment. */
  current: number;
  allowances: number;
  /** The four above, added up. Equal to grossForMonth for the same arguments. */
  gross: number;
}

/**
 * The same figure as grossForMonth, in the four parts a sheet has room for.
 *
 * Built from grossComponentsForMonth rather than from the salary record, so
 * the increment timing is decided once. A column that disagreed with the Gross
 * beside it would be worse than no column.
 *
 * The part-month line is folded into basic rather than given a column of its
 * own. The payslip shows the agreed figures and names the shortfall
 * underneath, because that is what somebody checks against their letter of
 * appointment; the sheet is a ledger of what was paid, and a row that does not
 * add up is not a ledger. So a month somebody joined on the 15th shows a basic
 * of half the agreed one, and the Unpaid column — which is a different thing,
 * being leave rather than service — is untouched.
 */
export function grossBreakdownForMonth(
  s: SalaryComponents,
  dateCommenced: string | null,
  month: number,
  is13th: boolean,
  incrementMonthOverride?: number | null,
  days?: MonthDays | null,
  period?: { year: number; effectiveFrom: string | null } | null,
): GrossBreakdown {
  const parts = grossComponentsForMonth(s, dateCommenced, month, is13th, incrementMonthOverride, days, period);
  const of = (b: GrossBucket) => parts.filter(p => p.bucket === b).reduce((t, p) => t + p.amount, 0);
  const out: GrossBreakdown = {
    basic: round2(of("basic") + of("incomplete")),
    experience: round2(of("experience")),
    carried: round2(of("carried")),
    current: round2(of("current")),
    allowances: round2(of("allowance")),
    gross: 0,
  };
  out.gross = round2(out.basic + out.experience + out.carried + out.current + out.allowances);
  return out;
}

// KWSP contribution-schedule approximation: round wage up to the next RM20 band,
// apply the rate, then round the contribution up to the next ringgit.
function epfContribution(gross: number, rate: number, threshold: number): number {
  if (rate === 0) return 0;
  // RM20 steps in the lower table, RM100 in the upper one.
  const step = gross > threshold ? 100 : 20;
  const bandWage = Math.ceil(gross / step) * step;
  // Settle the product to the sixth decimal before rounding up.
  //
  // A rate like 0.07 has no exact binary form, so 3500 * 0.07 comes out as
  // 245.00000000000003 and Math.ceil dutifully returns 246. The church was
  // paying an extra ringgit for every wage where the contribution lands on a
  // whole number — nine people in October alone. Nothing here changes what
  // is owed; it stops a rounding rule from firing on a number that only looks
  // like it has a fraction.
  return Math.ceil(Math.round(bandWage * rate * 1e6) / 1e6);
}

export function calcLine(input: CalcInput): CalcLine {
  const { gross, voluntaryEpf, manualPcb, eplDeduction, is13thMonth } = input;
  const ptptn = Number(input.ptptnDeduction) || 0;
  const rates = input.rates ?? DEFAULT_RATES;

  // ── Unpaid days, counted before anything is worked out on them ────────
  // The count has to come first because of the whole-month case below. The
  // amount cannot: a day is priced off the corrected gross, which is not
  // known until the corrections are applied further down.
  const unpaidDaysInMonth = Number(input.unpaidLeave?.daysInMonth) || 0;
  const unpaidDays = is13thMonth || unpaidDaysInMonth <= 0
    ? 0
    : Math.min(Math.max(Number(input.unpaidLeave?.days) || 0, 0), unpaidDaysInMonth);

  /**
   * A whole month unpaid: no wages, and so no contributions on them.
   *
   * Part of a month is different and deliberately so — there the schemes are
   * worked out on the full agreed wage and only take-home falls, which is the
   * General Manager's instruction. But a month with no wages at all has
   * nothing for a percentage to apply to, and carrying the contributions
   * anyway produced a NEGATIVE net: the employee owing the church their own
   * SKBBK out of a salary they did not receive.
   *
   * EPF, SOCSO, EIS and SKBBK all stop together. PCB does not: it is keyed by
   * hand, so a figure sitting on a month like this is Finance's to clear, and
   * zeroing what somebody typed would be the system overruling them.
   */
  const wholeMonthUnpaid = unpaidDays > 0 && unpaidDays >= unpaidDaysInMonth;

  // EPF — applies to both normal and 13th-month
  const epfRates = resolveEpfRates(input, rates);
  // A voluntary sum is still a contribution, so it stops where they all do.
  const epfClosed = input.age >= (rates.epf_ceases_age ?? 75);
  const epfThreshold = rates.epf_wage_threshold ?? 5000;
  const epfEe = wholeMonthUnpaid ? 0
    : epfContribution(gross, epfRates.ee, epfThreshold) + (epfClosed ? 0 : voluntaryEpf || 0);
  // A flat sum is already the answer — it is not a rate, so it is neither
  // banded nor rounded up to the next ringgit. A whole month unpaid still
  // clears it: there is no wage for either side to contribute against.
  const epfEr = wholeMonthUnpaid ? 0
    : epfRates.erFlat != null ? round2(epfRates.erFlat)
    : epfContribution(gross, epfRates.er, epfThreshold);
  const epf: StatPortion = { ee: round2(epfEe), er: round2(epfEr), total: round2(epfEe + epfEr) };

  // SOCSO + EIS + SKBBK — skipped entirely for the 13th month
  let socso: StatPortion = { ee: 0, er: 0, total: 0 };
  let eis: StatPortion = { ee: 0, er: 0, total: 0 };
  let skbbk = 0;
  if (!is13thMonth && !wholeMonthUnpaid) {
    const over60 = input.age >= 60;
    // PERKESO's schedule where it covers this wage; the percentage otherwise.
    // The band's figures already account for the midpoint and the schedule's
    // own rounding, so nothing here rounds them again.
    const band = findBand(input.bands, gross);

    // EIS covers Malaysian citizens and permanent residents. A foreign
    // national is outside the scheme, so neither side contributes — the same
    // shape as the 60+ rule beside it, for a different reason. SOCSO is
    // untouched by it: foreign workers have been covered there since 2019.
    const inEis = !over60 && !input.isForeigner;

    // Category 2 — employment injury only, and no employee share. Two groups
    // reach it for unrelated reasons: anyone of 60, who is past the
    // invalidity scheme, and foreign workers, covered on that basis since
    // January 2019. PERKESO files both off the same column of the schedule,
    // which is why `socso_er_over60` serves for both in spite of its name.
    const injuryOnly = over60 || !!input.isForeigner;

    if (band) {
      socso = portion(injuryOnly ? 0 : band.socso_ee, injuryOnly ? band.socso_er_over60 : band.socso_er);
      if (inEis) eis = portion(band.eis, band.eis);
    } else {
      const socsoBase = Math.min(gross, rates.socso_ceiling);
      const socsoEe = injuryOnly ? 0 : socsoBase * rates.socso_ee;
      const socsoEr = injuryOnly ? socsoBase * rates.socso_er_over60 : socsoBase * rates.socso_er;
      socso = portion(socsoEe, socsoEr);

      if (inEis) {
        const eisBase = Math.min(gross, rates.eis_ceiling);
        const eisAmt = eisBase * rates.eis_rate;
        eis = portion(eisAmt, eisAmt);
      }
    }

    // SKBBK is its own scheme, not a top-up of the SOCSO employee share.
    //
    // This used to carry a `!over60` gate, on the reasoning that SKBBK
    // supplements the employee's SOCSO contribution and somebody with no such
    // contribution has nothing to supplement. That reasoning is wrong, and the
    // church's own payroll says so: in the October 2026 figures, nineteen
    // people pay no employee SOCSO — they are 60 or over, Category 2,
    // employment injury only — and every one of them pays SKBBK at exactly the
    // band figure for their wage. Nineteen people at nineteen different wages
    // is not a coincidence, and it was confirmed against the scheme's own
    // rule before this was changed.
    //
    // Left as it was, each of those nineteen would have been under-deducted by
    // about 0.75% of wages, LCM would have under-remitted PERKESO by the same,
    // and the filing would not have matched the payroll it came from.
    //
    // Two gates remain, and a third. Nothing on the 13th month, which is a
    // payment rather than a month worked. Nothing for anyone who has left the
    // scheme. And a scheme that started in June is not owed for May: recovering
    // the months between its start and the payroll catching up is what an
    // adjustment is for — a debt to a past month, not this month's
    // contribution, and only the two kept apart reconcile against PERKESO's
    // own statement.
    //
    // The opt-out is not absolute, and that is the third gate. A scheme that
    // enrols everybody on day one is compulsory until the month it stops
    // being, so leaving it bites from a later month rather than unwinding the
    // ones already deducted, remitted and filed. Ticking the box used to empty
    // June 2026 along with everything after it, and a sheet that no longer
    // matches the PERKESO return is worse than one that is merely out of date.
    const month = input.month ?? 13;
    const startedByNow = month >= (rates.skbbk_from_month ?? 1);
    const compulsoryNow = rates.skbbk_mandatory_to_month != null
      && month <= rates.skbbk_mandatory_to_month;
    if (startedByNow && (compulsoryNow || !input.skbbkOptedOut)) {
      // From the schedule where it reaches, since SKBBK is a column of the same
      // table and is filed off it. The rate is the fallback, not the source.
      skbbk = band ? band.skbbk : round2(Math.min(gross, rates.skbbk_ceiling) * rates.skbbk_ee);
    }
  }

  // ── Corrections ───────────────────────────────────────────────────────
  // Applied here, between the formulas and the totals. Late enough to override
  // what the rate table produced, early enough that total contributions, net
  // pay and LCM's cost all derive from the corrected figures instead of being
  // patched up afterwards.
  //
  // This is the only place an adjustment has to be understood. The yearly
  // sheet, a run's draft, the finalized line, the payslip and the PERKESO
  // summary all read these totals, so each of them reflects a correction
  // without knowing that corrections exist.
  const adjustments = (input.adjustments ?? []).filter(a => Number(a.amount) !== 0);
  const adj = sumAdjustments(adjustments);

  const grossAdj  = round2(gross + adj.GROSS);
  const pcbAdj    = round2((manualPcb || 0) + adj.PCB);
  const epfAdj    = portion(epf.ee + adj.EPF_EE, epf.er + adj.EPF_ER);
  const socsoAdj  = portion(socso.ee + adj.SOCSO_EE, socso.er + adj.SOCSO_ER);
  const eisAdj    = portion(eis.ee + adj.EIS_EE, eis.er + adj.EIS_ER);
  const skbbkAdj  = round2(skbbk + adj.SKBBK);

  const totalContrib = portion(
    epfAdj.ee + eisAdj.ee + socsoAdj.ee,
    epfAdj.er + eisAdj.er + socsoAdj.er,
  );

  const customRaw = input.customItems ?? [];
  const customAllowances = round2(customRaw.filter(i => i.type === "allowance").reduce((s, i) => s + i.amount, 0));
  const customDeductions = round2(customRaw.filter(i => i.type === "deduction").reduce((s, i) => s + i.amount, 0));

  // ── Unpaid leave ──────────────────────────────────────────────────────
  // Taken off here, after the contributions rather than before them, so the
  // statutory columns go on reading the full wage — except where the whole
  // month is unpaid, which has no wage for them to read and is handled at the
  // top. A bonus is not a month worked, so no day of it can be unpaid.
  //
  // The day is priced off the corrected gross: where a correction has moved
  // what this month pays, a day of it is worth more or less accordingly.
  // Clamped at the month's length — somebody absent for all of it is owed
  // nothing, not less than nothing.
  const unpaidDayRate = unpaidDaysInMonth > 0 ? round2(grossAdj / unpaidDaysInMonth) : 0;
  const unpaidAmount = unpaidDays > 0 ? round2(grossAdj / unpaidDaysInMonth * unpaidDays) : 0;

  // adj.NET is money that belongs to no scheme, so it lands straight on take-home
  // and on what the church pays out. Every other category has already moved net
  // by moving the figure it names.
  const net = round2(grossAdj - pcbAdj - totalContrib.ee - skbbkAdj - (eplDeduction || 0)
    - ptptn - customDeductions + customAllowances + adj.NET - unpaidAmount);
  // The church keeps the unpaid days too; its cost falls by the same amount.
  const totalLcmPayment = round2(grossAdj + totalContrib.er + customAllowances + adj.NET - unpaidAmount);

  return {
    gross: grossAdj,
    pcb: pcbAdj,
    epf: epfAdj, eis: eisAdj, socso: socsoAdj, skbbk: skbbkAdj, totalContrib,
    eplDeduction: round2(eplDeduction || 0),
    ptptnDeduction: round2(ptptn),
    unpaidLeave: { days: unpaidDays, amount: unpaidAmount, dayRate: unpaidDayRate },
    net,
    totalLcmPayment,
    customAllowances,
    customDeductions,
    customItems: customRaw.filter(i => i.amount > 0).map(i => ({ label: i.label ?? "", type: i.type, amount: i.amount })),
    adjustments,
    netAdjustment: adj.NET,
    hasAdjustments: adjustments.length > 0,
  };
}

// Age at a given year/month (1-based month), from a date-of-birth ISO string.
export function ageAt(dob: string | null, year: number, month: number): number {
  if (!dob) return 0;
  const d = new Date(dob);
  let age = year - d.getFullYear();
  // month is 1-based; birthday not yet reached this month → subtract one
  if (month < d.getMonth() + 1) age--;
  return age;
}

/**
 * The figure an adjustment names, read off a computed line.
 *
 * An adjustment says "this column, this much". Until now only the arithmetic
 * needed to know which column; now the form does too, because somebody typing
 * the figure they want has to be shown the one they have.
 *
 * Kept beside the arithmetic deliberately: if a category is ever added to the
 * list without a column to land in, this is where it fails to compile.
 */
export function figureOf(line: CalcLine, category: AdjustmentCategory): number {
  switch (category) {
    case "GROSS":    return line.gross;
    case "NET":      return line.net;
    case "PCB":      return line.pcb;
    case "EPF_EE":   return line.epf.ee;
    case "EPF_ER":   return line.epf.er;
    case "SOCSO_EE": return line.socso.ee;
    case "SOCSO_ER": return line.socso.er;
    case "SKBBK":    return line.skbbk;
    case "EIS_EE":   return line.eis.ee;
    case "EIS_ER":   return line.eis.er;
  }
}
