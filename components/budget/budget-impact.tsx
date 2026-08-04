"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { getBudgetImpact, type BudgetImpactResult } from "@/lib/budget-utils";
export type { BudgetImpactResult };
import { PiggyBank, AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";

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
  /** "panel" = full breakdown; "chip" = one-line summary for dense lists. */
  variant?: "panel" | "chip";
  className?: string;
}

const VERDICT = {
  WITHIN: {
    label: "Within budget",
    chip: "bg-green-50 text-green-700 border-green-200",
    panel: "border-green-200 bg-green-50/60",
    icon: CheckCircle2,
  },
  EXCEEDS: {
    label: "Exceeds budget",
    chip: "bg-red-50 text-red-700 border-red-200",
    panel: "border-red-300 bg-red-50",
    icon: AlertTriangle,
  },
  UNBUDGETED: {
    label: "Unbudgeted",
    chip: "bg-amber-50 text-amber-700 border-amber-200",
    panel: "border-amber-300 bg-amber-50",
    icon: HelpCircle,
  },
} as const;

export function BudgetImpact({
  ministry, projectName, amount, excludePvId, variant = "panel", className = "",
}: Props) {
  const supabase = createClient();
  const [data, setData] = useState<BudgetImpactResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const result = await getBudgetImpact(supabase, {
        ministry: ministry ?? "", projectName, amount, excludePvId,
      });
      if (!cancelled) { setData(result); setLoading(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ministry, projectName, amount, excludePvId]);

  if (loading || !data) {
    return variant === "chip"
      ? <span className={`text-[11px] text-stone-400 ${className}`}>Checking budget…</span>
      : <div className={`rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-xs text-stone-400 ${className}`}>Checking budget…</div>;
  }

  const v = VERDICT[data.verdict];
  const Icon = v.icon;

  if (variant === "chip") {
    return (
      <span
        title={data.verdict === "UNBUDGETED"
          ? "No budget line selected — this spend sits outside the approved budget"
          : `${formatCurrency(data.remaining)} left on ${data.projectName}`}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${v.chip} ${className}`}>
        <Icon size={11} className="shrink-0" />
        {data.verdict === "WITHIN"     && <>Within budget · {formatCurrency(data.balanceAfter)} left after</>}
        {data.verdict === "EXCEEDS"    && <>Over budget by {formatCurrency(data.overBy)}</>}
        {data.verdict === "UNBUDGETED" && <>Unbudgeted</>}
      </span>
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
              {data.projectName
                ? <>{ministry} · {data.projectName}</>
                : <>{ministry || "No ministry"} · no budget line selected</>}
            </div>
          </div>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${v.chip}`}>
          <Icon size={12} />
          {data.verdict === "EXCEEDS" ? `Over by ${formatCurrency(data.overBy)}` : v.label}
        </span>
      </div>

      {data.verdict === "UNBUDGETED" ? (
        <>
          <p className="text-xs text-amber-800 leading-relaxed">
            This payment isn&apos;t tied to an approved budget line, so it can&apos;t be checked against
            a project budget. Treat it as spending outside the approved budget unless the
            applicant can point to the line it belongs under.
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
          {data.verdict === "EXCEEDS" && (
            <p className="mt-2 text-xs font-medium text-red-700">
              ⚠ Approving this will put {data.projectName} over its approved budget by {formatCurrency(data.overBy)}.
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
 * The ministry's overall position, shown under the budget line it belongs to.
 * The decision is made against the line, but knowing whether the ministry has
 * room elsewhere matters when a line is tight or the spend could be reallocated.
 */
function MinistrySummary({ ministry, data }: { ministry?: string | null; data: BudgetImpactResult }) {
  const m = data.ministryTotals;
  if (m.budget <= 0) return null;
  return (
    <div className="mt-3 rounded-xl border border-stone-300/50 bg-white/60 px-3 py-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
          {ministry} — whole ministry
        </span>
        <span className="text-[10px] text-stone-400">
          {data.ministryProjectCount} budget line{data.ministryProjectCount === 1 ? "" : "s"}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        <Row label="Approved budget" value={formatCurrency(m.budget)} />
        <Row label="Spent + committed" value={`− ${formatCurrency(m.spent + m.committed)}`} />
        <Row label="Remaining across ministry" value={formatCurrency(m.remaining)} strong />
      </dl>
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
