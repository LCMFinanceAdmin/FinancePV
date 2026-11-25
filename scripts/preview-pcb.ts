// Render the yearly sheet's PCB cell so somebody can look at it.
//
//   npm run preview:pcb
//
// It renders THE COMPONENT, not a copy of its markup — react-dom's static
// renderer on the same PcbCell the sheet imports. The custom-item preview
// beside this one has to check its own class strings against the component,
// because it reproduces them; this cannot go out of date at all.
//
// Why it exists: the cell used to be a plain number input, visibly a box you
// could type in. It is now a span that shows where its figure came from — what
// a run withheld, what Finance keyed, the standing monthly figure, or nothing
// — and a control that stops looking like a control is a control nobody uses.
// That has happened twice in this app already. The resting states are what
// this answers; the editing state is internal to the component and a static
// render cannot reach it, which is fine, because the question is what somebody
// sees BEFORE they click.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PcbCell } from "@/components/payroll/pcb-cell";
import { pcbForMonth } from "@/lib/payroll/pcb";

const noop = () => {};

/** One cell, in the table cell the sheet wraps it in. */
const cell = (month: number, paid: number | null, keyed: number | null,
              standing: number, canEdit: boolean) => {
  const value = pcbForMonth(month, paid, keyed, standing);
  const html = renderToStaticMarkup(createElement(PcbCell, {
    employeeId: "preview", employeeName: "PREVIEW", year: 2026, month,
    value, canEdit, onSaved: noop, onError: noop,
  }));
  return `
<tr>
  <td class="border border-stone-200 px-2 py-1 text-[11px] text-stone-500">${value.source}</td>
  <td class="border border-stone-200 px-0.5 py-0.5 text-right">${html}</td>
  <td class="border border-stone-200 px-2 py-1 text-[11px] text-stone-600">${value.reason}</td>
</tr>`;
};

const rows = [
  cell(6, 850, 912, 384, true),    // run: settled, not editable
  cell(6, null, 912, 384, true),   // keyed for a month not yet run
  cell(6, null, 0, 384, true),     // keyed as none — a decision, and kept
  cell(6, null, null, 384, true),  // the standing monthly figure
  cell(13, null, null, 384, true), // the bonus is never seeded from it
  cell(13, null, 912, 384, true),  // until somebody keys one
  cell(6, null, 912, 384, false),  // and what a reader without rights sees
].join("");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PCB cell</title><script src="https://cdn.tailwindcss.com/3.4.17"></script></head>
<body class="bg-white p-6">
<div class="max-w-3xl">
  <p class="mb-3 text-xs text-stone-500">
    The PCB cell in each of its resting states. The editable ones have to look
    editable at a glance, on a sheet that is nothing but numbers.
  </p>
  <table class="w-full border-collapse text-sm">
    <thead>
      <tr class="bg-stone-100 text-left text-[11px] uppercase tracking-wide text-stone-500">
        <th class="border border-stone-200 px-2 py-1">Source</th>
        <th class="border border-stone-200 px-2 py-1 text-right">Cell</th>
        <th class="border border-stone-200 px-2 py-1">What its tooltip says</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>
</body></html>`;

const dir = process.env.OUT_DIR
  ?? join(process.env.USERPROFILE ?? process.env.HOME ?? ".", "Downloads");
mkdirSync(dir, { recursive: true });
const out = join(dir, "pcb-cell.html");
writeFileSync(out, html);
console.log(`\n${out}\n`);
console.log("Rendered from components/payroll/pcb-cell.tsx itself, so it cannot be out of date.\n");
