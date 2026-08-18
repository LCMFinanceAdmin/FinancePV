// Run in Supabase SQL Editor: ALTER TABLE payroll_statutory_rates ADD COLUMN IF NOT EXISTS gazette_url TEXT;

"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Percent, Save, Plus, Upload, FileText, ExternalLink, Sparkles, X, CheckCheck, Table2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { UserProfile, PayrollStatutoryRates } from "@/lib/types";
import type { ContributionBand } from "@/lib/payroll/calc";

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
  // Employee only: SKBBK tops up their SOCSO contribution and the employer
  // pays no part of it, so there is no second field to fill in here.
  { key: "skbbk_ee", label: "SKBBK (Lindung 24) — employee", group: "SKBBK" },
];
const CEIL_FIELDS: { key: keyof PayrollStatutoryRates; label: string }[] = [
  { key: "socso_ceiling", label: "SOCSO wage ceiling (RM)" },
  { key: "eis_ceiling", label: "EIS wage ceiling (RM)" },
  { key: "skbbk_ceiling", label: "SKBBK wage ceiling (RM)" },
];

type ExtractedRates = Record<string, number | string | null>;

export default function PayrollRatesPage() {
  const supabase = createClient();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [row, setRow] = useState<PayrollStatutoryRates | null>(null);
  const [bands, setBands] = useState<ContributionBand[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  // Gazette upload state
  const [gazetteUrl, setGazetteUrl] = useState<string>("");
  const [gazetteFile, setGazetteFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [suggestions, setSuggestions] = useState<ExtractedRates | null>(null);
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
    const [{ data }, { data: bandRows }] = await Promise.all([
      supabase.from("payroll_statutory_rates").select("*").eq("year", year).maybeSingle(),
      supabase.from("payroll_contribution_bands").select("*").eq("year", year).order("wage_from"),
    ]);
    const r = (data as PayrollStatutoryRates) ?? null;
    setRow(r);
    setBands((bandRows as ContributionBand[]) ?? []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setGazetteUrl((r as any)?.gazette_url ?? "");
    setGazetteFile(null);
    setSuggestions(null);
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
      setUploading(false);

      // AI extraction
      setExtracting(true);
      setToast("Gazette uploaded — analysing with AI…");
      try {
        const { data: fnData, error: fnErr } = await supabase.functions.invoke(
          "extract-gazette-rates",
          { body: { gazette_url: publicUrl } }
        );
        if (fnErr) throw new Error(fnErr.message);
        if (fnData?.rates) {
          setSuggestions(fnData.rates as ExtractedRates);
          setToast("Rates extracted — review the suggestions below, then click Save Rates");
        } else {
          setToast("Gazette uploaded. Rates could not be extracted automatically — please enter manually.");
        }
      } catch (extractErr) {
        setToast(`Gazette uploaded. Extraction failed: ${extractErr instanceof Error ? extractErr.message : String(extractErr)}`);
      } finally {
        setExtracting(false);
      }
      setTimeout(() => setToast(""), 6000);
    } catch (e: unknown) {
      setToast(e instanceof Error ? e.message : "Upload failed");
      setTimeout(() => setToast(""), 5000);
      setUploading(false);
    }
  }

  function applySuggestions() {
    if (!suggestions || !row) return;
    let updated = { ...row };
    for (const f of PCT_FIELDS) {
      const val = suggestions[f.key];
      if (typeof val === "number" && val !== null) {
        updated = { ...updated, [f.key]: val / 100 };
      }
    }
    for (const f of CEIL_FIELDS) {
      const val = suggestions[f.key];
      if (typeof val === "number" && val !== null) {
        updated = { ...updated, [f.key]: val };
      }
    }
    setRow(updated);
    setSuggestions(null);
    setToast("Suggestions applied — review the rates above, then click Save Rates");
    setTimeout(() => setToast(""), 5000);
  }

  const suggestionCount = suggestions
    ? [...PCT_FIELDS, ...CEIL_FIELDS].filter(f => {
        const v = suggestions[f.key];
        return v !== null && v !== undefined;
      }).length
    : 0;

  const inputCls = "w-28 border-2 border-stone-800 rounded-lg px-2 py-1.5 text-sm text-right font-mono outline-none focus:border-[#2f5b9c] disabled:bg-stone-50 disabled:text-stone-400";

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

      {toast && (
        <div className={`text-sm text-white rounded-lg px-3 py-2 ${
          toast.toLowerCase().includes("fail") || toast.toLowerCase().includes("error")
            ? "bg-red-600"
            : toast.includes("review") || toast.includes("applied") || toast.includes("suggestion")
              ? "bg-amber-600"
              : "bg-green-600"
        }`}>{toast}</div>
      )}

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
          {/* AI Suggestion Banner */}
          {suggestions && suggestionCount > 0 && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-amber-600 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-amber-800">
                      AI found {suggestionCount} rate{suggestionCount !== 1 ? "s" : ""} in the gazette
                    </p>
                    {suggestions.notes && (
                      <p className="text-xs text-amber-700 mt-0.5">{suggestions.notes as string}</p>
                    )}
                  </div>
                </div>
                <button onClick={() => setSuggestions(null)} className="text-amber-400 hover:text-amber-600 shrink-0 mt-0.5">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-1">
                {[...PCT_FIELDS, ...CEIL_FIELDS].map(f => {
                  const rawVal = suggestions[f.key];
                  if (rawVal === null || rawVal === undefined) return null;
                  const isPct = PCT_FIELDS.some(p => p.key === f.key);
                  const currentVal = Number(row[f.key]);
                  const suggestedVal = Number(rawVal);
                  const displayCurrent = isPct
                    ? `${(currentVal * 100).toFixed(2)}%`
                    : `RM ${currentVal.toLocaleString()}`;
                  const displaySuggested = isPct
                    ? `${suggestedVal.toFixed(2)}%`
                    : `RM ${suggestedVal.toLocaleString()}`;
                  const changed = isPct
                    ? Math.abs(currentVal * 100 - suggestedVal) > 0.001
                    : Math.abs(currentVal - suggestedVal) > 0.001;
                  return (
                    <div key={f.key} className={`flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg text-xs ${changed ? "bg-amber-100" : "bg-white/60"}`}>
                      <span className="text-stone-600">{f.label}</span>
                      <span className="font-mono shrink-0">
                        {changed ? (
                          <>
                            <span className="text-stone-400 line-through mr-1.5">{displayCurrent}</span>
                            <span className="text-amber-800 font-bold">{displaySuggested}</span>
                          </>
                        ) : (
                          <span className="text-stone-500">{displayCurrent} (unchanged)</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={applySuggestions}
                  className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-sm font-semibold">
                  <CheckCheck size={15} /> Apply {suggestionCount} Suggestion{suggestionCount !== 1 ? "s" : ""}
                </button>
                <button onClick={() => setSuggestions(null)}
                  className="px-4 py-2 rounded-xl text-sm text-stone-600 border border-stone-200 hover:bg-stone-50">
                  Dismiss
                </button>
              </div>
              <p className="text-[11px] text-amber-700">
                Always verify AI-extracted rates against the original gazette before saving.
              </p>
            </div>
          )}

          <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-5">
            {["EPF", "SOCSO", "EIS", "SKBBK"].map(group => (
              <div key={group}>
                <p className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">{group}</p>
                {/* A rate left at zero deducts nothing. For EPF or SOCSO that
                    would be obvious from the payslips; SKBBK is new and easy to
                    leave unset without anyone noticing for a month or two. */}
                {/* A scheme that began in June is not owed for May. Shown
                    beside the rate because the two are only correct together:
                    the rate alone would reach back to January. */}
                {group === "SKBBK" && (
                  <div className="mb-2 flex items-center justify-between gap-3 rounded-lg bg-stone-50 px-3 py-2">
                    <span className="text-sm text-stone-600">
                      Applies from
                      <span className="block text-[11px] text-stone-400">
                        Earlier months deduct nothing. Recover them with an adjustment on the employee&rsquo;s yearly sheet.
                      </span>
                    </span>
                    <select disabled={!canEdit} className={inputCls}
                      value={Number(row.skbbk_from_month) || 1}
                      onChange={e => setField("skbbk_from_month", Number(e.target.value))}>
                      {["January","February","March","April","May","June",
                        "July","August","September","October","November","December"]
                        .map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                )}
                {group === "SKBBK" && Number(row.skbbk_ee) === 0 && (
                  <p className="mb-2 rounded-lg border-2 border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Not set, so nothing is being deducted for SKBBK (Lindung 24). Enter the rate
                    from the PERKESO contribution schedule. Employees who have left the scheme are
                    excluded individually, on their own record — this rate applies to everyone else.
                  </p>
                )}
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
            {/* Whether the percentages above are being used at all.
                When PERKESO's schedule is loaded for the year it takes over for
                SOCSO, EIS and SKBBK, and the rates become the fallback for wages
                the schedule does not reach. Saying so here matters: otherwise
                somebody edits a percentage, sees no change on any payslip, and
                has no way to find out why. */}
            <div className={`rounded-xl border-2 p-3 ${bands.length
              ? "border-green-300 bg-green-50/60" : "border-stone-200 bg-stone-50"}`}>
              <p className="flex items-center gap-1.5 text-xs font-bold text-stone-700">
                <Table2 size={13} /> PERKESO contribution schedule
              </p>
              {bands.length === 0 ? (
                <p className="mt-1 text-[11px] text-stone-500">
                  Not loaded for {year}. SOCSO, EIS and SKBBK are computed from the percentages above,
                  applied to the actual wage — within a few sen of PERKESO&rsquo;s schedule, but not identical to it.
                </p>
              ) : (
                <>
                  <p className="mt-1 text-[11px] text-stone-600">
                    <span className="font-semibold">{bands.length} bands</span> loaded for {year}, covering
                    RM{Number(bands[0].wage_from).toFixed(0)} upward. SOCSO, EIS and SKBBK come from this
                    table, computed on each band&rsquo;s midpoint — so the figures match what PERKESO&rsquo;s own
                    statement shows. The percentages above apply only to wages below the table.
                  </p>
                  <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-stone-200 bg-white">
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 bg-stone-100 text-stone-600">
                        <tr>
                          <th className="px-2 py-1 text-left font-semibold">Monthly wage</th>
                          <th className="px-2 py-1 text-right font-semibold">SOCSO EE</th>
                          <th className="px-2 py-1 text-right font-semibold">SOCSO ER</th>
                          <th className="px-2 py-1 text-right font-semibold">SKBBK</th>
                          <th className="px-2 py-1 text-right font-semibold">EIS ea.</th>
                        </tr>
                      </thead>
                      <tbody className="font-mono">
                        {bands.map(b => (
                          <tr key={b.wage_from} className="odd:bg-stone-50/60">
                            <td className="px-2 py-0.5 font-sans text-stone-600">
                              {b.wage_to === null
                                ? `over ${Number(b.wage_from).toFixed(0)}`
                                : `${Number(b.wage_from).toFixed(0)} – ${Number(b.wage_to).toFixed(0)}`}
                            </td>
                            <td className="px-2 py-0.5 text-right">{Number(b.socso_ee).toFixed(2)}</td>
                            <td className="px-2 py-0.5 text-right">{Number(b.socso_er).toFixed(2)}</td>
                            <td className="px-2 py-0.5 text-right">{Number(b.skbbk).toFixed(2)}</td>
                            <td className="px-2 py-0.5 text-right">{Number(b.eis).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1.5 text-[10.5px] text-stone-500">
                    A band is read as PERKESO writes it — over the lower figure, up to and including the
                    upper. A salary of exactly RM4,200 sits in the band below the one starting at 4,200.
                  </p>
                </>
              )}
            </div>

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

          {/* Gazette Upload with AI extraction */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-stone-700 flex items-center gap-1.5 mb-1">
                <FileText size={15} className="text-[#4a6da7]" />
                <Sparkles size={14} className="text-amber-500" />
                Gazette Upload — AI Rate Extraction
              </h2>
              <p className="text-[12px] text-stone-400">
                Upload the latest KWSP / PERKESO / SIP gazette. AI will read it and suggest the updated rates for your review.
              </p>
            </div>

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

            {canEdit && (
              <div className="space-y-2">
                <label className="flex flex-col items-center gap-2 px-4 py-5 border-2 border-dashed border-stone-200 rounded-xl cursor-pointer hover:border-amber-400/60 hover:bg-amber-50/40 transition-colors"
                  onClick={() => fileInputRef.current?.click()}>
                  <Upload size={20} className="text-stone-400" />
                  <span className="text-sm text-stone-500">
                    {gazetteFile ? gazetteFile.name : (gazetteUrl ? "Click to replace gazette file…" : "Click to select gazette PDF or image…")}
                  </span>
                  <span className="text-[11px] text-stone-400">PDF or image (JPG, PNG) · AI will extract EPF / SOCSO / EIS rates</span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={e => setGazetteFile(e.target.files?.[0] ?? null)}
                />
                {gazetteFile && (
                  <button onClick={uploadGazette} disabled={uploading || extracting}
                    className="w-full flex items-center justify-center gap-1.5 bg-[#4a6da7] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-[#3d5c8f] disabled:opacity-50">
                    {uploading ? (
                      <><Upload size={14} /> Uploading…</>
                    ) : extracting ? (
                      <><Sparkles size={14} className="animate-pulse" /> Analysing gazette with AI…</>
                    ) : (
                      <><Upload size={14} className="shrink-0" /> Upload &amp; Extract — &ldquo;{gazetteFile.name}&rdquo;</>
                    )}
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
