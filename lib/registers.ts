// Official registers — the lists the church hands to somebody outside it.
//
// An auditor asking for the staff list, a bank asking who the signatories are,
// PERKESO asking for the payroll: these all already exist inside the app as
// screens, and every one of them was being answered by a screenshot or by
// somebody retyping it into Word. A retyped list is a list that is wrong the
// moment anything changes, and nobody can tell from looking at it when it was
// true.
//
// So a register is defined once here — its columns and what each row means —
// and rendered two ways from that one definition. One shape in, PDF and Excel
// out, and no chance of the spreadsheet and the printed copy disagreeing about
// what is in column four.
//
// Every register carries the same four facts about itself: who it belongs to,
// the date it speaks for, who produced it and when. Without those a list shared
// outside is just a page of names.

export type RegisterCell = string | number | null;

export interface RegisterColumn {
  header: string;
  /** Excel column width, in characters. */
  width: number;
  /** Share of the PDF table's width. Relative to the other columns. */
  flex: number;
  align?: "left" | "center" | "right";
  /** Two decimals, right aligned, and included in the totals row. */
  money?: boolean;
}

export interface Register {
  key: string;
  title: string;
  /** One line saying what this register is for — printed under the title. */
  purpose: string;
  columns: RegisterColumn[];
  rows: RegisterCell[][];
  /** Printed under the table, for anything a column cannot say. */
  note?: string;
  /** A money register wants a total; a list of officers does not. */
  totals?: boolean;
}

export interface RegisterMeta {
  organisation: string;
  /** The date the register speaks for — usually today, but stated, not assumed. */
  asAt: string;
  generatedBy: string;
  generatedAt: string;
}

export const ORGANISATION = "Lutheran Church in Malaysia";

export const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso.length > 10 ? iso : iso + "T00:00:00").toLocaleDateString("en-MY", {
        day: "2-digit", month: "short", year: "numeric",
      })
    : "—";

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-MY", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

export const fmtMoney = (n: number) =>
  n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * What the downloaded file is called.
 *
 * Dated, because these get filed and emailed and end up in a folder next to
 * last year's. "Employee Register.pdf" twice in a downloads folder is two files
 * nobody can tell apart.
 */
export function registerFilename(reg: Register, meta: RegisterMeta, ext: "pdf" | "xlsx") {
  const slug = reg.title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `LCM-${slug}-${meta.asAt}.${ext}`;
}

/** Column totals, for the money columns only. Non-money columns stay blank. */
export function totalsRow(reg: Register): RegisterCell[] {
  return reg.columns.map((c, i) => {
    if (i === 1) return "TOTAL";
    if (!c.money) return "";
    return reg.rows.reduce((s, r) => s + (typeof r[i] === "number" ? (r[i] as number) : 0), 0);
  });
}

/** Hand a blob to the browser as a download, and let go of the URL after. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
