// Printable Budget vs Actual report for one ministry and year.
//
// Rendered as HTML rather than a PDF library, matching how worksheets are
// printed here: the browser's own print dialog produces a clean PDF and the
// layout stays inspectable.
//
// Budgets are held as an annual figure per line, so a period's budget is that
// figure divided across the periods in the year. Actuals are real payment
// vouchers bucketed by their transaction date, so the variance is meaningful
// even though the budget itself isn't phased.

export type BudgetPeriod = "MONTHLY" | "QUARTERLY" | "BIANNUAL" | "YEARLY";

export interface ReportLine {
  project_name: string;
  description?: string | null;
  type: "income" | "expense";
  annualBudget: number;
  /** Actual per period, aligned to PERIOD_LABELS[period]. */
  actuals: number[];
  isChild?: boolean;
}

const ACCENT = "#4a6da7";

export const PERIOD_LABELS: Record<BudgetPeriod, string[]> = {
  MONTHLY: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  QUARTERLY: ["Q1", "Q2", "Q3", "Q4"],
  BIANNUAL: ["H1", "H2"],
  YEARLY: ["Full year"],
};

const PERIOD_TITLE: Record<BudgetPeriod, string> = {
  MONTHLY: "Monthly", QUARTERLY: "Quarterly", BIANNUAL: "Half-yearly", YEARLY: "Annual",
};

