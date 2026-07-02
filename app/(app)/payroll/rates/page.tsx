// Run in Supabase SQL Editor: ALTER TABLE payroll_statutory_rates ADD COLUMN IF NOT EXISTS gazette_url TEXT;

"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Percent, Save, Plus, Upload, FileText, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { UserProfile, PayrollStatutoryRates } from "@/lib/types";

// Fields shown as percentages (stored as fractions) vs plain RM ceilings.
const PCT_FIELDS: { key: keyof PayrollStatutoryRates; label: string; group: string }[] = [
  { key: "epf_ee_under60", label: "EPF Employee — under 60", group: "EPF" },
  { key: "epf_er_under60", label: "EPF Employer — under 60 (13% + 3%)", group: "EPF" },
  { key: "epf_ee_over60", label: "EPF Employee — 60+ / contract", group: "EPF" },
  { key: "epf_er_over60", label: "EPF Employer — 60+ / contract (4% + 3%)", group: "EPF" },
  { key: "epf_ee_orang_asli", label: "EPF Employee — Orang Asli", group: "EPF" },
  { key: "epf_er_orang_asli", label: "EPF Employer — Orang Asli", group: "EPF" },
  { key: "socso_ee", label: "SOCSO Employee", group: "SOCSO" },
  { key: "socso_er", label: "SOCSO Employer", group: "SOCSO" },
  { key: "socso_er_over60", label: "SOCSO Employer — 60+ (injury only)", group: "SOCSO" },
  { key: "eis_rate", label: "EIS — each side", group: "EIS" },
];
const CEIL_FIELDS: { key: keyof PayrollStatutoryRates; label: string }[] = [
  { key: "socso_ceiling", label: "SOCSO wage ceiling (RM)" },
  { key: "eis_ceiling", label: "EIS wage ceiling (RM)" },
];

