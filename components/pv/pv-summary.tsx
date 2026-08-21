// What a voucher says, read the way a bank statement is read.
//
// The queue is worked on a phone, standing up, deciding. The old card led with
// the PV number and the status badge — the two things the person deciding
// already knows — and put the amount in the same size as everything else, the
// date last in grey, and the purpose sharing one truncated line with the
// ministry, where it usually vanished entirely.
//
// A bank app answers "who, how much, when, what for" in that order and at
// those weights, and it is the right order here because it is the order the
// question arrives in. So: date and amount on the top line, payee below it in
// the largest text on the card, ministry and purpose next with room to be read,
// and the reference and status last as the small print they are.
//
// Shared by the Signatory Queue and Finance Activity, which had two copies of
// almost this, differing in ways nobody chose.

import Link from "next/link";
import { Wallet, Layers, ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

export interface PVSummaryProps {
  id?: string | null;
  pvNo?: string;
  payee?: string;
  amount: number;
  ministry?: string | null;
  dept?: string | null;
  purpose?: string | null;
  date?: string | null;
  /** The status badge, rendered by the caller — each page computes it its own way. */
  badge?: React.ReactNode;
  /** Ministry chips open a budget popup on the queue; plain text elsewhere. */
  onMinistryClick?: () => void;
  /** Page-specific controls, pinned to the card's last row beside the status. */
  footer?: React.ReactNode;
}

export function PVSummary({
  id, pvNo, payee, amount, ministry, dept, purpose, date, badge, onMinistryClick, footer,
}: PVSummaryProps) {
  const scope = ministry || dept || null;

  // Sized down about four points from where this started, so a queue shows
  // roughly half as many again per screen. It can afford to be small because
  // the page allows pinch-zoom (see the viewport in app/layout.tsx) — anyone
  // who finds it tight magnifies it, rather than everyone paying for the
  // largest reader on every card.
  //
  // Nothing here can overlap: every row is its own flex line with a gap, every
  // text node that could run long is truncate or line-clamp, and the two halves
  // of a row are min-w-0 (so they may shrink) or shrink-0 (so they may not).
  // Overlap in the old card came from a wrapping paragraph sharing a line with
  // absolutely nothing stopping the buttons beside it.
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[10.5px] font-medium text-stone-500">
          {date ? formatDate(date) : "—"}
        </span>
        <span className="shrink-0 text-[14.5px] font-bold leading-none tabular-nums text-stone-900">
          {formatCurrency(amount)}
        </span>
      </div>

      <div className="mt-1 truncate text-[12.5px] font-bold leading-tight text-stone-900">
        {payee || "—"}
      </div>

      {purpose && (
        <div className="mt-0.5 truncate text-[11px] leading-snug text-stone-600">{purpose}</div>
      )}
    </>
  );

  return (
    <div className="min-w-0">
      {id ? <Link href={`/my-pvs/${id}`} className="block min-w-0">{body}</Link> : body}

      {(scope || pvNo) && (
        <div className="mt-1 flex min-w-0 items-center gap-1 text-[10px] text-stone-400">
          {scope && (
            onMinistryClick ? (
              <button onClick={e => { e.preventDefault(); e.stopPropagation(); onMinistryClick(); }}
                className="inline-flex min-w-0 items-center gap-0.5 !text-[10px] !font-semibold text-[#4a6da7] hover:underline">
                <Wallet size={9} className="shrink-0" />
                <span className="truncate">{scope}</span>
              </button>
            ) : (
              <span className="inline-flex min-w-0 items-center gap-0.5 font-semibold text-[#4a6da7]">
                <Wallet size={9} className="shrink-0" />
                <span className="truncate">{scope}</span>
              </span>
            )
          )}
          {scope && pvNo && <span className="shrink-0">·</span>}
          {pvNo && <span className="shrink-0 font-mono">{pvNo}</span>}
        </div>
      )}

      {/* Status left, page controls right. Wraps as a whole rather than letting
          one side ride over the other. */}
      {(badge || footer) && (
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-stone-100 pt-1.5">
          <span className="flex min-w-0 flex-wrap items-center gap-1">{badge}</span>
          {footer && <span className="flex shrink-0 items-center gap-1.5">{footer}</span>}
        </div>
      )}
    </div>
  );
}

/**
 * The same facts at the top of the voucher itself.
 *
 * The detail page renders the A4 form as a scaled facsimile, which is right for
 * checking wording and wrong for deciding on a phone: the amount sits somewhere
 * inside a page you have to pan around to read. This puts the answer above it,
 * so the form becomes something you consult rather than something you mine.
 */
