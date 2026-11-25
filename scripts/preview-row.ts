// Render a small piece of the app that lives behind a sign-in, so it can be
// looked at.
//
// The custom allowance/deduction row, as it appears in the Edit Employee
// modal — resting, and being edited. It is here because the edit control on
// that row shipped as a button styled exactly like the text it sat in, so the
// feature existed and nobody could find it. It was asked for twice: the
// second time for something already built. No amount of reading the class
// names would have caught that; looking at it did, twice, because the first
// fix was a pencil barely darker than the row behind it.
//
//   npm run preview:row
//
// It writes an HTML file and prints the path. Open it. There is nothing to
// measure the way the printed statement has page counts and column
// positions — the question here is only "can somebody see the control", and
// that is answered by eyes.
//
// WHAT IT DOES CHECK is itself. The markup below is a copy of the
// component's, so the usual trap is that the component moves on and this
// quietly keeps showing the old thing while looking authoritative. Every
// class string it renders is therefore looked for in the component source,
// and anything that is no longer there is reported. A harness that cannot
// tell you it is out of date is worse than no harness.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const SOURCE = "components/payroll/employee-modal.tsx";
const source = readFileSync(SOURCE, "utf8");

/** Render a class string, and remember to check the component still uses it. */
const used: string[] = [];
const cls = (s: string) => { used.push(s); return s; };

const ICON = (d: string) =>
  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"`
  + ` stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const PENCIL = ICON(`<path d="M21.2 6.8a1 1 0 0 0-4-4L3.8 16.2a2 2 0 0 0-.5.8l-1.3 4.4a.5.5 0 0 0 .6.6l4.4-1.3a2 2 0 0 0 .8-.5z"/><path d="m15 5 4 4"/>`);
const TRASH  = ICON(`<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>`);

const ROW = cls("flex items-start gap-2 px-3 py-1.5 rounded-lg border border-stone-100 bg-stone-50");
// Two pieces in the component, because the tone depends on the direction —
// so two pieces here, or the check reports a drift that is only a template
// literal. Which is what it did on its first run, correctly.
const SIGN = cls("mt-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0")
  + " " + cls("bg-green-100 text-green-700");
const BADGE = cls("ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-[#2f5b9c]/10 text-[#2f5b9c] align-middle");
const BADGE_13 = cls("ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 align-middle");
const AMOUNT = cls("text-sm font-mono font-semibold text-stone-700 shrink-0 rounded px-1 hover:bg-white hover:text-[#2f5b9c] transition-colors");
const EDIT_ICON = cls("mt-0.5 shrink-0 rounded p-0.5 text-stone-400 transition-colors hover:bg-white hover:text-[#4a6da7]");
const BIN_ICON = cls("mt-0.5 shrink-0 rounded p-0.5 text-stone-400 transition-colors hover:bg-white hover:text-red-500");
const TEXT_INPUT = cls("min-w-[180px] flex-1 rounded-lg border-2 border-stone-800 px-2.5 py-1.5 text-sm outline-none focus:border-[#2f5b9c]");
const NUM_INPUT = cls("w-28 rounded-lg border-2 border-stone-800 px-2.5 py-1.5 text-right text-sm font-mono outline-none focus:border-[#2f5b9c]");
const SAVE = cls("rounded-lg bg-[#4a6da7] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#3d5c8f]");
const CANCEL = cls("text-[11px] text-stone-400 hover:text-stone-600");
const IN_GROSS_LABEL = cls("flex items-center gap-1.5 cursor-pointer text-[11px] text-stone-500 select-none");
// Nested under the one above, and only shown with it: nothing earns a
// thirteenth of the wage without being part of the wage.
const THIRTEENTH_LABEL = cls("ml-4 flex items-start gap-1.5 cursor-pointer text-[11px] text-stone-500 select-none");
const THIRTEENTH_HELP = cls("block text-[10px] text-stone-400");
const PERIOD_ROW = cls("flex flex-wrap items-center gap-2 text-[11px] text-stone-500");
const SELECT = cls("rounded-lg border-2 border-stone-800 bg-white px-2 py-1 text-[12px] outline-none focus:border-[#2f5b9c]");
const YEAR_INPUT = cls("w-20 rounded-lg border-2 border-stone-800 px-2 py-1 text-[12px] outline-none focus:border-[#2f5b9c]");
const EDIT_SHELL = cls("rounded-lg border border-[#bcd3f0] bg-[#f6faff] px-3 py-2.5");
const ONE_OFF = cls("text-[10px] text-stone-400 mt-0.5");
const RECUR = cls("text-[10px] text-sky-600 mt-0.5");

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const monthOptions = (sel: number) =>
  MONTHS.map((m, i) => `<option${i + 1 === sel ? " selected" : ""}>${m}</option>`).join("");

const resting = (label: string, amount: string, when: string, inGross: boolean,
                 recurring: boolean, inThirteenth = false) => `
