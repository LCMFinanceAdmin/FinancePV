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

import { CheckCircle2, XCircle, Clock, Loader2, Check } from "lucide-react";
import { formatCurrency, formatDate, formatDateTime, roleLabel } from "@/lib/utils";
import type { PV, PVApproval } from "@/lib/types";

// The four stages every voucher passes through, in order. Statuses are mapped
// onto them rather than shown raw, because the status vocabulary is an internal
// one — PENDING_HEAD and PENDING are the same stage to everybody but the code.
// Two labels each. The strip has four of them across a pane that can be
// 300px wide, and "Finance Review" set nowrap was enough on its own to push a
// horizontal scrollbar onto the whole pane. The long name is still what the
// current step is called in the sentence underneath.
const STEPS = [
  { key: "submitted", label: "Submitted",      short: "Submitted" },
  { key: "review",    label: "Finance Review", short: "Finance" },
  { key: "approval",  label: "Approval",       short: "Approval" },
  { key: "payment",   label: "Payment",        short: "Payment" },
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
  pv, loading, approvals, extraActions, budget,
}: {
  pv: PV | null;
  loading?: boolean;
  approvals?: PVApproval[];
  /** What approving this would do to the ministry's budget. */
  budget?: React.ReactNode;
  /** What this viewer may do with the voucher besides decide it — open the
   *  full record, record the committee's verification, undo their own
   *  signature. Approving and rejecting are not here: they sit on the card in
   *  the queue, beside the amount, which is the fact they are weighed against. */
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
        {/* ── Who and how much ─────────────────────────────────
            Leading on the payee and the amount, not the reference number. A
            reviewer is deciding whether to pay this person this sum; the PV
            number is how you cite it afterwards, not what you read first. */}
        <div className="border-b border-[#eef4fc] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold leading-tight text-stone-800">
                {pv.payee_name}
              </p>
              <p className="mt-0.5 text-[11px] text-stone-400">
                {pv.pv_no}{pv.date ? ` · ${formatDate(pv.date)}` : ""}
              </p>
            </div>
            <span className="shrink-0 text-[17px] font-bold tabular-nums leading-tight text-stone-900">
              {formatCurrency(pv.amount)}
            </span>
          </div>
          {pv.purpose && (
            <p className="mt-1.5 text-[12px] leading-snug text-stone-600">{pv.purpose}</p>
          )}
          <span className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            rejected            ? "bg-red-100 text-red-700"
            : pv.status === "PAID"     ? "bg-blue-100 text-blue-700"
            : pv.status === "APPROVED" ? "bg-green-100 text-green-700"
            : "bg-amber-100 text-amber-700"}`}>
            {rejected ? <XCircle size={10} /> : pv.status === "PAID" || pv.status === "APPROVED"
              ? <CheckCircle2 size={10} /> : <Clock size={10} />}
            {SUBTITLE[pv.status] ?? pv.status.replace(/_/g, " ")}
          </span>
        </div>

        {/* ── The rest, in two columns ─────────────────────────
            Half the height of the old stacked card, and shorter still because
            the purpose is above rather than repeated here, and a reference
            number equal to the PV number is not a second fact. */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-4 py-3">
          <Row label="Project" value={[pv.dept, pv.ministry].filter(Boolean).join(" / ")} />
          <Row label="Code" value={pv.accounting_code} />
          <Row label="Submitted by" value={pv.submitted_by} />
          <Row label="On" value={pv.submitted_at ? formatDateTime(pv.submitted_at) : null} />
          {pv.ref_no && pv.ref_no !== pv.pv_no && <Row label="Ref" value={pv.ref_no} />}
        </div>

        {budget && <div className="px-4 pb-3">{budget}</div>}

        {/* ── Where it has got to ──────────────────────────────
            Four dots across rather than four rows down. The old version spent
            most of the pane on a sentence per step, all four of which say what
            the marked dot already says — and cost the buttons their place on
            the screen. Only the current step keeps its line of prose, because
            only that one is telling you something you cannot see. */}
        <div className="border-t border-[#f0f5fc] px-4 py-3">
          <ol className="flex items-center">
            {STEPS.map((step, i) => {
              const done    = !rejected && stage > i;
              const current = !rejected && stage === i + 1;
              const last    = i === STEPS.length - 1;
              return (
                <li key={step.key} className={`flex min-w-0 items-center ${last ? "" : "flex-1"}`}>
                  <div className="flex min-w-0 flex-col items-center gap-1">
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                      done    ? "border-green-500 bg-green-500 text-white"
                      : current ? "border-amber-400 bg-amber-400 text-white"
                      : "border-stone-200 bg-white"}`}>
                      {done ? <Check size={9} strokeWidth={3.5} /> : null}
                    </span>
                    <span title={step.label}
                      className={`truncate text-[9px] font-semibold uppercase tracking-wide ${
                        current ? "text-amber-600" : done ? "text-stone-500" : "text-stone-300"}`}>
                      {step.short}
                    </span>
                  </div>
                  {!last && (
                    <span className={`mx-1 -mt-4 h-0.5 flex-1 ${done ? "bg-green-300" : "bg-stone-200"}`} />
                  )}
                </li>
              );
            })}
          </ol>

          <p className="mt-2 text-[11px] leading-snug text-stone-500">
            {rejected
              ? "Returned to the submitter."
              : stepNote(STEPS[Math.min(stage, STEPS.length) - 1].key,
                         Math.min(stage, STEPS.length) - 1, stage, pv, signed, rejected)}
          </p>

          {/* Who has actually signed. The dots say where it is; this says who
              it is waiting on, which is the question people actually ask. */}
          {signed.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {signed.map((a, i) => (
                <span key={`${a.role}-${i}`}
                  className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-medium ${
                    a.action === "APPROVED" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                  {a.action === "APPROVED" ? <CheckCircle2 size={9} /> : <XCircle size={9} />}
                  {roleLabel(a.role)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {extraActions && (
        <div className="shrink-0 border-t border-[#eef4fc] bg-white px-3 py-2.5">
          {extraActions}
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

/** Label over value. Side by side needs a fixed label column wide enough for
 *  the longest one, which in two columns leaves the values almost no room. */
function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9.5px] font-semibold uppercase tracking-wide text-stone-400">{label}</dt>
      <dd className="truncate text-[12px] text-stone-700" title={value ?? undefined}>
        {value?.trim() ? value : "—"}
      </dd>
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
