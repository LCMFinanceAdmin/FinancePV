"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarClock, Plus, ChevronRight, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import type { UserProfile, PayrollRun } from "@/lib/types";

const MONTH_LABELS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December", "13th Month"];
const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-amber-100 text-amber-700",
  FINALIZED: "bg-blue-100 text-blue-700",
  PAID: "bg-green-100 text-green-700",
};

export default function PayrollRunsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const now = new Date();
  const [newYear, setNewYear] = useState(now.getFullYear());
  const [newMonth, setNewMonth] = useState(now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2); // next month

  async function loadUser() {
    const { data: { session } } = await supabase.auth.getSession();
    const au = session?.user;
    if (!au) return;
    const { data } = await supabase.from("user_roles").select("*").eq("email", au.email).single();
    if (!data) return;
    const role = data.role as UserProfile["role"];
    setUser({
      id: au.id, email: au.email ?? "", full_name: data.full_name ?? "", role,
      ministries: data.ministries ?? [],
      isFinanceAdmin: ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(role),
      isSignatory: ["BISHOP", "TREASURER", "SECRETARY"].includes(role),
      signatoryRole: role, isMinistryHead: role === "MINISTRY_HEAD",
      isGeneralManager: role === "GENERAL_MANAGER", isBuildingManager: role === "BUILDING_MANAGER",
      isTestAdmin: data.is_test_admin ?? false,
    });
  }

  const loadRuns = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("payroll_runs").select("*").order("year", { ascending: false }).order("month", { ascending: false });
    setRuns((data as PayrollRun[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadUser(); loadRuns(); }, [loadRuns]);

  const canCreate = user?.isFinanceAdmin;

  // Reminder: salaries pay at month start, so prompt to create next month's run from the 18th.
  const upcoming = (() => { const d = new Date(now.getFullYear(), now.getMonth() + 1, 1); return { year: d.getFullYear(), month: d.getMonth() + 1 }; })();
  const upcomingMissing = !runs.some(r => r.year === upcoming.year && r.month === upcoming.month);
  const showReminder = now.getDate() >= 18 && upcomingMissing;

  async function createRun() {
    setError(""); setCreating(true);
    try {
      const { data, error: e } = await supabase.from("payroll_runs")
        .insert({ year: newYear, month: newMonth, status: "DRAFT", created_by: user?.email ?? "" })
        .select("id").single();
      if (e) {
        if (e.code === "23505") throw new Error(`A run for ${MONTH_LABELS[newMonth]} ${newYear} already exists.`);
        throw new Error(e.message);
      }
      router.push(`/payroll/runs/${data!.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create run");
      setCreating(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <Link href="/payroll" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700">
        <ArrowLeft size={15} /> Back to Payroll
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-stone-800 flex items-center gap-2"><CalendarClock size={20} className="text-[#4a6da7]" /> Payroll Runs</h1>
        <p className="text-sm text-stone-500 mt-0.5">Generate and track monthly payroll</p>
      </div>

      {showReminder && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            Reminder: the <span className="font-semibold">{MONTH_LABELS[upcoming.month]} {upcoming.year}</span> payroll run hasn&apos;t been created yet.
            Salaries pay at the start of the month — create it now to allow time for approval.
          </p>
        </div>
      )}

      {canCreate && (
        <div className="bg-white border border-stone-200 rounded-2xl p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">New Run</p>
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2">{error}</div>}
          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">Year</label>
              <input type="number" value={newYear} onChange={e => setNewYear(parseInt(e.target.value) || now.getFullYear())}
                className="w-24 border-2 border-stone-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#2f5b9c]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">Month</label>
              <select value={newMonth} onChange={e => setNewMonth(parseInt(e.target.value))}
                className="border-2 border-stone-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#2f5b9c]">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{MONTH_LABELS[m]}</option>)}
                <option value={13}>13th Month</option>
              </select>
            </div>
            <button onClick={createRun} disabled={creating}
              className="flex items-center gap-1.5 bg-[#4a6da7] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#3d5c8f] disabled:opacity-50">
              <Plus size={15} /> {creating ? "Creating…" : "Create Run"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-stone-400 text-sm">Loading…</div>
      ) : runs.length === 0 ? (
        <div className="text-center py-16 text-stone-400 text-sm">No payroll runs yet.</div>
      ) : (
        <div className="space-y-2">
          {runs.map(r => (
            <Link key={r.id} href={`/payroll/runs/${r.id}`}
              className="flex items-center gap-3 px-4 py-3 bg-white border border-stone-200 rounded-xl hover:shadow-sm hover:border-[#4a6da7]/40 transition-all">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-stone-800">{MONTH_LABELS[r.month]} {r.year}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                </div>
                <div className="text-xs text-stone-400 mt-0.5">Net {formatCurrency(r.total_net)} · Total LCM {formatCurrency(r.total_lcm)}</div>
              </div>
              <ChevronRight size={15} className="text-stone-300 shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
