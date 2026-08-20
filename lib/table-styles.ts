// The look of an editable admin table.
//
// Church Directory and Offices & Elections are the same kind of screen — a list
// of records you scan and edit in place — and they were drifting into two
// different tables. Shared here so a change to the header weight or the row
// padding lands on both, rather than on whichever one was open at the time.
//
// Gridlines run both ways deliberately. The columns on these screens are
// unrelated to one another (a name, a date, a role), so there is nothing to
// carry the eye across a row without a line.

export const th =
  "px-2.5 py-2 text-left text-[10.5px] font-bold uppercase tracking-wider text-stone-500 whitespace-nowrap";

export const td = "px-2.5 py-1.5 align-middle";

export const rowCls =
  "divide-x divide-stone-100 border-t border-stone-100 hover:bg-[#f8fbff]";

/**
 * Cell inputs that read as text until you go near them.
 *
 * A bordered box in every cell turns a table back into a form. The `!` on the
 * size is not decoration: globals.css sets `font: inherit` on inputs and selects
 * outside any layer, and unlayered CSS beats a layered utility, so a plain
 * text-[13px] here is silently dropped.
 */
export const cell =
  "w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 !text-[13px] text-stone-700 hover:border-stone-200 focus:bg-white";

/** Quiet row actions. stone-400 rather than stone-300 — see the contrast fix. */
export const iconBtn =
  "rounded p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-[#2f5b9c] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-stone-400";

export const saveBtn =
  "inline-flex items-center gap-1 rounded-md bg-[#2f5b9c] px-2 py-1 !text-[11px] !font-bold text-white transition-colors hover:bg-[#24487d] disabled:opacity-40";

/**
 * A small bordered action, for the button grid in a row's last column.
 *
 * Sized to a grid cell rather than to its own text so a row of them lines up:
 * buttons that each take their own width leave ragged gaps and, at the end of a
 * row, push past the column they belong to.
 */
export const rowBtn =
  "inline-flex w-full items-center justify-center gap-1 rounded-lg border border-stone-200 bg-white px-1.5 py-1 !text-[10.5px] !font-semibold whitespace-nowrap text-stone-600 transition-colors hover:border-[#2f5b9c] hover:text-[#2f5b9c] disabled:opacity-40";

export const rowBtnDanger =
  "inline-flex w-full items-center justify-center gap-1 rounded-lg border border-red-200 bg-white px-1.5 py-1 !text-[10.5px] !font-semibold whitespace-nowrap text-red-600 transition-colors hover:border-red-400 hover:bg-red-50";

export const rowBtnPrimary =
  "inline-flex w-full items-center justify-center gap-1 rounded-lg bg-[#2f5b9c] px-1.5 py-1 !text-[10.5px] !font-bold whitespace-nowrap text-white transition-colors hover:bg-[#24487d]";

/** The term dates, which are one of the three things worth spotting at a glance. */
export const termChip =
  "inline-block rounded bg-[#f4f9ff] px-1.5 py-0.5 !text-[11.5px] font-semibold text-[#2f5b9c] whitespace-nowrap";
