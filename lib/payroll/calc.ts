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

import type { EmploymentType } from "@/lib/types";

export const SOCSO_CEILING = 6000; // RM — wage ceiling for SOCSO contributions
export const EIS_CEILING = 6000;   // RM — wage ceiling for EIS contributions

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
}

export interface CalcLine {
  gross: number;
  pcb: number;
  epf: StatPortion;
  eis: StatPortion;
  socso: StatPortion;
  totalContrib: StatPortion;   // EPF + EIS + SOCSO, per side
  eplDeduction: number;
  net: number;                 // gross − pcb − employee contributions − EPL
  totalLcmPayment: number;     // gross + employer contributions
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// EPF rate tiers (employee %, employer %)
export function resolveEpfRates(input: { age: number; employmentType: EmploymentType; isOrangAsli: boolean }): { ee: number; er: number } {
  if (input.isOrangAsli) return { ee: 0.11, er: 0.13 };          // no +3% LCM top-up
  const under60 = input.age < 60;
  if (input.employmentType === "PERMANENT" && under60) return { ee: 0.11, er: 0.16 }; // 13% + 3%
  return { ee: 0, er: 0.07 };                                     // 60+ or contract: 4% + 3%
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

  // EPF — applies to both normal and 13th-month
  const epfRates = resolveEpfRates(input);
  const epfEe = epfContribution(gross, epfRates.ee) + (voluntaryEpf || 0);
  const epfEr = epfContribution(gross, epfRates.er);
  const epf: StatPortion = { ee: round2(epfEe), er: round2(epfEr), total: round2(epfEe + epfEr) };

  // SOCSO + EIS — skipped entirely for the 13th month
  let socso: StatPortion = { ee: 0, er: 0, total: 0 };
  let eis: StatPortion = { ee: 0, er: 0, total: 0 };
  if (!is13thMonth) {
    const socsoBase = Math.min(gross, SOCSO_CEILING);
    const over60 = input.age >= 60;
    // 60+: employment-injury only (employer 1.25%, no employee share); else 0.5% / 1.75%
    const socsoEe = over60 ? 0 : socsoBase * 0.005;
    const socsoEr = over60 ? socsoBase * 0.0125 : socsoBase * 0.0175;
    socso = { ee: round2(socsoEe), er: round2(socsoEr), total: round2(socsoEe + socsoEr) };

    if (!over60) {
      const eisBase = Math.min(gross, EIS_CEILING);
      const eisAmt = eisBase * 0.002;
      eis = { ee: round2(eisAmt), er: round2(eisAmt), total: round2(eisAmt * 2) };
    }
  }

  const totalContrib: StatPortion = {
    ee: round2(epf.ee + eis.ee + socso.ee),
    er: round2(epf.er + eis.er + socso.er),
    total: round2(epf.total + eis.total + socso.total),
  };

  const net = round2(gross - (manualPcb || 0) - totalContrib.ee - (eplDeduction || 0));
  const totalLcmPayment = round2(gross + totalContrib.er);

  return {
    gross: round2(gross),
    pcb: round2(manualPcb || 0),
    epf, eis, socso, totalContrib,
    eplDeduction: round2(eplDeduction || 0),
    net,
    totalLcmPayment,
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
