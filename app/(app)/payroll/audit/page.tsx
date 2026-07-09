"use client";
// Payroll audit trail viewer — read-only list of the append-only
// payroll_audit_log. Restricted to Finance Executives, the GM and signatories.
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, ScrollText, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  employee_id: string | null;
  detail: string;
  actor: string;
  created_at: string;
}

const ACTION_META: Record<string, { label: string; cls: string }> = {
  EMPLOYEE_CREATED: { label: "Employee created", cls: "bg-green-100 text-green-700" },
  EMPLOYEE_UPDATED: { label: "Employee updated", cls: "bg-sky-100 text-sky-700" },
  EMPLOYEE_DELETED: { label: "Employee deleted", cls: "bg-red-100 text-red-600" },
  SALARY_CHANGE: { label: "Salary change", cls: "bg-violet-100 text-violet-700" },
  DOC_UPLOAD: { label: "Document upload", cls: "bg-blue-100 text-blue-700" },
  DOC_UPDATE: { label: "Document update", cls: "bg-sky-100 text-sky-700" },
  DOC_DELETE: { label: "Document delete", cls: "bg-red-100 text-red-600" },
  LOAN_APPLIED: { label: "Loan applied", cls: "bg-amber-100 text-amber-700" },
  LOAN_SIGNED: { label: "Loan e-signed", cls: "bg-green-100 text-green-700" },
  LOAN_REJECTED: { label: "Loan rejected", cls: "bg-red-100 text-red-600" },
  LOAN_APPROVED_LEGACY: { label: "Loan approved", cls: "bg-green-100 text-green-700" },
  RUN_FINALIZED: { label: "Run finalized", cls: "bg-[#4a6da7]/10 text-[#4a6da7]" },
  VOUCHER_PAID: { label: "Voucher paid", cls: "bg-green-100 text-green-700" },
  BANK_EXPORT: { label: "Bank export", cls: "bg-emerald-100 text-emerald-700" },
  PAYSLIPS_SENT: { label: "Payslips sent", cls: "bg-blue-100 text-blue-700" },
};

// Filter groups shown as chips — each maps to a set of raw actions.
const FILTER_GROUPS: { key: string; label: string; actions: string[] }[] = [
  { key: "employees", label: "Employees", actions: ["EMPLOYEE_CREATED", "EMPLOYEE_UPDATED", "EMPLOYEE_DELETED"] },
  { key: "salary", label: "Salary changes", actions: ["SALARY_CHANGE"] },
  { key: "documents", label: "Documents", actions: ["DOC_UPLOAD", "DOC_UPDATE", "DOC_DELETE"] },
  { key: "loans", label: "Loans & e-signs", actions: ["LOAN_APPLIED", "LOAN_SIGNED", "LOAN_REJECTED", "LOAN_APPROVED_LEGACY"] },
  { key: "runs", label: "Payroll runs", actions: ["RUN_FINALIZED", "VOUCHER_PAID"] },
  { key: "exports", label: "Bank exports", actions: ["BANK_EXPORT"] },
  { key: "payslips", label: "Payslips", actions: ["PAYSLIPS_SENT"] },
];

function fmtDateTime(s: string): string {
  return new Date(s).toLocaleString("en-MY", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function PayrollAuditPage() {
  const supabase = createClient();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { setAllowed(false); return; }
      const { data } = await supabase.from("user_roles").select("role").eq("email", session.user.email).single();
      const role = data?.role ?? "";
      setAllowed(["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3", "GENERAL_MANAGER", "BISHOP", "TREASURER", "SECRETARY"].includes(role));
    })();
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("payroll_audit_log")
      .select("*").order("created_at", { ascending: false }).limit(400);
    setEntries((data as AuditEntry[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  if (allowed === false) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-stone-400 text-sm">
        You don’t have access to the payroll audit trail.
      </div>
    );
  }

  const activeGroup = FILTER_GROUPS.find(g => g.key === filter);
  const visible = entries.filter(e => {
    if (activeGroup && !activeGroup.actions.includes(e.action)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return e.entity.toLowerCase().includes(q) || e.detail.toLowerCase().includes(q) || e.actor.toLowerCase().includes(q);
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <Link href="/payroll" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700">
        <ArrowLeft size={15} /> Back to Payroll
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-stone-800 flex items-center gap-2">
          <ScrollText size={20} className="text-[#4a6da7]" /> Audit Trail
        </h1>
        <p className="text-sm text-stone-500 mt-0.5">
          Append-only log of salary changes, documents, loans, e-signatures, payroll finalization, bank exports and payslip sends
        </p>
      </div>

      {/* Search + filter chips */}
      <div className="space-y-2">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, detail or actor…"
            className="w-full border border-stone-300 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-[#4a6da7] bg-white" />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTER_GROUPS.map(g => (
            <button key={g.key} onClick={() => setFilter(f => f === g.key ? "" : g.key)}
              className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                filter === g.key ? "bg-[#4a6da7] text-white border-transparent" : "bg-white text-stone-500 border-stone-200 hover:border-[#4a6da7]/40"}`}>
              {g.label}
            </button>
          ))}
          {filter && (
            <button onClick={() => setFilter("")}
              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-stone-100 text-stone-500 hover:bg-stone-200 transition-colors">
              Clear <X size={11} />
            </button>
          )}
        </div>
      </div>

      {loading || allowed === null ? (
        <div className="text-center py-16 text-stone-400 text-sm">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-stone-400 text-sm">
          {entries.length === 0 ? "No audit entries yet — actions are recorded from now on." : "No entries match the current filter."}
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs text-stone-400">{visible.length} entr{visible.length !== 1 ? "ies" : "y"} (latest 400 loaded)</p>
          {visible.map(e => {
            const meta = ACTION_META[e.action] ?? { label: e.action, cls: "bg-stone-100 text-stone-500" };
            return (
              <div key={e.id} className="bg-white border border-stone-200 rounded-xl px-4 py-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${meta.cls}`}>{meta.label}</span>
                  {e.entity && (
                    e.employee_id
                      ? <Link href={`/payroll/${e.employee_id}`} className="text-sm font-semibold text-[#4a6da7] hover:underline">{e.entity}</Link>
                      : <span className="text-sm font-semibold text-stone-700">{e.entity}</span>
                  )}
                  <span className="ml-auto text-[11px] text-stone-400 shrink-0">{fmtDateTime(e.created_at)}</span>
                </div>
                {e.detail && <p className="text-xs text-stone-500 mt-1">{e.detail}</p>}
                {e.actor && <p className="text-[10px] text-stone-300 mt-0.5">by {e.actor}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
