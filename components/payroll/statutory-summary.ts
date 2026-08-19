// Per-body contribution summaries attached to the statutory payment vouchers.
//
// A statutory PV is a single lump sum to EPF, PERKESO or LHDN, which tells an
// approver nothing about how it was arrived at. These summaries list every
// employee behind that figure, split into employee and employer portions, so
// the voucher can be checked against the payroll and later reconciled with the
// body's own statement.
//
// Excel rather than PDF: the same numbers get uploaded to the statutory portals,
// and a spreadsheet can be filtered and totalled.

import type { PayrollEmployee, PayrollLine } from "@/lib/types";

export type StatutoryBody = "EPF" | "PERKESO" | "PCB";

const BODY_TITLE: Record<StatutoryBody, string> = {
  EPF: "KWSP (EPF) Contribution Summary",
  PERKESO: "PERKESO (SOCSO + EIS + SKBBK) Contribution Summary",
  PCB: "LHDN (PCB) Deduction Summary",
};

/** Column set per body — SOCSO and EIS are broken apart under PERKESO. */
function columnsFor(body: StatutoryBody): { header: string; width: number }[] {
  const base = [
    { header: "No.", width: 6 },
    { header: "Employee", width: 32 },
    { header: "Emp No.", width: 12 },
    { header: "IC / Passport", width: 18 },
  ];
  switch (body) {
    case "EPF":
      return [...base,
        { header: "EPF No.", width: 16 },
        { header: "Gross (RM)", width: 14 },
        { header: "Employee (RM)", width: 15 },
        { header: "Employer (RM)", width: 15 },
        { header: "Total (RM)", width: 14 }];
    case "PERKESO":
      // PERKESO identifies contributors by IC, already in the base columns, so
      // a fifth identifier column would be dead space.
      return [...base,
        { header: "Gross (RM)", width: 14 },
        { header: "SOCSO EE (RM)", width: 15 },
        { header: "SOCSO ER (RM)", width: 15 },
        { header: "EIS EE (RM)", width: 14 },
        { header: "EIS ER (RM)", width: 14 },
        // Employee-only, so there is no ER twin. Its own column rather than
        // folded into SOCSO EE: PERKESO's own statement itemises it, and a
        // summary that cannot be lined up against theirs defeats the point.
        { header: "SKBBK (RM)", width: 14 },
        { header: "Total (RM)", width: 14 }];
    case "PCB":
      return [...base,
        { header: "Tax No. (TIN)", width: 18 },
        { header: "Gross (RM)", width: 14 },
        { header: "PCB (RM)", width: 14 }];
  }
}

function rowFor(body: StatutoryBody, idx: number, line: PayrollLine, emp?: PayrollEmployee): (string | number)[] {
  const n = (v: unknown) => Number(v ?? 0);
  const base = [idx + 1, line.employee_name, emp?.emp_no ?? "", emp?.ic_no ?? ""];
  switch (body) {
    case "EPF":
      return [...base, emp?.epf_no ?? "", n(line.gross), n(line.epf_ee), n(line.epf_er), n(line.epf_ee) + n(line.epf_er)];
    case "PERKESO":
      return [...base, n(line.gross), n(line.socso_ee), n(line.socso_er), n(line.eis_ee), n(line.eis_er),
        n(line.skbbk),
        n(line.socso_ee) + n(line.socso_er) + n(line.eis_ee) + n(line.eis_er) + n(line.skbbk)];
    case "PCB":
      return [...base, emp?.tin ?? "", n(line.gross), n(line.pcb)];
  }
}

/**
 * Which lines belong on this body's summary — a nil contribution is noise.
 *
 * Non-zero rather than positive, and the distinction is not academic. Before
 * corrections existed a statutory figure could not go below zero, so the two
 * tests were the same. A refund makes one negative, and a month whose
 * corrections cancel it out lands exactly on zero — under a positive test the
 * employee would drop off the summary entirely and the refund would never reach
 * the figure filed. A negative row is precisely what the body needs to see.
 */
function contributes(body: StatutoryBody, line: PayrollLine): boolean {
  const n = (v: unknown) => Number(v ?? 0);
  const any = (...vs: number[]) => vs.some(v => v !== 0);
  switch (body) {
    case "EPF":     return any(n(line.epf_ee), n(line.epf_er));
    case "PERKESO": return any(n(line.socso_ee), n(line.socso_er), n(line.eis_ee), n(line.eis_er), n(line.skbbk));
    case "PCB":     return n(line.pcb) !== 0;
  }
}

export async function generateStatutorySummary(opts: {
  body: StatutoryBody;
  periodLabel: string;              // e.g. "August 2026"
  lines: PayrollLine[];
  empById: Record<string, PayrollEmployee>;
}): Promise<Blob> {
  const { body, periodLabel, lines, empById } = opts;
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(body);

  const cols = columnsFor(body);
  ws.columns = cols.map(c => ({ width: c.width }));

  // Title block
  const titleRow = ws.addRow([BODY_TITLE[body]]);
  titleRow.font = { bold: true, size: 13 };
  ws.mergeCells(1, 1, 1, cols.length);
  const periodRow = ws.addRow([`Lutheran Church in Malaysia — ${periodLabel}`]);
  periodRow.font = { size: 10, color: { argb: "FF6B7280" } };
  ws.mergeCells(2, 1, 2, cols.length);
  ws.addRow([]);

  const header = ws.addRow(cols.map(c => c.header));
  header.eachCell(c => {
    c.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4A6DA7" } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  });

  // Money columns are whichever are labelled (RM) — PERKESO has no extra
  // identifier column, so the split falls one column earlier than the others.
  const isMoneyCol = (col: number) => cols[col - 1]?.header.includes("(RM)");

  const included = lines.filter(l => contributes(body, l));
  included.forEach((line, i) => {
    const r = ws.addRow(rowFor(body, i, line, empById[line.employee_id]));
    r.eachCell((c, col) => {
      c.font = { size: 10 };
      c.border = { top: { style: "hair" }, bottom: { style: "hair" }, left: { style: "thin" }, right: { style: "thin" } };
      // Identifiers stay text so leading zeros survive; money gets 2dp.
      if (isMoneyCol(col)) c.numFmt = "#,##0.00";
      else if (col >= 3) { c.numFmt = "@"; c.value = String(c.value ?? ""); }
    });
  });

  // Totals — what the voucher is actually paying.
  const totals: (string | number)[] = [];
  for (let col = 1; col <= cols.length; col++) {
    if (col === 2) { totals.push("TOTAL"); continue; }
    if (!isMoneyCol(col)) { totals.push(""); continue; }
    totals.push(included.reduce((s, line, i) => {
      const v = rowFor(body, i, line, empById[line.employee_id])[col - 1];
      return s + (typeof v === "number" ? v : 0);
    }, 0));
  }
  const totalRow = ws.addRow(totals);
  totalRow.eachCell((c, col) => {
    c.font = { bold: true, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF4FC" } };
    c.border = { top: { style: "double" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
    if (isMoneyCol(col)) c.numFmt = "#,##0.00";
  });

  ws.addRow([]);
  const note = ws.addRow([`${included.length} employee(s). Generated from the finalized payroll run.`]);
  note.font = { size: 9, color: { argb: "FF6B7280" } };

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