export function PVKeyFacts({
  payee, amount, ministry, dept, purpose, date, rows,
}: {
  payee: string;
  amount: number;
  ministry?: string | null;
  dept?: string | null;
  purpose?: string | null;
  date?: string | null;
  /** Anything else worth stating up front — payment type, budget line, signed count. */
  rows?: { label: string; value: React.ReactNode }[];
}) {
  const scope = ministry || dept || null;
  return (
    <div className="rounded-2xl border-2 border-[#dbe9fb] bg-white p-4 shadow-[0_2px_10px_rgba(41,87,149,0.06)]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] font-medium text-stone-500">
          {date ? formatDate(date) : "—"}
        </span>
        <span className="shrink-0 text-[22px] font-bold tabular-nums leading-none text-stone-900">
          {formatCurrency(amount)}
        </span>
      </div>

      <div className="mt-1.5 text-[17px] font-bold leading-tight text-stone-900">{payee}</div>

      {scope && (
        <span className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full bg-[#4a6da7]/10 px-2 py-0.5 text-[11.5px] font-semibold text-[#4a6da7]">
          <Wallet size={11} className="shrink-0" />
          <span className="truncate">{scope}</span>
        </span>
      )}

      {purpose && <p className="mt-2 text-[13px] leading-snug text-stone-700">{purpose}</p>}

      {rows && rows.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-stone-100 pt-3">
          {rows.map(r => (
            <div key={r.label} className="min-w-0">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">{r.label}</dt>
              <dd className="truncate text-[13px] font-medium text-stone-800">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/**
 * A Bulk batch or a Master container, read the same way as a single voucher.
 *
 * All four of these — bulk and master, on the queue and on Finance Activity —
 * laid everything on one horizontal line: chevron, badge, name, count, link,
 * total, then two buttons. On a desktop it fits. On a phone the batch name is
 * the flexible element, so it is the one that collapses, and the row ends up
 * announcing "BULK · 3 PVs" for a batch whose name you cannot read.
 *
 * Same shape as PVSummary instead: the total is the largest thing and sits top
 * right, the name is the line you scan, and the actions sit below a rule where
 * a thumb can reach them.
 */
export function PVGroupSummary({
  kind, name, total, countLabel, expanded, onToggle, href, hrefLabel, actions, children,
}: {
  kind: "BULK" | "MASTER";
  name: string;
  total: number;
  countLabel: string;
  expanded: boolean;
  onToggle: () => void;
  href: string;
  hrefLabel: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const master = kind === "MASTER";
  return (
    <div className={`overflow-hidden rounded-xl bg-white shadow-sm ${
      master ? "border-2 border-violet-200 bg-violet-50/30" : "border border-stone-200"}`}>
      <div className="px-3 py-2.5">
        <button onClick={onToggle}
          className="flex w-full items-start justify-between gap-3 text-left transition-opacity hover:opacity-80">
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex items-center gap-1.5">
              {expanded
                ? <ChevronDown size={14} className={`shrink-0 ${master ? "text-violet-400" : "text-stone-400"}`} />
                : <ChevronRight size={14} className={`shrink-0 ${master ? "text-violet-400" : "text-stone-400"}`} />}
              <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold ${
                master ? "bg-violet-100 text-violet-700" : "bg-green-100 text-green-700"}`}>
                <Layers size={10} /> {kind}
              </span>
              <span className="truncate text-[10.5px] text-stone-500">{countLabel}</span>
            </span>
            {/* The name gets a line of its own, so it is never the thing that
                gets squeezed out to make room for a button. */}
            <span className="truncate pl-[20px] text-[12.5px] font-bold text-stone-900">{name}</span>
          </span>
          <span className={`shrink-0 text-[14.5px] font-bold tabular-nums ${
            master ? "text-violet-800" : "text-stone-900"}`}>
            {formatCurrency(total)}
          </span>
        </button>

        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-stone-100 pt-2"
          onClick={e => e.stopPropagation()}>
          {actions}
          <Link href={href}
            className={`ml-auto inline-flex items-center gap-1 whitespace-nowrap text-[10.5px] font-semibold ${
              master ? "text-violet-700" : "text-[#4a6da7]"} hover:underline`}>
            {hrefLabel} →
          </Link>
        </div>
      </div>
      {children}
    </div>
  );
}
