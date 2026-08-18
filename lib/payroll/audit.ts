// Append-only payroll audit logging. Fire-and-forget: an audit failure must
// never block the underlying operation, so errors are swallowed after a
// console warning.
import type { SupabaseClient } from "@supabase/supabase-js";

export type PayrollAuditAction =
  | "EMPLOYEE_CREATED" | "EMPLOYEE_UPDATED" | "EMPLOYEE_DELETED" | "SALARY_CHANGE"
  | "DOC_UPLOAD" | "DOC_UPDATE" | "DOC_DELETE"
  | "LOAN_APPLIED" | "LOAN_SIGNED" | "LOAN_REJECTED" | "LOAN_APPROVED_LEGACY"
  | "RUN_FINALIZED" | "VOUCHER_PAID" | "BANK_EXPORT" | "PAYSLIPS_SENT"
  // Raising the run's payment vouchers for approval, and unwinding a run —
  // both change what has been committed, so both belong in the trail.
  | "PVS_GENERATED" | "RUN_REVERTED"
  // Corrections to a payroll year. They move money and they override what the
  // rate table produced, which is exactly the kind of change somebody will want
  // an account of later — and the adjustment row itself is editable, so it
  // cannot be its own history.
  | "ADJUSTMENT_ADDED" | "ADJUSTMENT_UPDATED" | "ADJUSTMENT_DELETED"
  // A finalised run's stored figures edited outside the app. Rare, and the
  // reason never survives in the row itself — see migration 134, where August
  // 2026 was finalised before the SKBBK rate existed.
  | "LINE_CORRECTED";

export async function logPayrollAudit(
  supabase: SupabaseClient,
  entry: {
    action: PayrollAuditAction;
    entity?: string;      // human-readable target — employee name, loan no, run period
    employeeId?: string;
    detail?: string;
  },
): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.from("payroll_audit_log").insert({
      action: entry.action,
      entity: entry.entity ?? "",
      employee_id: entry.employeeId ?? null,
      detail: entry.detail ?? "",
      actor: session?.user?.email ?? "",
    });
    if (error) console.warn("payroll audit log failed:", error.message);
  } catch (e) {
    console.warn("payroll audit log failed:", e);
  }
}
