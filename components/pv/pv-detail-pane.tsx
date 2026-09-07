"use client";
// One voucher, read closely.
//
// The list answers "what is waiting"; this answers "what is this, and where has
// it got to". Both were previously the same card, which meant the list carried
// detail nobody reads while scanning and the detail was capped at what fits in
// a list row.
//
// The workflow strip is the part that earns its place. Status was a single word
// on a badge — PENDING_SIGNATORY told a reviewer nothing about who had already
// signed or what happens next, and the answer lived in a database column nobody
// outside Finance could read. Four steps, always all four, with the current one
// marked: a voucher's position is then a picture rather than a vocabulary.

import { CheckCircle2, XCircle, Clock, AlertCircle, Loader2, Check } from "lucide-react";
import { formatCurrency, formatDate, formatDateTime, roleLabel } from "@/lib/utils";
import type { PV, PVApproval } from "@/lib/types";

// The four stages every voucher passes through, in order. Statuses are mapped
// onto them rather than shown raw, because the status vocabulary is an internal
// one — PENDING_HEAD and PENDING are the same stage to everybody but the code.
const STEPS = [
  { key: "submitted", label: "Submitted" },
  { key: "review",    label: "Finance Review" },
  { key: "approval",  label: "Approval" },
  { key: "payment",   label: "Payment" },
] as const;

function stageOf(status: string): number {
  switch (status) {
    case "PENDING_HEAD":
    case "PENDING":             return 1;
    case "REVIEWED":
    case "MINISTRY_VERIFIED":
    case "PENDING_SIGNATORY":   return 2;
    case "APPROVED":            return 3;
    case "PAID":                return 4;
    default:                    return 1;   // rejected, cancelled — handled below
  }
}

const SUBTITLE: Record<string, string> = {
  PENDING_HEAD:       "Pending review by Finance Executive",
  PENDING:            "Pending review by Finance Executive",
  REVIEWED:           "Verified — awaiting approval",
  MINISTRY_VERIFIED:  "Ministry verified — awaiting approval",
  PENDING_SIGNATORY:  "Pending approval",
  APPROVED:           "Approved — awaiting payment",
  PAID:               "Paid",
};