/** Which bucket a month (0-11) falls into for the chosen period. */
export function bucketForMonth(month: number, period: BudgetPeriod): number {
  switch (period) {
    case "MONTHLY":   return month;
    case "QUARTERLY": return Math.floor(month / 3);
    case "BIANNUAL":  return Math.floor(month / 6);
    case "YEARLY":    return 0;
  }
}

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function money(n: number): string {
  const v = Math.round((n + Number.EPSILON) * 100) / 100;
  return v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Variance is favourable when spending is under budget, or income is over. */
function varianceClass(variance: number, type: "income" | "expense"): string {
  const favourable = type === "expense" ? variance >= 0 : variance <= 0;
  if (Math.abs(variance) < 0.005) return "";
  return favourable ? "good" : "bad";
}

export function budgetReportHtml(opts: {
  ministry: string;
  year: number;
  period: BudgetPeriod;
  lines: ReportLine[];
  logoDataUri?: string;
  preparedBy?: string;
}): string {
  const { ministry, year, period, lines, logoDataUri = "", preparedBy = "" } = opts;
  const labels = PERIOD_LABELS[period];
  const n = labels.length;

  // With an evenly-spread budget the per-period Budget column repeats the same
  // figure in every period and Var is just Budget − Actual. Across 12 months
  // that is 36 columns of mostly noise, so once there are more than four
  // periods the table shows actuals only, with the per-period budget stated
  // once and the variance carried in the year-to-date block.
  const compact = n > 4;

  const rows = lines.map(line => {
    const periodBudget = line.annualBudget / n;
    const totalActual = line.actuals.reduce((s, a) => s + a, 0);
    const totalVariance = line.annualBudget - totalActual;

    const cells = compact
      ? labels.map((_, i) => {
          const actual = line.actuals[i] ?? 0;
          // Over the period's share of budget — worth seeing at a glance.
          const over = line.type === "expense" && actual > periodBudget + 0.005;
          return `<td class="num ${over ? "bad" : actual === 0 ? "muted" : ""}">${money(actual)}</td>`;
        }).join("")
      : labels.map((_, i) => {
          const actual = line.actuals[i] ?? 0;
          const variance = periodBudget - actual;
          return `
            <td class="num">${money(periodBudget)}</td>
            <td class="num">${money(actual)}</td>
            <td class="num ${varianceClass(variance, line.type)}">${money(variance)}</td>`;
        }).join("");

    return `
      <tr class="${line.isChild ? "child" : ""}">
        <td class="name">
          <div class="proj">${line.isChild ? "↳ " : ""}${esc(line.project_name)}</div>
          ${line.description ? `<div class="desc">${esc(line.description)}</div>` : ""}
        </td>
        <td class="type">${line.type === "income" ? "Income" : "Expense"}</td>
        ${compact ? `<td class="num per">${money(periodBudget)}</td>` : ""}
        ${cells}
        <td class="num strong">${money(line.annualBudget)}</td>
        <td class="num strong">${money(totalActual)}</td>
        <td class="num strong ${varianceClass(totalVariance, line.type)}">${money(totalVariance)}</td>
      </tr>`;
  }).join("");

  // Totals split by type — netting income against expenditure would be
  // misleading on a stewardship report.
  const sum = (t: "income" | "expense", pick: (l: ReportLine) => number) =>
    lines.filter(l => l.type === t).reduce((s, l) => s + pick(l), 0);

  const totalRow = (t: "income" | "expense", label: string) => {
    const budget = sum(t, l => l.annualBudget);
    const cells = compact
      ? labels.map((_, i) => `<td class="num">${money(sum(t, l => l.actuals[i] ?? 0))}</td>`).join("")
      : labels.map((_, i) => {
          const b = budget / n;
          const a = sum(t, l => l.actuals[i] ?? 0);
          return `<td class="num">${money(b)}</td><td class="num">${money(a)}</td><td class="num ${varianceClass(b - a, t)}">${money(b - a)}</td>`;
        }).join("");
    const actual = sum(t, l => l.actuals.reduce((s, a) => s + a, 0));
    return `
      <tr class="total">
        <td class="name">${label}</td><td></td>
        ${compact ? `<td class="num">${money(budget / n)}</td>` : ""}
        ${cells}
        <td class="num">${money(budget)}</td>
        <td class="num">${money(actual)}</td>
        <td class="num ${varianceClass(budget - actual, t)}">${money(budget - actual)}</td>
      </tr>`;
  };

  const hasIncome = lines.some(l => l.type === "income");
  const colSpan = 2 + (compact ? 1 + n : n * 3) + 3;

  const periodNoun = period === "MONTHLY" ? "month"
    : period === "QUARTERLY" ? "quarter"
    : period === "BIANNUAL" ? "half" : "year";

  const thead = compact
    ? `<tr>
         <th rowspan="2" class="group">Project</th>
         <th rowspan="2" class="group">Type</th>
         <th rowspan="2" class="group">Budget<br/>per ${periodNoun}</th>
         <th colspan="${n}" class="group">Actual by ${periodNoun}</th>
         <th colspan="3" class="group">Year to date</th>
       </tr>
       <tr>
         ${labels.map(l => `<th>${esc(l)}</th>`).join("")}
         <th>Budget</th><th>Actual</th><th>Var</th>
       </tr>`
    : `<tr>
         <th rowspan="2" class="group">Project</th>
         <th rowspan="2" class="group">Type</th>
         ${labels.map(l => `<th colspan="3" class="group">${esc(l)}</th>`).join("")}
         <th colspan="3" class="group">Year to date</th>
       </tr>
       <tr>
         ${labels.map(() => `<th>Budget</th><th>Actual</th><th>Var</th>`).join("")}
         <th>Budget</th><th>Actual</th><th>Var</th>
       </tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(ministry)} Budget vs Actual ${year}</title>
<style>
  :root { --accent: ${ACCENT}; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; background: #f1f5f9; }
  .toolbar { position: sticky; top: 0; z-index: 5; display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px; background: #fff; border-bottom: 1px solid #e2e8f0; }
  .toolbar button { font: 600 13px Arial, sans-serif; border: none; border-radius: 8px; padding: 9px 18px; cursor: pointer; }
  .btn-print { background: var(--accent); color: #fff; }
  .btn-close { background: #e2e8f0; color: #334155; }
  .sheet { margin: 20px auto; background: #fff; padding: 28px 32px; box-shadow: 0 2px 12px rgba(0,0,0,.08); width: fit-content; min-width: 900px; }
  .head { display: flex; align-items: center; justify-content: space-between; padding-bottom: 12px; margin-bottom: 16px; border-bottom: 2px solid var(--accent); }
  .head-left { display: flex; align-items: center; gap: 12px; }
  .head-left img { width: 46px; height: 46px; }
  .org { font-size: 16px; font-weight: 700; color: var(--accent); }
  .subtitle { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .meta { text-align: right; font-size: 11px; color: #6b7280; }
  .meta .big { font-size: 15px; font-weight: 700; color: #111; }
  table { border-collapse: collapse; font-size: 13px; }
  /* Vertical padding raised from 4px so each row is ~10px taller and the
     figures are easier to follow across a wide table. */
  th, td { border: 1px solid #cbd5e1; padding: 9px 10px; }
  thead th { background: var(--accent); color: #fff; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  thead th.group { background: #3d5c8f; border-bottom: 1px solid #7b98c9; }
  .name { min-width: 200px; }
  .proj { font-weight: 600; }
  .desc { color: #6b7280; font-size: 11px; margin-top: 2px; }
  .type { white-space: nowrap; color: #6b7280; font-size: 12px; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .strong { font-weight: 700; background: #f8fafc; }
  .per { background: #f4f8fe; color: #3d5c8f; font-weight: 600; }
  .muted { color: #b6c2d1; }
  .good { color: #15803d; }
  .bad { color: #b91c1c; font-weight: 700; }
  tr.child .proj { padding-left: 12px; font-weight: 500; }
  tr.total td { background: #eef4fc; font-weight: 700; }
  tbody tr:nth-child(even):not(.total) td { background: #fbfdff; }
  .note { margin-top: 14px; font-size: 11px; color: #6b7280; max-width: 900px; line-height: 1.6; }
  .sign { margin-top: 32px; display: flex; gap: 40px; }
  .sign div { flex: 1; border-top: 1px solid #1f2937; padding-top: 6px; font-size: 12px; color: #374151; }
  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .sheet { margin: 0; box-shadow: none; padding: 0; min-width: 0; width: auto; }
    @page { size: A4 landscape; margin: 10mm; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button class="btn-print" onclick="window.print()">🖨 Print / Save as PDF</button>
    <button class="btn-close" onclick="window.close()">Close</button>
  </div>
  <div class="sheet">
    <div class="head">
      <div class="head-left">
        ${logoDataUri ? `<img src="${esc(logoDataUri)}" alt="" />` : ""}
        <div>
          <div class="org">Lutheran Church in Malaysia</div>
          <div class="subtitle">${esc(ministry)} — Budget vs Actual</div>
        </div>
      </div>
      <div class="meta">
        <div class="big">${year}</div>
        <div>${PERIOD_TITLE[period]} breakdown</div>
        ${preparedBy ? `<div>Prepared by ${esc(preparedBy)}</div>` : ""}
      </div>
    </div>

    <table>
      <thead>${thead}</thead>
      <tbody>
        ${rows || `<tr><td colspan="${colSpan}" style="text-align:center;color:#6b7280;padding:14px">No budget lines for ${year}</td></tr>`}
        ${lines.length ? totalRow("expense", "Total Expenditure") : ""}
        ${hasIncome ? totalRow("income", "Total Income") : ""}
      </tbody>
    </table>

    <div class="note">
      Budgets are approved as an annual figure per line, so the budget for one ${periodNoun} is that
      figure divided evenly across the ${n === 1 ? "year" : `${n} ${periodNoun}s`}${compact ? ` — shown once in the “Budget per ${periodNoun}” column, since it is the same every ${periodNoun}` : ""}.
      Actuals are payment vouchers that are approved or paid, placed in the ${periodNoun} of their
      voucher date${compact ? `; a figure in red is a ${periodNoun} that ran over its share of the budget` : ""}.
      A positive variance means expenditure is under budget, or income is behind target.
    </div>

    <div class="sign">
      <div>Prepared by — Ministry EXCO</div>
      <div>Reviewed by — Treasurer</div>
      <div>Approved at EXCO Meeting — Date</div>
    </div>
  </div>
</body>
</html>`;
}
