// A register as a spreadsheet.
//
// Follows the shape statutory-summary.ts already established — title block,
// banded header, bordered rows, totals, a closing note — but driven by the
// column definitions rather than a switch per report, so a new register is a
// list of columns and not another copy of this file.
//
// Excel and not just PDF because a register handed to an auditor gets sorted,
// filtered and totalled by whoever receives it. A PDF is the record; the
// spreadsheet is the working copy.

import {
  type Register, type RegisterMeta, totalsRow, fmtDate, fmtDateTime,
} from "@/lib/registers";

const INK = "FF4A6DA7";
const BAND = "FFEEF4FC";
const GREY = "FF6B7280";

export async function buildRegisterWorkbook(reg: Register, meta: RegisterMeta): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.organisation;
  wb.created = new Date(meta.generatedAt);

  // Sheet names cannot carry : \ / ? * [ ] and cap at 31 characters.
  const ws = wb.addWorksheet(reg.title.replace(/[:\\/?*[\]]/g, "").slice(0, 31));
  const n = reg.columns.length;
  ws.columns = reg.columns.map(c => ({ width: c.width }));

  const banner = (text: string, opts: { bold?: boolean; size?: number; colour?: string }) => {
    const row = ws.addRow([text]);
    row.font = { bold: opts.bold ?? false, size: opts.size ?? 10, color: { argb: opts.colour ?? "FF16335E" } };
    ws.mergeCells(row.number, 1, row.number, n);
    return row;
  };

  banner(meta.organisation, { bold: true, size: 12 });
  banner(reg.title, { bold: true, size: 14 });
  banner(reg.purpose, { size: 10, colour: GREY });
  banner(`As at ${fmtDate(meta.asAt)}`, { bold: true, size: 10 });
  ws.addRow([]);

  const header = ws.addRow(reg.columns.map(c => c.header));
  header.eachCell(c => {
    c.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  });
  // Everything above the header scrolls away; the header itself stays put.
  ws.views = [{ state: "frozen", ySplit: header.number }];

  for (const r of reg.rows) {
    const row = ws.addRow(r.map(v => v ?? ""));
    row.eachCell((cell, col) => {
      const def = reg.columns[col - 1];
      cell.font = { size: 10 };
      cell.border = {
        top: { style: "hair" }, bottom: { style: "hair" },
        left: { style: "thin" }, right: { style: "thin" },
      };
      cell.alignment = { vertical: "top", horizontal: def?.align ?? "left", wrapText: true };
      if (def?.money) cell.numFmt = "#,##0.00";
    });
  }

  if (reg.totals && reg.rows.length > 0) {
    const row = ws.addRow(totalsRow(reg).map(v => v ?? ""));
    row.eachCell((cell, col) => {
      cell.font = { bold: true, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND } };
      cell.border = {
        top: { style: "double" }, bottom: { style: "thin" },
        left: { style: "thin" }, right: { style: "thin" },
      };
      if (reg.columns[col - 1]?.money) cell.numFmt = "#,##0.00";
    });
  }

  ws.addRow([]);
  const count = ws.addRow([`${reg.rows.length} record${reg.rows.length === 1 ? "" : "s"}.`]);
  count.font = { size: 9, bold: true, color: { argb: GREY } };
  if (reg.note) {
    const note = ws.addRow([reg.note]);
    note.font = { size: 9, color: { argb: GREY } };
    ws.mergeCells(note.number, 1, note.number, n);
  }
  // Who produced it and when, on the sheet itself. A register separated from
  // the email it arrived in still has to say where it came from.
  const prov = ws.addRow([
    `Generated from the ${meta.organisation} finance system by ${meta.generatedBy} on ${fmtDateTime(meta.generatedAt)}.`,
  ]);
  prov.font = { size: 9, italic: true, color: { argb: GREY } };
  ws.mergeCells(prov.number, 1, prov.number, n);

  ws.pageSetup = {
    orientation: n > 6 ? "landscape" : "portrait",
    fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
  };

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
