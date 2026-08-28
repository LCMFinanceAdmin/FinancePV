"use client";
// What each category may claim, and the rates behind it.
//
// This page exists because of the mileage rate. It was written into the code as
// RM0.40, then RM0.50, then RM0.70, and each change needed a developer and a
// deployment — so for a stretch the app and the Terms and Conditions disagreed
// and nobody inside the church could correct it. Rates and ceilings move; the
// people who decide them should be able to enter them.
//
// Read by everybody, written by Finance and the seniors. That split is enforced
// by the row-level policies from migration 175, not here — this only hides the
// controls that would fail.

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ReceiptText, Save, Loader2, Info } from "lucide-react";

interface ClaimType {
  code: string; name: string; description: string | null;
  unit_rate: number | null; unit_label: string | null;
  sort_order: number; active: boolean;
}
interface Entitlement {
  id: string; claim_code: string; person_category: string;
  basis: string; percent_covered: number; cap_amount: number | null;
  source: string | null; note: string | null; active: boolean;
}

// The three the Terms and Conditions describe. Anyone outside them — a
// volunteer, a vendor — has no personal entitlement at all, which is correct.
const CATEGORIES: { key: string; label: string }[] = [
  { key: "PASTOR",        label: "Pastor" },
  { key: "PARISH_WORKER", label: "Parish worker" },
  { key: "HQ_STAFF",      label: "Ministry & admin staff" },
];

const BASIS_LABEL: Record<string, string> = {
  YEARLY:    "each year",
  PER_EVENT: "per occasion",
  UNLIMITED: "no ceiling",
};

const cellInput =
  "w-24 rounded border border-stone-300 px-2 py-1 text-right text-[13px] tabular-nums outline-none focus:border-[#2f5b9c]";

