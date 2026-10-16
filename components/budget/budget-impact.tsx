"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { getBudgetImpact, type BudgetImpactResult } from "@/lib/budget-utils";
export type { BudgetImpactResult };
import { PiggyBank, AlertTriangle, CheckCircle2, HelpCircle, Shuffle, ChevronDown } from "lucide-react";

// Shows whether a payment is inside its approved budget, at the moment the GM
// or Treasurer decides to accept or reject it. Without this they approve blind:
// the PV detail page carried no budget context at all, and the signatory queue
// only showed ministry-wide totals behind an extra click.

interface Props {
  ministry?: string | null;
  projectName?: string | null;
  amount: number;
  /** The PV under review, so its own in-flight amount isn't counted twice. */
  excludePvId?: string | null;
  /**
   * The transaction's own date, so it is measured against the budget of the
   * year it belongs to rather than the year it happens to be reviewed in.
   */
  date?: string | null;
  /**
   * "panel" = full breakdown; "chip" = one-line summary for dense lists;
   * "expandable" = the chip, which opens the panel beneath it.
   *
   * The signatories asked for the third on 6 October 2026. The chip answers
   * "can this be afforded" and the queue is read on a phone, so it has to stay
   * one line — but the next question is always which line it is drawn against
   * and what is left of it, and that meant leaving the queue for the budget
   * page. The panel already said all of it; it had nowhere to be shown.
   */
  variant?: "panel" | "chip" | "expandable";
  className?: string;
}

// The EXCO votes a ministry its allocation and describes in general terms
// what it is for, without approving the individual projects. So only passing
// the allocation is a breach: a line running out means the expense draws on the
// rest of the ministry's money, and spending on something nobody listed is
// ordinary. Three of these four are shades of normal, and only one is red.
const VERDICT = {
  WITHIN: {
    label: "Within budget",
    chip: "bg-green-50 text-green-700 border-green-200",
    panel: "border-green-200 bg-green-50/60",
    icon: CheckCircle2,
  },
  DRAWN_FROM_MINISTRY: {
    label: "Drawn from the ministry",
    chip: "bg-sky-50 text-sky-700 border-sky-200",
    panel: "border-sky-200 bg-sky-50/60",
    icon: Shuffle,
  },
  UNPLANNED: {
    label: "Not in the outline",
    chip: "bg-amber-50 text-amber-700 border-amber-200",
    panel: "border-amber-300 bg-amber-50",
    icon: HelpCircle,
  },
  EXCEEDS: {
    label: "Over the allocation",
    chip: "bg-red-50 text-red-700 border-red-200",
    panel: "border-red-300 bg-red-50",
    icon: AlertTriangle,
  },
} as const;

