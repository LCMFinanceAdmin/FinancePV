"use client";
// What this loan, and the ones already running, leave of somebody's salary.
//
// The approver is told what the deduction leaves, every time, and warned where
// it leaves nothing. A figure shown only when it is alarming is a figure
// nobody has learned to read.
//
// The arithmetic is in lib/payroll/loan-affordability.ts, where it can be
// tested on its own.

import { AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { Affordability } from "@/lib/payroll/loan-affordability";
import type { EmployeeLoan } from "@/lib/types";

export function LoanAffordability({ a, others }: { a: Affordability; others: EmployeeLoan[] }) {
  // Three bands, and the wording changes with them rather than only the
  // colour: over the whole salary, most of it, or comfortably within it.
  const over = a.leftOver < 0;
  const tight = !over && a.share >= 0.5;

  const tone = over
    ? "border-red-300 bg-red-50 text-red-900"
    : tight
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : "border-stone-200 bg-white text-stone-600";

  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${tone}`}>
      <p className="flex items-center gap-1.5 font-semibold">
        {(over || tight) && <AlertTriangle size={13} className="shrink-0" />}
        {over
          ? "This takes more than the whole salary"
          : tight
            ? `This leaves ${formatCurrency(a.leftOver)} a month`
            : `Leaves ${formatCurrency(a.leftOver)} a month`}
      </p>

      <p className="mt-0.5">
        Take-home before any loan is{" "}
        <span className="font-mono font-semibold">{formatCurrency(a.netBeforeLoans)}</span>.
        {a.otherMonthly > 0 ? (
          <>
            {" "}
            {others.length} other loan{others.length === 1 ? "" : "s"} already take{others.length === 1 ? "s" : ""}{" "}
            <span className="font-mono">{formatCurrency(a.otherMonthly)}</span>; with this one,{" "}
            <span className="font-mono font-bold">{formatCurrency(a.totalMonthly)}</span> comes off.
          </>
        ) : (
          <> This loan takes <span className="font-mono font-bold">{formatCurrency(a.thisMonthly)}</span>.</>
        )}
      </p>

      {over && (
        <p className="mt-1 font-medium">
          The instalments are {formatCurrency(Math.abs(a.leftOver))} more than there is to take
          them from. Approved as it stands, the payroll would try to deduct more than the salary
          pays and the net would go below nothing.
        </p>
      )}
      {tight && (
        <p className="mt-1">
          That is {Math.round(a.share * 100)}% of take-home.
        </p>
      )}

      {others.length > 0 && (
        <p className="mt-1 opacity-80">
          {others.map(o => `${o.loan_no} ${formatCurrency(Number(o.monthly_installment))}/mo`).join(" · ")}
        </p>
      )}

      <p className="mt-1 text-[10.5px] opacity-70">
        On the salary in force and this month&rsquo;s rates. PCB is keyed per month, so where one
        is not standing against this person it is counted as nil and the real take-home is a
        little lower.
      </p>
    </div>
  );
}