export default function ClaimSettingsPage() {
  const supabase = createClient();

  const [types, setTypes] = useState<ClaimType[]>([]);
  const [ents, setEnts] = useState<Entitlement[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState({ msg: "", ok: true });

  // Local edits, keyed by row, so a half-typed figure never hits the database.
  const [draft, setDraft] = useState<Record<string, { percent: string; cap: string }>>({});
  const [rateDraft, setRateDraft] = useState<Record<string, string>>({});

  function say(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast({ msg: "", ok: true }), 3500);
  }

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from("user_roles").select("role").eq("email", user?.email ?? "").maybeSingle();
    const role = profile?.role ?? "";
    setCanEdit(["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3",
                "TREASURER", "GENERAL_MANAGER", "BISHOP", "SECRETARY"].includes(role));

    const [{ data: ct }, { data: ce }] = await Promise.all([
      supabase.from("claim_types").select("*").order("sort_order"),
      supabase.from("claim_entitlements").select("*"),
    ]);
    setTypes((ct ?? []) as ClaimType[]);
    setEnts((ce ?? []) as Entitlement[]);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const entFor = (code: string, cat: string) =>
    ents.find(e => e.claim_code === code && e.person_category === cat) ?? null;

  async function saveEntitlement(e: Entitlement) {
    const d = draft[e.id];
    if (!d) return;
    const percent = Number(d.percent);
    const cap = d.cap.trim() === "" ? null : Number(d.cap);

    if (!(percent > 0 && percent <= 100)) { say("Cover must be between 1 and 100 per cent", false); return; }
    if (e.basis !== "UNLIMITED" && (cap === null || !(cap >= 0))) {
      say("A yearly or per-occasion entitlement needs a ceiling", false); return;
    }

    setSaving(e.id);
    const { error } = await supabase.from("claim_entitlements")
      .update({ percent_covered: percent, cap_amount: cap, updated_at: new Date().toISOString() })
      .eq("id", e.id);
    setSaving(null);
    if (error) { say(error.message, false); return; }
    setDraft(p => { const n = { ...p }; delete n[e.id]; return n; });
    say("Saved");
    load();
  }

  async function saveRate(t: ClaimType) {
    const raw = rateDraft[t.code];
    if (raw === undefined) return;
    const rate = raw.trim() === "" ? null : Number(raw);
    if (rate !== null && !(rate > 0)) { say("A rate must be more than nothing", false); return; }

    setSaving(t.code);
    const { error } = await supabase.from("claim_types")
      .update({ unit_rate: rate, updated_at: new Date().toISOString() })
      .eq("code", t.code);
    setSaving(null);
    if (error) { say(error.message, false); return; }
    setRateDraft(p => { const n = { ...p }; delete n[t.code]; return n; });
    say("Rate saved — it applies to claims made from now on");
    load();
  }

  if (loading) {
    return <div className="cloudlight-page"><p className="py-16 text-center text-sm text-stone-400">Loading…</p></div>;
  }

  const rated = types.filter(t => t.unit_rate !== null || t.unit_label);

  return (
    <div className="cloudlight-page max-w-5xl">
      {toast.msg && (
        <div className={`fixed right-4 top-4 z-50 rounded-xl px-4 py-3 text-sm text-white shadow-lg ${
          toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.msg}
        </div>
      )}

      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-xl font-bold text-stone-800">
          <ReceiptText size={20} className="text-[#4a6da7]" /> Claim Entitlements
        </h1>
        <p className="mt-0.5 text-sm text-stone-500">
          What each category of co-worker may claim. From the Terms and Conditions of Service,
          revised 21 August 2013.
        </p>
      </header>

      {!canEdit && (
        <div className="mb-4 flex gap-2 rounded-xl border border-[#dce9fb] bg-[#f5f9ff] px-3.5 py-2.5">
          <Info size={15} className="mt-0.5 shrink-0 text-[#4a6da7]" />
          <p className="text-xs leading-relaxed text-stone-600">
            You can read these but not change them. Ceilings and rates are set by the Finance
            Executive, the Treasurer, the General Manager, the Bishop or the Secretary.
          </p>
        </div>
      )}

      {/* ── Rates ─────────────────────────────────────────────────────────── */}
      {rated.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <span className="text-sm font-bold text-stone-800">Rates</span>
          </CardHeader>
          <CardBody className="space-y-3">
            {rated.map(t => (
              <div key={t.code} className="flex flex-wrap items-center gap-3">
                <div className="min-w-[9rem]">
                  <div className="text-sm font-medium text-stone-800">{t.name}</div>
                  <div className="text-[11px] text-stone-400">per {t.unit_label ?? "unit"}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-stone-400">RM</span>
                  <input
                    type="number" step="0.01" min="0" disabled={!canEdit}
                    className={cellInput}
                    value={rateDraft[t.code] ?? (t.unit_rate ?? "")}
                    onChange={e => setRateDraft(p => ({ ...p, [t.code]: e.target.value }))} />
                  {canEdit && rateDraft[t.code] !== undefined && (
                    <button onClick={() => saveRate(t)} disabled={saving === t.code}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#4a6da7] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#3d5a8f] disabled:opacity-40">
                      {saving === t.code ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
                    </button>
                  )}
                </div>
                {t.description && (
                  <span className="text-[11px] text-stone-400">{t.description}</span>
                )}
              </div>
            ))}
            <p className="text-[11px] leading-relaxed text-stone-400">
              A rate change applies to claims made from now on. Vouchers already submitted keep
              the figure they were calculated with, which is what makes an old voucher still add up.
            </p>
          </CardBody>
        </Card>
      )}

      {/* ── Entitlements ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <span className="text-sm font-bold text-stone-800">Ceilings by category</span>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px] tabular-nums">
            <thead>
              <tr className="border-y border-[#cfe0f6] bg-[#f2f8ff]">
                <th className="px-4 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.09em] text-[#4a6483]">Claim</th>
                <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.09em] text-[#4a6483]">Category</th>
                <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.09em] text-[#4a6483]">Applies</th>
                <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-[#4a6483]">Covered</th>
                <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-[#4a6483]">Ceiling</th>
                <th className="px-4 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.09em] text-[#4a6483]">Clause</th>
                <th className="w-16 px-2 py-1.5" />
              </tr>
            </thead>
            {types.map(t => {
              const rows = CATEGORIES.map(c => ({ c, e: entFor(t.code, c.key) })).filter(r => r.e);
              if (rows.length === 0) return null;
              return (
                <tbody key={t.code}>
                  <tr>
                    <td colSpan={7}
                      className="border-b border-[#e6eefa] bg-[#fafcff] px-4 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#3a5a86]">
                      {t.name}
                    </td>
                  </tr>
                  {rows.map(({ c, e }) => {
                    const ent = e!;
                    const d = draft[ent.id];
                    const dirty = d !== undefined;
                    return (
                      <tr key={ent.id} className="border-b border-[#f0f5fc] hover:bg-[#f7fbff]">
                        <td className="py-1.5 pl-4 pr-3 text-stone-400">&mdash;</td>
                        <td className="px-3 py-1.5 font-medium text-stone-800">{c.label}</td>
                        <td className="px-3 py-1.5 text-stone-500">{BASIS_LABEL[ent.basis] ?? ent.basis}</td>
                        <td className="px-3 py-1.5 text-right">
                          <input
                            type="number" min="1" max="100" step="1" disabled={!canEdit}
                            className={`${cellInput} w-16`}
                            value={d ? d.percent : ent.percent_covered}
                            onChange={ev => setDraft(p => ({
                              ...p,
                              [ent.id]: { percent: ev.target.value, cap: d ? d.cap : (ent.cap_amount ?? "").toString() },
                            }))} />
                          <span className="ml-1 text-stone-400">%</span>
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {ent.basis === "UNLIMITED" ? (
                            <span className="text-stone-300">none</span>
                          ) : (
                            <input
                              type="number" min="0" step="10" disabled={!canEdit}
                              className={cellInput}
                              value={d ? d.cap : (ent.cap_amount ?? "")}
                              onChange={ev => setDraft(p => ({
                                ...p,
                                [ent.id]: { percent: d ? d.percent : String(ent.percent_covered), cap: ev.target.value },
                              }))} />
                          )}
                        </td>
                        <td className="px-4 py-1.5 text-[11px] text-stone-400">{ent.source ?? "—"}</td>
                        <td className="px-2 py-1.5 text-right">
                          {canEdit && dirty && (
                            <button onClick={() => saveEntitlement(ent)} disabled={saving === ent.id}
                              className="inline-flex items-center gap-1 rounded-lg bg-[#4a6da7] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#3d5a8f] disabled:opacity-40">
                              {saving === ent.id ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        </div>
        <CardBody className="pt-3">
          <p className="text-[11px] leading-relaxed text-stone-400">
            <strong className="text-stone-500">Covered</strong> is how much of a bill the church
            meets; <strong className="text-stone-500">Ceiling</strong> is the most it will pay.
            The two are separate because the Terms use both together — specialist out-patient is
            half the bill, to a maximum of RM80. What has been claimed is counted from approved
            and paid vouchers, so changing a ceiling never rewrites what somebody has already spent.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