export function BudgetImpact({
  ministry, projectName, amount, excludePvId, date, variant = "panel", className = "",
}: Props) {
  const supabase = createClient();
  const [data, setData] = useState<BudgetImpactResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const result = await getBudgetImpact(supabase, {
        ministry: ministry ?? "", projectName, amount, excludePvId,
        year: date ? new Date(date).getFullYear() : undefined,
      });
      if (!cancelled) { setData(result); setLoading(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ministry, projectName, amount, excludePvId, date]);

  if (loading || !data) {
    return variant === "panel"
      ? <div className={`rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-xs text-stone-400 ${className}`}>Checking budget…</div>
      : <span className={`text-[11px] text-stone-400 ${className}`}>Checking budget…</span>;
  }

  const v = VERDICT[data.verdict];
  const Icon = v.icon;

  if (variant === "chip" || variant === "expandable") {
    const label = (
      <>
        <Icon size={11} className="shrink-0" />
        {data.verdict === "WITHIN" && <>Within budget · {formatCurrency(data.balanceAfter)} left after</>}
        {data.verdict === "DRAWN_FROM_MINISTRY" && <>Drawn from the ministry · {formatCurrency(data.ministryBalanceAfter)} left after</>}
        {data.verdict === "UNPLANNED" && <>Not in the outline · {formatCurrency(data.ministryBalanceAfter)} left after</>}
        {data.verdict === "EXCEEDS" && <>Over the allocation by {formatCurrency(data.overBy)}</>}
      </>
    );
    const title =
      data.verdict === "WITHIN"
        ? `${formatCurrency(data.remaining)} left on ${data.projectName}`
        : data.verdict === "DRAWN_FROM_MINISTRY"
          ? `${data.projectName} is spent out; this draws on the rest of the ministry's allocation`
          : data.verdict === "UNPLANNED"
            ? "Not one of the projects in the ministry's outline — counted against the allocation"
            : `Takes ${ministry} past the allocation the EXCO voted, by ${formatCurrency(data.overBy)}`;
    const shape = `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${v.chip} ${className}`;

    if (variant === "chip") return <span title={title} className={shape}>{label}</span>;

    return (
      <div className="min-w-0">
        <button type="button" title={title} aria-expanded={open}
          onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o); }}
          className={`${shape} cursor-pointer transition-colors hover:brightness-95`}>
          {label}
          <ChevronDown size={11}
            className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <BudgetImpact
            ministry={ministry} projectName={projectName} amount={amount}
            excludePvId={excludePvId} date={date} variant="panel" className="mt-2" />
        )}
      </div>
    );
  }

  return (
    <section className={`rounded-2xl border-2 ${v.panel} p-4 ${className}`} aria-label="Budget impact">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <PiggyBank size={16} className="text-stone-500 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-bold text-stone-800">Budget impact</div>
            <div className="text-xs text-stone-500 truncate">
              {data.verdict === "UNPLANNED"
                ? <>{ministry || "No ministry"} · {data.projectName || "no project named"} — not in the outline</>
                : <>{ministry} · {data.projectName}</>}
            </div>
          </div>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${v.chip}`}>
          <Icon size={12} />
          {data.verdict === "EXCEEDS" ? `Over by ${formatCurrency(data.overBy)}` : v.label}
        </span>
      </div>

      {data.verdict === "UNPLANNED" ? (
        <>
          <p className="text-xs text-amber-800 leading-relaxed">
            {data.ministry.hasAllocation
              ? <>This isn&apos;t one of the projects in {ministry}&apos;s outline. The EXCO approves the
                  ministry&apos;s allocation rather than each project, so it is measured against the
                  allocation and recorded as unplanned — not treated as an exception.</>
              : <>{ministry || "This ministry"} has no approved budget for this year, so there is
                  nothing to measure this payment against.</>}
          </p>
          <MinistrySummary ministry={ministry} data={data} />
        </>
      ) : (
        <>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-stone-500">
            Budget line · {data.projectName}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <Row label="Approved budget" value={formatCurrency(data.budget)} />
            <Row label="Already spent" value={`− ${formatCurrency(data.spent)}`} />
            <Row label="Committed (in progress)" value={`− ${formatCurrency(data.committed)}`} />
            <Row label="Remaining" value={formatCurrency(data.remaining)} strong />
          </dl>
          <div className="mt-3 border-t border-stone-300/60 pt-2.5 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-600">This payment</span>
              <span className="font-semibold text-stone-800">− {formatCurrency(data.amount)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-700">Balance after approval</span>
              <span className={`text-base font-bold ${
                data.balanceAfter < 0 ? "text-red-600" : data.balanceAfter <= 200 ? "text-amber-600" : "text-green-700"}`}>
                {formatCurrency(data.balanceAfter)}
              </span>
            </div>
          </div>
          {data.verdict === "DRAWN_FROM_MINISTRY" && (
            <p className="mt-2 text-xs font-medium text-sky-800">
              {data.projectName} is spent out, so {formatCurrency(data.overLineBy)} of this comes from
              the rest of {ministry}&apos;s allocation. The EXCO approved the allocation rather than the
              individual projects, so no further approval is needed for that.
            </p>
          )}
          {data.verdict === "EXCEEDS" && (
            <p className="mt-2 text-xs font-medium text-red-700">
              ⚠ Approving this takes {ministry} past the allocation the EXCO voted, by{" "}
              {formatCurrency(data.overBy)}. For it to stand, the EXCO has to raise the allocation
              by resolution — raise a budget change request.
            </p>
          )}
          {data.committed > 0 && (
            <p className="mt-2 text-[11px] text-stone-500">
              &ldquo;Committed&rdquo; covers payments already in the approval chain but not yet paid, so two
              requests against the same line can&apos;t both look affordable.
            </p>
          )}
          <MinistrySummary ministry={ministry} data={data} />
        </>
      )}
    </section>
  );
}

/**
 * Where the ministry stands — which is where the approved figure now lives.
 *
 * The allocation is what the EXCO voted. The outline beneath it is the set of
 * projects they were shown, and it may add up to less, leaving headroom for
 * what was too early to plan. Showing both is the point: it is the difference
 * between a ministry that has spent its money and one that has merely spent a
 * line of it.
 */
function MinistrySummary({ ministry, data }: { ministry?: string | null; data: BudgetImpactResult }) {
  const m = data.ministry;
  if (!m.hasAllocation) return null;
  const unplanned = m.unplannedSpent + m.unplannedCommitted;
  return (
    <div className="mt-3 rounded-xl border border-stone-300/50 bg-white/60 px-3 py-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
          {ministry} — whole ministry
        </span>
        <span className="text-[10px] text-stone-400">
          {m.lineCount} line{m.lineCount === 1 ? "" : "s"} in the outline
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        <Row
          label={m.allocationVoted ? "Allocation (EXCO resolution)" : "Allocation (from the outline)"}
          value={formatCurrency(m.allocation)}
        />
        {m.headroom > 0 && (
          <Row label="Not yet set against a project" value={formatCurrency(m.headroom)} />
        )}
        <Row label="Spent + committed" value={`− ${formatCurrency(m.spent + m.committed)}`} />
        {unplanned > 0 && (
          <Row label="of that, unplanned" value={formatCurrency(unplanned)} />
        )}
        <Row label="Remaining across ministry" value={formatCurrency(m.remaining)} strong />
      </dl>
      {!m.allocationVoted && (
        <p className="mt-1.5 text-[10px] leading-snug text-stone-500">
          No allocation was recorded for this ministry, so its project lines are being added up
          to stand in for one.
        </p>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <>
      <dt className={`text-stone-600 ${strong ? "font-semibold" : ""}`}>{label}</dt>
      <dd className={`text-right tabular-nums ${strong ? "font-bold text-stone-800" : "text-stone-700"}`}>{value}</dd>
    </>
  );
}