export function PVDetailPane({
  pv, loading, approvals, canAct, hasActed, acting,
  onApprove, onReject, onRevert, actionLabel = "Review & Sign", extraActions, budget,
}: {
  pv: PV | null;
  loading?: boolean;
  approvals?: PVApproval[];
  /** Whether this viewer may sign or reject this voucher right now. */
  canAct?: boolean;
  /** They have already given their decision — offer to undo it instead. */
  hasActed?: boolean;
  acting?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onRevert?: () => void;
  actionLabel?: string;
  /** What approving this would do to the ministry's budget. Shown next to the
   *  decision rather than in the list, which is where it is actually needed. */
  budget?: React.ReactNode;
  /** Anything else this viewer may do with this voucher — open the full
   *  record, send it back to Finance. Shown whether or not they may sign. */
  extraActions?: React.ReactNode;
}) {
  if (loading) {
    return (
      <Shell>
        <div className="flex h-full items-center justify-center gap-2 text-sm text-stone-400">
          <Loader2 size={15} className="animate-spin" /> Loading…
        </div>
      </Shell>
    );
  }

  if (!pv) {
    return (
      <Shell>
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <Clock size={26} className="text-stone-200" />
          <p className="text-sm font-medium text-stone-400">Nothing selected</p>
          <p className="max-w-[16rem] text-xs text-stone-400">
            Pick a payment voucher from the list to see its details, where it has got to,
            and what it needs from you.
          </p>
        </div>
      </Shell>
    );
  }

  const rejected = pv.status === "REJECTED" || pv.status === "CANCELLED";
  const stage = stageOf(pv.status);
  const signed = (approvals ?? pv.approvals ?? []) as PVApproval[];

  return (
    <Shell>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* ── Heading ──────────────────────────────────────────── */}
        <div className="border-b border-[#eef4fc] px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="text-lg font-bold text-stone-800">{pv.pv_no}</h2>
            <span className="text-lg font-bold tabular-nums text-stone-800">
              {formatCurrency(pv.amount)}
            </span>
          </div>
          <div className="mt-1.5">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              rejected            ? "bg-red-100 text-red-700"
              : pv.status === "PAID"     ? "bg-blue-100 text-blue-700"
              : pv.status === "APPROVED" ? "bg-green-100 text-green-700"
              : "bg-amber-100 text-amber-700"}`}>
              {rejected ? <XCircle size={11} /> : pv.status === "PAID" || pv.status === "APPROVED"
                ? <CheckCircle2 size={11} /> : <Clock size={11} />}
              {SUBTITLE[pv.status] ?? pv.status.replace(/_/g, " ")}
            </span>
          </div>
          {pv.purpose && (
            <p className="mt-2 text-[13px] leading-relaxed text-stone-500">{pv.purpose}</p>
          )}
        </div>

        {/* ── Details ──────────────────────────────────────────── */}
        <div className="px-5 py-4">
          <div className="rounded-xl border border-[#e6eefa] bg-[#fafcff] px-4 py-3">
            <p className="mb-2 text-[13px] font-bold text-stone-700">Details</p>
            <dl className="space-y-1.5">
              <Row label="Payee" value={pv.payee_name} />
              <Row label="Project" value={[pv.dept, pv.ministry].filter(Boolean).join(" / ")} />
              <Row label="Date" value={pv.date ? formatDate(pv.date) : null} />
              <Row label="Purpose" value={pv.purpose} />
              <Row label="Ref No." value={pv.ref_no || pv.pv_no} />
              <Row label="Accounting Code" value={pv.accounting_code} />
              <Row label="Submitted by" value={pv.submitted_by} />
              <Row label="Submitted on"
                value={pv.submitted_at ? formatDateTime(pv.submitted_at) : null} />
            </dl>
          </div>
        </div>

        {budget && <div className="px-5 pb-4 -mt-2">{budget}</div>}

        {/* ── Workflow ─────────────────────────────────────────── */}
        <div className="px-5 pb-4">
          <p className="mb-2.5 text-[13px] font-bold text-stone-700">Workflow</p>
          <ol className="space-y-0">
            {STEPS.map((step, i) => {
              const done    = !rejected && stage > i;
              const current = !rejected && stage === i + 1;
              const last    = i === STEPS.length - 1;
              return (
                <li key={step.key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      done    ? "border-green-500 bg-green-500 text-white"
                      : current ? "border-amber-400 bg-amber-400 text-white"
                      : "border-stone-200 bg-white"}`}>
                      {done ? <Check size={11} strokeWidth={3} /> : null}
                    </span>
                    {!last && (
                      <span className={`w-0.5 flex-1 ${done ? "bg-green-300" : "bg-stone-200"}`} />
                    )}
                  </div>
                  <div className={last ? "" : "pb-4"}>
                    <p className={`text-[13px] font-semibold ${
                      done || current ? "text-stone-800" : "text-stone-400"}`}>
                      {step.label}
                    </p>
                    <p className="text-[11px] leading-relaxed text-stone-400">
                      {stepNote(step.key, i, stage, pv, signed, rejected)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>

          {/* Who has actually signed. The steps say where it is; this says who
              it is waiting on, which is the question people actually ask. */}
          {signed.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {signed.map((a, i) => (
                <span key={`${a.role}-${i}`}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    a.action === "APPROVED" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                  {a.action === "APPROVED" ? <CheckCircle2 size={9} /> : <XCircle size={9} />}
                  {roleLabel(a.role)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── What it wants from you ───────────────────────────────
          Pinned to the bottom rather than scrolling away: the whole reason a
          reviewer opened this voucher is the decision, and on a long one the
          buttons would otherwise be below the fold. */}
      {(canAct || extraActions) && (
        <div className={`shrink-0 border-t border-[#eef4fc] px-5 py-4 ${
          canAct && !rejected ? "bg-[#fffdf7]" : "bg-white"}`}>
          {canAct && !rejected ? null : extraActions}
          {!canAct || rejected ? null : hasActed ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5 text-[13px] font-semibold text-green-700">
                <CheckCircle2 size={15} /> You have signed this
              </span>
              {onRevert && (
                <button onClick={onRevert} disabled={acting}
                  className="ml-auto rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-600 transition-colors hover:bg-white disabled:opacity-40">
                  Undo my decision
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="mb-3 flex gap-2">
                <AlertCircle size={16} className="mt-px shrink-0 text-amber-500" />
                <div>
                  <p className="text-[13px] font-bold text-amber-700">Your action required</p>
                  <p className="text-[12px] leading-relaxed text-stone-500">
                    Please review the payment voucher and supporting documents.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={onApprove} disabled={acting}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#2f7d4f] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#25663f] disabled:opacity-40">
                  {acting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                  {actionLabel}
                </button>
                <button onClick={onReject} disabled={acting}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-40">
                  <XCircle size={15} /> Reject
                </button>
              </div>
            </>
          )}
          {canAct && !rejected && extraActions && (
            <div className="mt-3 border-t border-amber-100 pt-3">{extraActions}</div>
          )}
        </div>
      )}
    </Shell>
  );
}

function stepNote(
  key: string, i: number, stage: number, pv: PV,
  signed: PVApproval[], rejected: boolean,
): string {
  if (rejected && i > 0) return key === "review" ? "Returned to the submitter" : "—";
  const done = stage > i;
  const current = stage === i + 1;

  switch (key) {
    case "submitted":
      return pv.submitted_at
        ? `${formatDateTime(pv.submitted_at)}${pv.submitted_by ? ` by ${pv.submitted_by}` : ""}`
        : "Submitted";
    case "review":
      return done ? "Verified by Finance" : current ? "Pending review by Finance Executive" : "Not yet reviewed";
    case "approval": {
      if (done) {
        const names = signed.filter(a => a.action === "APPROVED").map(a => roleLabel(a.role));
        return names.length ? `Signed by ${names.join(", ")}` : "Approved";
      }
      if (current) {
        const got = signed.filter(a => a.action === "APPROVED").length;
        return got > 0 ? `${got} of the required signatures given` : "Pending approval";
      }
      return "Pending approval";
    }
    case "payment":
      return pv.paid_at ? `Paid ${formatDate(pv.paid_at)}` : done ? "Paid" : "Not yet paid";
    default:
      return "";
  }
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex gap-3 text-[13px]">
      <dt className="w-[7.5rem] shrink-0 text-stone-400">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-stone-700">{value?.trim() ? value : "—"}</dd>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-[#e3edf9] bg-white">
      {children}
    </div>
  );
}