export default function PayrollRatesPage() {
  const supabase = createClient();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [row, setRow] = useState<PayrollStatutoryRates | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  // Gazette upload state
  const [gazetteUrl, setGazetteUrl] = useState<string>("");
  const [gazetteFile, setGazetteFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const loadRow = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("payroll_statutory_rates").select("*").eq("year", year).maybeSingle();
    const r = (data as PayrollStatutoryRates) ?? null;
    setRow(r);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setGazetteUrl((r as any)?.gazette_url ?? "");
    setGazetteFile(null);
    setLoading(false);
  }, [supabase, year]);

  useEffect(() => { loadUser(); }, []);
  useEffect(() => { loadRow(); }, [loadRow]);

  const canEdit = user?.isFinanceAdmin;

  function setField(key: keyof PayrollStatutoryRates, value: number) {
    setRow(r => r ? { ...r, [key]: value } : r);
  }

  async function createYear() {
    setSaving(true);
    const { error } = await supabase.from("payroll_statutory_rates").insert({ year });
    setSaving(false);
    if (error) { setToast(error.message); return; }
    loadRow();
  }

  async function save() {
    if (!row || !user) return;
    setSaving(true);
    const { year: _y, updated_at: _u, updated_by: _b, ...fields } = row;
    void _y; void _u; void _b;
    const { error } = await supabase.from("payroll_statutory_rates")
      .update({ ...fields, updated_by: user.email, updated_at: new Date().toISOString() }).eq("year", year);
    setSaving(false);
    setToast(error ? error.message : "Rates saved");
    setTimeout(() => setToast(""), 3000);
  }

  async function uploadGazette() {
    if (!gazetteFile) return;
    setUploading(true);
    try {
      const ext = gazetteFile.name.split(".").pop() ?? "pdf";
      const path = `${year}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("payroll-gazettes")
        .upload(path, gazetteFile, { upsert: true });
      if (upErr) throw new Error(upErr.message);

      const { data: urlData } = supabase.storage.from("payroll-gazettes").getPublicUrl(path);
      const publicUrl = urlData.publicUrl;

      const { error: dbErr } = await supabase.from("payroll_statutory_rates")
        .update({ gazette_url: publicUrl } as Partial<PayrollStatutoryRates>)
        .eq("year", year);
      if (dbErr) throw new Error(dbErr.message);

      setGazetteUrl(publicUrl);
      setGazetteFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setToast("Gazette uploaded successfully");
      setTimeout(() => setToast(""), 3000);
    } catch (e: unknown) {
      setToast(e instanceof Error ? e.message : "Upload failed");
      setTimeout(() => setToast(""), 5000);
    } finally {
      setUploading(false);
    }
  }

  const inputCls = "w-28 border border-stone-300 rounded-lg px-2 py-1.5 text-sm text-right font-mono outline-none focus:border-[#4a6da7] disabled:bg-stone-50 disabled:text-stone-400";

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <Link href="/payroll" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700">
        <ArrowLeft size={15} /> Back to Payroll
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-800 flex items-center gap-2"><Percent size={20} className="text-[#4a6da7]" /> Statutory Rates</h1>
          <p className="text-sm text-stone-500 mt-0.5">EPF / SOCSO / EIS rates per year — update when government policy changes</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setYear(y => y - 1)} className="px-2 py-1 text-sm rounded-lg border border-stone-200 hover:bg-stone-50">‹</button>
          <span className="text-base font-semibold text-stone-700 w-14 text-center">{year}</span>
          <button onClick={() => setYear(y => y + 1)} className="px-2 py-1 text-sm rounded-lg border border-stone-200 hover:bg-stone-50">›</button>
        </div>
      </div>

      {toast && <div className={`text-sm text-white rounded-lg px-3 py-2 ${toast.includes("failed") || toast.includes("error") ? "bg-red-600" : "bg-green-600"}`}>{toast}</div>}

      {loading ? (
        <div className="text-center py-16 text-stone-400 text-sm">Loading…</div>
      ) : !row ? (
        <div className="text-center py-16 bg-white border border-stone-200 rounded-2xl">
          <p className="text-sm text-stone-500 mb-3">No rate table for {year} yet.</p>
          {canEdit && (
            <button onClick={createYear} disabled={saving}
              className="inline-flex items-center gap-1.5 bg-[#4a6da7] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#3d5c8f] disabled:opacity-50">
              <Plus size={15} /> Create {year} rates (from defaults)
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-5">
            {["EPF", "SOCSO", "EIS"].map(group => (
              <div key={group}>
                <p className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">{group}</p>
                <div className="space-y-1.5">
                  {PCT_FIELDS.filter(f => f.group === group).map(f => (
                    <div key={f.key} className="flex items-center justify-between gap-3">
                      <span className="text-sm text-stone-600">{f.label}</span>
                      <div className="flex items-center gap-1">
                        <input type="number" step="0.01" disabled={!canEdit} className={inputCls}
                          value={(Number(row[f.key]) * 100).toString()}
                          onChange={e => setField(f.key, (parseFloat(e.target.value) || 0) / 100)} />
                        <span className="text-xs text-stone-400 w-3">%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">Wage Ceilings</p>
              <div className="space-y-1.5">
                {CEIL_FIELDS.map(f => (
                  <div key={f.key} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-stone-600">{f.label}</span>
                    <input type="number" disabled={!canEdit} className={inputCls}
                      value={Number(row[f.key]).toString()}
                      onChange={e => setField(f.key, parseFloat(e.target.value) || 0)} />
                  </div>
                ))}
              </div>
            </div>

            {canEdit && (
              <button onClick={save} disabled={saving}
                className="w-full flex items-center justify-center gap-1.5 bg-[#4a6da7] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-[#3d5c8f] disabled:opacity-50">
                <Save size={15} /> {saving ? "Saving…" : "Save Rates"}
              </button>
            )}
            {row.updated_at && <p className="text-[11px] text-stone-400 text-center">Last updated {new Date(row.updated_at).toLocaleString("en-MY")}{row.updated_by ? ` by ${row.updated_by}` : ""}</p>}
          </div>

          {/* Reference Documents / Gazette Upload */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-stone-700 flex items-center gap-1.5 mb-1">
                <FileText size={15} className="text-[#4a6da7]" /> Reference Documents
              </h2>
              <p className="text-[12px] text-stone-400">
                Upload the latest Jabatan Buruh or KWSP gazette PDF. Rates above still need to be entered manually based on the applicable salary brackets.
              </p>
            </div>

            {/* Existing gazette link */}
            {gazetteUrl && (
              <div className="flex items-center gap-3 px-3 py-2 bg-stone-50 rounded-lg border border-stone-200">
                <FileText size={16} className="text-[#4a6da7] shrink-0" />
                <a href={gazetteUrl} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-[#4a6da7] hover:underline flex items-center gap-1 flex-1 truncate">
                  View current gazette <ExternalLink size={12} />
                </a>
                {canEdit && (
                  <button onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-stone-500 hover:text-stone-700 border border-stone-200 rounded-lg px-2 py-1 hover:bg-stone-100 shrink-0">
                    Replace
                  </button>
                )}
              </div>
            )}

            {/* Upload area (shown when no gazette yet, or always for replace) */}
            {canEdit && (
              <div className="space-y-2">
                <label className="flex flex-col items-center gap-2 px-4 py-5 border-2 border-dashed border-stone-200 rounded-xl cursor-pointer hover:border-[#4a6da7]/50 hover:bg-stone-50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}>
                  <Upload size={20} className="text-stone-400" />
                  <span className="text-sm text-stone-500">
                    {gazetteFile ? gazetteFile.name : (gazetteUrl ? "Click to replace gazette file…" : "Click to select gazette PDF or image…")}
                  </span>
                  <span className="text-[11px] text-stone-400">PDF or image (JPG, PNG)</span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={e => setGazetteFile(e.target.files?.[0] ?? null)}
                />
                {gazetteFile && (
                  <button onClick={uploadGazette} disabled={uploading}
                    className="w-full flex items-center justify-center gap-1.5 bg-[#4a6da7] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-[#3d5c8f] disabled:opacity-50">
                    <Upload size={14} /> {uploading ? "Uploading…" : `Upload "${gazetteFile.name}"`}
                  </button>
                )}
              </div>
            )}

            {!gazetteUrl && !canEdit && (
              <p className="text-sm text-stone-400 italic">No gazette document uploaded for {year}.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
