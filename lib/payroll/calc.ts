// Payroll calculation engine — Phase 2.
//
// Hybrid statutory model: EPF / SOCSO / EIS are auto-calculated here; PCB is keyed
// manually. Rates are current LCM policy hardcoded for now; Phase 3 moves them into
// admin-editable rate tables. Verified against the TAN EE YAN (2025) reference sheet.
//
// NOTE on exactness: EPF matches KWSP's contribution schedule via the RM20 wage-band
// + round-up method. SOCSO/EIS here use the straight-percentage method with a wage
// ceiling, which matches the reference sheet's employee figures exactly and the
// employer figures to within a few sen. The cent-perfect PERKESO contribution
// schedule will be wired through the Phase 3 rate tables.

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
  skbbk_ee: 0, skbbk_ceiling: 6000,
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
  is13thMonth: boolean;        // 13th month: EPF + PCB only, no SOCSO/EIS
  skbbkOptedOut?: boolean;     // opted out of SKBBK (Lindung 24) — then nothing is deducted
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
  net: number;                 // gross − pcb − employee contributions − SKBBK − EPL ± custom items
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
export function resolveEpfRates(input: { age: number; employmentType: EmploymentType; isOrangAsli: boolean }, rates: RateConfig = DEFAULT_RATES): { ee: number; er: number } {
  if (input.isOrangAsli) return { ee: rates.epf_ee_orang_asli, er: rates.epf_er_orang_asli };
  const under60 = input.age < 60;
  if (input.employmentType === "PERMANENT" && under60) return { ee: rates.epf_ee_under60, er: rates.epf_er_under60 };
  return { ee: rates.epf_ee_over60, er: rates.epf_er_over60 }; // 60+ or contract
}

// Annual increment effective month: joined before July → effective Jan; after July → effective July.
// A per-employee override (1 or 7) takes precedence for T&C-carved exceptions.
export function incrementEffectiveMonth(dateCommenced: string | null, override?: number | null): number {
  if (override === 1 || override === 7) return override;
  if (!dateCommenced) return 1;
  const joinMonth = new Date(dateCommenced).getMonth() + 1; // 1-based
  return joinMonth < 7 ? 1 : 7;
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
export function grossForMonth(s: SalaryComponents, dateCommenced: string | null, month: number, is13th: boolean, incrementMonthOverride?: number | null): number {
  const full = fullGross(s);
  if (is13th) return full;
  const eff = incrementEffectiveMonth(dateCommenced, incrementMonthOverride);
  return month >= eff ? full : full - Number(s.increment_current);
}

// KWSP contribution-schedule approximation: round wage up to the next RM20 band,
// apply the rate, then round the contribution up to the next ringgit.
function epfContribution(gross: number, rate: number): number {
  if (rate === 0) return 0;
  const bandWage = Math.ceil(gross / 20) * 20;
  return Math.ceil(bandWage * rate);
}

export function calcLine(input: CalcInput): CalcLine {
  const { gross, voluntaryEpf, manualPcb, eplDeduction, is13thMonth } = input;
  const rates = input.rates ?? DEFAULT_RATES;

  // EPF — applies to both normal and 13th-month
  const epfRates = resolveEpfRates(input, rates);
  const epfEe = epfContribution(gross, epfRates.ee) + (voluntaryEpf || 0);
  const epfEr = epfContribution(gross, epfRates.er);
  const epf: StatPortion = { ee: round2(epfEe), er: round2(epfEr), total: round2(epfEe + epfEr) };

  // SOCSO + EIS + SKBBK — skipped entirely for the 13th month
  let socso: StatPortion = { ee: 0, er: 0, total: 0 };
  let eis: StatPortion = { ee: 0, er: 0, total: 0 };
  let skbbk = 0;
  if (!is13thMonth) {
    const socsoBase = Math.min(gross, rates.socso_ceiling);
    const over60 = input.age >= 60;
    // 60+: employment-injury only (no employee share); else standard rates
    const socsoEe = over60 ? 0 : socsoBase * rates.socso_ee;
    const socsoEr = over60 ? socsoBase * rates.socso_er_over60 : socsoBase * rates.socso_er;
    socso = { ee: round2(socsoEe), er: round2(socsoEr), total: round2(socsoEe + socsoEr) };

    if (!over60) {
      const eisBase = Math.min(gross, rates.eis_ceiling);
      const eisAmt = eisBase * rates.eis_rate;
      eis = { ee: round2(eisAmt), er: round2(eisAmt), total: round2(eisAmt * 2) };
    }

    // SKBBK tops up the employee's SOCSO contribution, so it follows the same
    // two gates: nothing on the 13th month, and nothing at 60+, where the
    // employee has no SOCSO share to supplement. Anyone who has left the
    // scheme pays nothing regardless.
    if (!over60 && !input.skbbkOptedOut) {
      skbbk = round2(Math.min(gross, rates.skbbk_ceiling) * rates.skbbk_ee);
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

  // adj.NET is money that belongs to no scheme, so it lands straight on take-home
  // and on what the church pays out. Every other category has already moved net
  // by moving the figure it names.
  const net = round2(grossAdj - pcbAdj - totalContrib.ee - skbbkAdj - (eplDeduction || 0)
    - customDeductions + customAllowances + adj.NET);
  const totalLcmPayment = round2(grossAdj + totalContrib.er + customAllowances + adj.NET);

  return {
    gross: grossAdj,
    pcb: pcbAdj,
    epf: epfAdj, eis: eisAdj, socso: socsoAdj, skbbk: skbbkAdj, totalContrib,
    eplDeduction: round2(eplDeduction || 0),
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
