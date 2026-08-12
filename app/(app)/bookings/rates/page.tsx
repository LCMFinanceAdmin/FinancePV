"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Percent, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FACILITIES, TIER_LABELS, applyRateOverrides, type PricingTier, type RateOverride } from "@/lib/facilities";
import type { UserProfile } from "@/lib/types";

const TIERS: PricingTier[] = ["PUBLIC", "MEMBER", "CONGREGATION", "HQ"];

export default function FacilityRatesPage() {
  const supabase = createClient();
  const [user, setUser] = useState<UserProfile | null>(null);
  // edited rates: facilityId -> { rates, concurrent_rates }
  const [draft, setDraft] = useState<Record<string, { rates: Record<string, number>; concurrent: Record<string, number> | null }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  async function loadUser() {
    const { data: { session } } = await supabase.auth.getSession();
    const au = session?.user; if (!au) return;
    const { data } = await supabase.from("user_roles").select("*").eq("email", au.email).single();
    if (!data) return;
    const role = data.role as UserProfile["role"];
    setUser({
      id: au.id, email: au.email ?? "", full_name: data.full_name ?? "", role, ministries: data.ministries ?? [],
      isFinanceAdmin: ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(role),
      isSignatory: ["BISHOP", "TREASURER", "SECRETARY"].includes(role), signatoryRole: role,
      isMinistryHead: role === "MINISTRY_HEAD", isGeneralManager: role === "GENERAL_MANAGER",
      isBuildingManager: role === "BUILDING_MANAGER", isTestAdmin: data.is_test_admin ?? false,
    });
  }

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("facility_rates").select("*");
    const effective = applyRateOverrides((data as RateOverride[]) ?? []);
    const d: Record<string, { rates: Record<string, number>; concurrent: Record<string, number> | null }> = {};
    for (const f of effective) {
      d[f.id] = {
        rates: { ...f.rates },
        concurrent: f.concurrentRates ? { ...f.concurrentRates } : null,
      };
    }
    setDraft(d);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadUser(); load(); }, [load]);

  const canEdit = user?.isBuildingManager || user?.isFinanceAdmin;

  function setRate(fid: string, tier: string, val: number, concurrent: boolean) {
    setDraft(prev => {
      const cur = prev[fid]; if (!cur) return prev;
      if (concurrent) return { ...prev, [fid]: { ...cur, concurrent: { ...(cur.concurrent ?? {}), [tier]: val } } };
      return { ...prev, [fid]: { ...cur, rates: { ...cur.rates, [tier]: val } } };
    });
  }

  async function save() {
    if (!user) return;
    setSaving(true);
    const rows = FACILITIES.map(f => ({
      facility_id: f.id,
      rates: draft[f.id]?.rates ?? f.rates,
      concurrent_rates: f.concurrentRates ? (draft[f.id]?.concurrent ?? null) : null,
      updated_by: user.email,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("facility_rates").upsert(rows, { onConflict: "facility_id" });
    setSaving(false);
    setToast(error ? error.message : "Rates saved");
    setTimeout(() => setToast(""), 3000);
  }

  const inputCls = "w-24 border-2 border-stone-800 rounded-lg px-2 py-1.5 text-sm text-right font-mono outline-none focus:border-[#2f5b9c] disabled:bg-stone-50 disabled:text-stone-400";

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <Link href="/bookings" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700">
        <ArrowLeft size={15} /> Back to Bookings
      </Link>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-800 flex items-center gap-2"><Percent size={20} className="text-[#4a6da7]" /> Facility Rates</h1>
          <p className="text-sm text-stone-500 mt-0.5">Set the rate per payer category for each facility</p>
        </div>
        {canEdit && (
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1.5 bg-[#4a6da7] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#3d5c8f] disabled:opacity-50">
            <Save size={15} /> {saving ? "Saving…" : "Save Rates"}
          </button>
        )}
      </div>

      {toast && <div className="text-sm text-white bg-green-600 rounded-lg px-3 py-2">{toast}</div>}

      {loading ? (
        <div className="text-center py-16 text-stone-400 text-sm">Loading…</div>
      ) : (
        <div className="space-y-3">
          {FACILITIES.map(f => {
            const d = draft[f.id];
            if (!d) return null;
            return (
              <div key={f.id} className="bg-white border border-stone-200 rounded-2xl p-4">
                <div className="mb-2">
                  <span className="text-sm font-semibold text-stone-800">{f.name}</span>
                  <span className="text-xs text-stone-400 ml-2">{f.rateLabel} · {f.capacity}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="text-sm border-collapse">
                    <thead>
                      <tr className="text-stone-400 text-xs">
                        <th className="text-left pr-3 py-1">Rate (RM)</th>
                        {TIERS.map(t => <th key={t} className="px-2 py-1 text-right">{TIER_LABELS[t]}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="pr-3 py-1 text-stone-600">Standard</td>
                        {TIERS.map(t => (
                          <td key={t} className="px-2 py-1 text-right">
                            <input type="number" disabled={!canEdit} className={inputCls}
                              value={d.rates[t] ?? 0} onChange={e => setRate(f.id, t, parseFloat(e.target.value) || 0, false)} />
                          </td>
                        ))}
                      </tr>
                      {f.concurrentRates && (
                        <tr>
                          <td className="pr-3 py-1 text-stone-600">Concurrent</td>
                          {TIERS.map(t => (
                            <td key={t} className="px-2 py-1 text-right">
                              <input type="number" disabled={!canEdit} className={inputCls}
                                value={d.concurrent?.[t] ?? 0} onChange={e => setRate(f.id, t, parseFloat(e.target.value) || 0, true)} />
                            </td>
                          ))}
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {f.notes && <p className="text-[11px] text-stone-400 mt-2">{f.notes}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
