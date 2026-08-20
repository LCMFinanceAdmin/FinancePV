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
import { Wallet } from "lucide-react";
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
}

export function PVSummary({
  id, pvNo, payee, amount, ministry, dept, purpose, date, badge, onMinistryClick,
}: PVSummaryProps) {
  const scope = ministry || dept || null;
  const body = (
    <>
      {/* When and how much — the two facts that decide whether to read on. */}
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11.5px] font-medium text-stone-500">
          {date ? formatDate(date) : "—"}
        </span>
        <span className="shrink-0 text-[17px] font-bold tabular-nums text-stone-900">
          {formatCurrency(amount)}
        </span>
      </div>

      {/* Who it pays. The largest text on the card, because on a queue of
          twenty this is what is being scanned for. */}
      <div className="mt-0.5 truncate text-[15px] font-bold text-stone-900">{payee || "—"}</div>

      {/* What it is for, with room to actually be read — two lines rather than
          the tail end of one shared with the ministry chip. */}
      {(scope || purpose) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {scope && (
            onMinistryClick ? (
              <button
                onClick={e => { e.preventDefault(); e.stopPropagation(); onMinistryClick(); }}
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-[#4a6da7]/10 px-2 py-0.5 !text-[11px] !font-semibold text-[#4a6da7] transition-colors hover:bg-[#4a6da7]/20">
                <Wallet size={10} className="shrink-0" />
                <span className="truncate">{scope}</span>
              </button>
            ) : (
              <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-[#4a6da7]/10 px-2 py-0.5 text-[11px] font-semibold text-[#4a6da7]">
                <Wallet size={10} className="shrink-0" />
                <span className="truncate">{scope}</span>
              </span>
            )
          )}
          {purpose && (
            <span className="line-clamp-2 min-w-0 text-[12.5px] text-stone-600">{purpose}</span>
          )}
        </div>
      )}

      {/* The reference and where it has got to — small print, because by the
          time you care about these you have already chosen this row. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {pvNo && <span className="font-mono text-[11px] text-stone-400">{pvNo}</span>}
        {badge}
      </div>
    </>
  );

  return id
    ? <Link href={`/my-pvs/${id}`} className="block min-w-0">{body}</Link>
    : <div className="min-w-0">{body}</div>;
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