<div class="${ROW}">
  <span class="${SIGN}">+</span>
  <div class="flex-1 min-w-0">
    <span class="text-sm text-stone-700">${label}</span>${inGross ? `<span class="${BADGE}">in gross</span>` : ""}${inThirteenth ? `<span class="${BADGE_13}">13th</span>` : ""}
    <div class="${recurring ? RECUR : ONE_OFF}">${recurring ? "&#8635; " : ""}${when}</div>
  </div>
  <button class="${AMOUNT}">RM ${amount}</button>
  <button class="${EDIT_ICON}" title="Edit this item">${PENCIL}</button>
  <button class="${BIN_ICON}" title="Remove this item">${TRASH}</button>
</div>`;

const editing = (label: string, amount: string, month: number, year: number,
                 untilMonth: number, untilYear: number, noEnd: boolean,
                 inThirteenth = false) => `
<div class="${EDIT_SHELL}">
  <div class="space-y-2">
    <div class="flex flex-wrap gap-2">
      <input value="${label}" class="${TEXT_INPUT}" placeholder="Description">
      <input type="number" value="${amount}" class="${NUM_INPUT}">
    </div>
    <label class="${IN_GROSS_LABEL}">
      <input type="checkbox" checked class="rounded"> Part of the gross &mdash; EPF, SOCSO, EIS and PCB are worked out on it
    </label>
    <label class="${THIRTEENTH_LABEL}">
      <input type="checkbox"${inThirteenth ? " checked" : ""} class="mt-0.5 rounded">
      <span>
        Earns a 13th month
        <span class="${THIRTEENTH_HELP}">
          Wages owed for an earlier period do. A secondment or cost-of-living
          allowance does not &mdash; it pays for the months it covers.
        </span>
      </span>
    </label>
    <div class="${PERIOD_ROW}">
      <span class="font-semibold text-stone-600">From</span>
      <select class="${SELECT}">${monthOptions(month)}</select>
      <input type="number" value="${year}" class="${YEAR_INPUT}">
      <label class="flex items-center gap-1.5 cursor-pointer select-none">
        <input type="checkbox" checked class="rounded"> Repeats every month
      </label>
    </div>
    <div class="${PERIOD_ROW} pl-4">
      <label class="flex items-center gap-1.5 cursor-pointer select-none">
        <input type="checkbox"${noEnd ? " checked" : ""} class="rounded"> No end date
      </label>
      ${noEnd ? "" : `<span class="font-semibold text-stone-600">until</span>
      <select class="${SELECT}">${monthOptions(untilMonth)}</select>
      <input type="number" value="${untilYear}" class="${YEAR_INPUT}">`}
    </div>
    <div class="flex items-center gap-2 pt-0.5">
      <button class="${SAVE}">Save</button>
      <button class="${CANCEL}">Cancel</button>
    </div>
  </div>
</div>`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Custom item row</title><script src="https://cdn.tailwindcss.com/3.4.17"></script></head>
<body class="bg-white p-6">
<div class="max-w-2xl space-y-5">
  <div>
    <p class="mb-2 text-xs text-stone-500">Resting. The pencil has to be findable by somebody who does not know the figure is also a button.</p>
    <div class="space-y-1.5 rounded-xl border border-teal-200 bg-teal-50/30 p-3">
      ${resting("Salary Difference from 2024 and 2025", "870.00", "Jan 2026 &ndash; Dec 2026", true, true, true)}
      ${resting("COLA", "450.00", "Jan 2026 &ndash; Dec 2026", true, true)}
      ${resting("Transport", "120.00", "Mar 2026 &middot; one-off", false, false)}
    </div>
  </div>
  <div>
    <p class="mb-2 text-xs text-stone-500">Being edited: description, amount, whether it counts towards the gross, whether it earns a 13th month, and the period it runs for.</p>
    <div class="space-y-1.5 rounded-xl border border-teal-200 bg-teal-50/30 p-3">
      ${editing("COLA", "450", 1, 2026, 12, 2026, false)}
      ${editing("Salary Difference from 2024 and 2025", "870", 1, 2026, 12, 2026, false, true)}
    </div>
  </div>
</div>
</body></html>`;

const dir = process.env.OUT_DIR
  ?? join(process.env.USERPROFILE ?? process.env.HOME ?? ".", "Downloads");
mkdirSync(dir, { recursive: true });
const out = join(dir, "custom-item-row.html");
writeFileSync(out, html);
console.log(`\n${out}\n`);

// ── Is this still the component's markup? ────────────────────────────────
const stale = used.filter(c => !source.includes(c));
if (stale.length === 0) {
  console.log(`Every class here is still in ${SOURCE} — what you are looking at is what ships.\n`);
} else {
  console.log(`${stale.length} class string(s) are NO LONGER in ${SOURCE}.`);
  console.log("This preview is out of date; fix it before trusting what it shows:\n");
  for (const c of stale) console.log(`  ${c}`);
  console.log();
  process.exitCode = 1;
}
