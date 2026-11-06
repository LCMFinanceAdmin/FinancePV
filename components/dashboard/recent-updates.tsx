"use client";
// The last few things that moved.
//
// The dashboard was all queues: what is waiting, what needs deciding, what is
// owed. All of it forward-looking, so somebody who had been away for a week
// had no way to find out what happened while they were gone short of opening
// every list and comparing it with what they remembered.
//
// Deliberately short and deliberately read-only. It is a thing to glance at on
// the way past, not a sixth list to work through, so it holds five rows and
// every one of them is a link to where the real work is.

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, STATUS_LABELS } from "@/lib/utils";
import type { PVStatus } from "@/lib/types";
import { CheckCircle2, Clock, FileText, XCircle, AlertCircle } from "lucide-react";

interface Row {
  id: string;
  pv_no: string;
  status: PVStatus;
  amount: number;
  payee_name: string;
  submitted_at: string;
  paid_at: string | null;
}

/** The icon a status earns, so the column can be read down without stopping. */
function markOf(status: PVStatus) {
  if (status === "PAID") return { Icon: CheckCircle2, tint: "text-emerald-500 bg-emerald-50" };
  if (status === "APPROVED") return { Icon: CheckCircle2, tint: "text-blue-500 bg-blue-50" };
  if (status === "REJECTED" || status === "CANCELLED") return { Icon: XCircle, tint: "text-red-400 bg-red-50" };
  // Sent back by the head of department: not a refusal, but it needs the
  // person who raised it to do something, so it is marked rather than grey.
  if (status === "REJECTED_HEAD") return { Icon: AlertCircle, tint: "text-amber-500 bg-amber-50" };
  return { Icon: Clock, tint: "text-stone-400 bg-stone-100" };
}

/**
 * When it happened, said the way somebody would say it.
 *
 * Compared on calendar days rather than elapsed hours: something at 11pm last
 * night is "Yesterday" at 1am, not "2 hours ago", and a feed that says
 * otherwise reads as though it is describing a different day's work.
 */
export function whenLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.round(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
     - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000);
  const time = d.toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit", hour12: true });
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}

export function RecentUpdates({ email, isFinanceAdmin, isBam }: {
  email: string;
  isFinanceAdmin: boolean;
  isBam: boolean;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    let q = supabase.from("pvs")
      .select("id, pv_no, status, amount, payee_name, submitted_at, paid_at")
      .order("submitted_at", { ascending: false })
      .limit(5);
    // The same scoping the figures above use: Finance sees the desk's work,
    // everybody else sees their own, and a BAM role sees the building side
    // rather than both at once.
    q = isBam ? q.eq("pv_type", "BAM") : q.neq("pv_type", "BAM");
    if (!isFinanceAdmin) q = q.eq("submitted_by_email", email);
    q.then(({ data }) => { if (!cancelled) setRows((data ?? []) as Row[]); });
    return () => { cancelled = true; };
  }, [email, isFinanceAdmin, isBam]);

  return (
    <section className="rounded-2xl border border-stone-100 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-3">
        <Clock size={15} className="text-stone-400" />
        <h2 className="text-[13px] font-bold text-stone-700">Recent updates</h2>
      </div>
      {rows === null ? (
        <div className="px-4 py-6 text-center text-xs text-stone-300">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-stone-400">
          Nothing has moved yet.
        </div>
      ) : (
        <ul className="divide-y divide-stone-50">
          {rows.map(r => {
            const { Icon, tint } = markOf(r.status);
            // Paid is the one status with a date of its own worth showing:
            // when the money actually left, not when the voucher was raised.
            const at = r.status === "PAID" && r.paid_at ? r.paid_at : r.submitted_at;
            return (
              <li key={r.id}>
                <Link href={`/my-pvs/${r.id}`}
                  className="flex items-start gap-2.5 px-4 py-2.5 transition-colors hover:bg-stone-50/70">
                  <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${tint}`}>
                    <Icon size={13} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-stone-700">
                      {r.pv_no} {STATUS_LABELS[r.status]?.toLowerCase() ?? r.status}
                    </span>
                    <span className="block truncate text-[11px] text-stone-400">
                      {r.payee_name} — {formatCurrency(r.amount)}
                    </span>
                    <span className="block text-[10.5px] text-stone-300">{whenLabel(at)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
