"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, getLOATier } from "@/lib/utils";
import { Plus, Trash2, Info, ChevronDown } from "lucide-react";
import { loadBudgetProjects } from "@/lib/budget-utils";
import type { PVLineItem } from "@/lib/types";

// ── Ministry list (hardcoded per LCM structure) ────────────────────────
const MINISTRIES = [
  "Mission",
  "Social Concern",
  "Education",
  "Stewardship",
  "Orang Asli",
  "Property",
  "Head Quarters (HQ)",
  "Reconcile",
  "Trustees",
  "Sisters and Women Fellowship (SWF)",
  "Young Adult and Youth (YAY)",
];

const PAYMENT_METHODS = ["Online Transfer", "Cheque", "Cash", "JomPay", "Auto Debit"];
const BANKS = [
  "Maybank", "CIMB", "Public Bank", "RHB", "Hong Leong Bank",
  "AmBank", "Bank Islam", "Bank Rakyat", "OCBC", "Standard Chartered",
  "Affin Bank", "Alliance Bank", "UOB", "BSN",
];

// Roles that can manage projects
const PROJECT_MANAGER_ROLES = [
  "FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3",
  "GENERAL_MANAGER", "TREASURER", "BISHOP", "SECRETARY", "MINISTRY_HEAD",
];

interface FormData {
  applicant_name: string;
  applicant_email: string;
  dept: string;
  pvDate: string;
  payee_name: string;
  payment_method: string;
  payee_bank_name: string;
  payee_bank_acct: string;
  cheque_no: string;
  biller_code: string;
  ref_no: string;
  ministry: string;
  project: string;
  purpose: string;
  line_items: PVLineItem[];
  sig_applicant_name: string;
  sig_applicant_confirm: boolean;
}

const EMPTY_FORM: FormData = {
  applicant_name: "", applicant_email: "", dept: "",
  pvDate: new Date().toISOString().slice(0, 10),
  payee_name: "", payment_method: "Online Transfer",
  payee_bank_name: "", payee_bank_acct: "",
  cheque_no: "", biller_code: "", ref_no: "",
  ministry: "", project: "", purpose: "",
  line_items: [{ description: "", amount: 0, date: "" }],
  sig_applicant_name: "", sig_applicant_confirm: false,
};

// ── Inline field styled as a document underline ──────────────────────
const uline = "border-0 border-b border-stone-400 bg-transparent outline-none text-sm text-stone-800 px-1 py-0 w-full focus:border-[#4a6da7] transition-colors placeholder:text-stone-300";
const uselect = `${uline} cursor-pointer appearance-none pr-6`;

function InlineSelect({ value, onChange, children, className = "" }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`relative flex-1 ${className}`}>
      <select value={value} onChange={e => onChange(e.target.value)} className={uselect}>
        {children}
      </select>
      <ChevronDown size={12} className="absolute right-0 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
    </div>
  );
}

function Row({ label, sublabel, children }: { label: string; sublabel?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-end gap-3 py-1.5 border-b border-stone-100 last:border-0">
      <div className="shrink-0 min-w-[200px]">
        <span className="text-sm font-semibold text-stone-700">{label}</span>
        {sublabel && <div className="text-xs text-stone-400">{sublabel}</div>}
      </div>
      <div className="flex-1 flex items-end gap-2">{children}</div>
    </div>
  );
}

// ── Luther Rose inline SVG (always renders, no external dependency) ───
function LutherRose({ size = 64 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width={size} height={size}>
      <circle cx="100" cy="100" r="98" fill="#F5C400"/>
      <circle cx="100" cy="100" r="81" fill="#3D5FA0"/>
      <ellipse cx="100" cy="55" rx="29" ry="40" fill="white" stroke="#e0e0e0" strokeWidth="0.4" transform="rotate(0 100 100)"/>
      <ellipse cx="100" cy="55" rx="29" ry="40" fill="white" stroke="#e0e0e0" strokeWidth="0.4" transform="rotate(72 100 100)"/>
      <ellipse cx="100" cy="55" rx="29" ry="40" fill="white" stroke="#e0e0e0" strokeWidth="0.4" transform="rotate(144 100 100)"/>
      <ellipse cx="100" cy="55" rx="29" ry="40" fill="white" stroke="#e0e0e0" strokeWidth="0.4" transform="rotate(216 100 100)"/>
      <ellipse cx="100" cy="55" rx="29" ry="40" fill="white" stroke="#e0e0e0" strokeWidth="0.4" transform="rotate(288 100 100)"/>
      <ellipse cx="100" cy="37" rx="10" ry="19" fill="#3B6B35" transform="rotate(36 100 100)"/>
      <ellipse cx="100" cy="37" rx="10" ry="19" fill="#3B6B35" transform="rotate(108 100 100)"/>
      <ellipse cx="100" cy="37" rx="10" ry="19" fill="#3B6B35" transform="rotate(180 100 100)"/>
      <ellipse cx="100" cy="37" rx="10" ry="19" fill="#3B6B35" transform="rotate(252 100 100)"/>
      <ellipse cx="100" cy="37" rx="10" ry="19" fill="#3B6B35" transform="rotate(324 100 100)"/>
      <g stroke="#666" strokeWidth="0.45">
        {[0,12,24,36,48,60,72,84,96,108,120,132,144,156,168,180,192,204,216,228,240,252,264,276,288,300,312,324,336,348].map(a => (
          <line key={a} x1="100" y1="72" x2="100" y2="22" transform={`rotate(${a} 100 100)`}/>
        ))}
      </g>
      <circle cx="100" cy="100" r="29" fill="white"/>
      <path d="M 100 118 C 82 108, 71 91, 77 79 C 81 70, 92 70, 100 80 C 108 70, 119 70, 123 79 C 129 91, 118 108, 100 118 Z" fill="#CC1515"/>
      <rect x="96" y="77" width="8" height="34" fill="#111111" rx="0.5"/>
      <rect x="84" y="88" width="32" height="8" fill="#111111" rx="0.5"/>
    </svg>
  );
}

export default function SubmitPVPage() {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [userRole, setUserRole] = useState("");
  const [projects, setProjects] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("user_roles").select("full_name,role").eq("email", user.email).single().then(({ data: profile }) => {
        setUserRole(profile?.role ?? "");
        setForm(f => ({
          ...f,
          applicant_email: user.email ?? "",
          applicant_name: profile?.full_name || user.user_metadata?.full_name || "",
          sig_applicant_name: profile?.full_name || user.user_metadata?.full_name || "",
        }));
      });
    });
  }, []);

  // Load projects when ministry changes
  useEffect(() => {
    if (!form.ministry) { setProjects([]); return; }
    loadBudgetProjects(supabase, form.ministry)
      .then((projectNames) => setProjects(projectNames));
  }, [form.ministry]);

  const totalFromItems = form.line_items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const displayAmount = totalFromItems;
  const loa = getLOATier(displayAmount, "GENERAL");
  const canManageProjects = PROJECT_MANAGER_ROLES.includes(userRole);

  function setField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  function updateLineItem(idx: number, field: keyof PVLineItem, value: string | number) {
    const items = form.line_items.map((item, i) =>
      i === idx ? { ...item, [field]: field === "amount" ? Number(value) : value } : item
    );
    setForm(f => ({ ...f, line_items: items }));
  }

  function addLineItem() {
    setForm(f => ({ ...f, line_items: [...f.line_items, { description: "", amount: 0, date: "" }] }));
  }

  function removeLineItem(idx: number) {
    const items = form.line_items.filter((_, i) => i !== idx);
    setForm(f => ({ ...f, line_items: items.length ? items : [{ description: "", amount: 0, date: "" }] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!form.sig_applicant_confirm) { setError("Please confirm the declaration before submitting."); return; }
    if (!form.payee_name.trim()) { setError("Please enter the payee name."); return; }
    if (!form.purpose.trim()) { setError("Please enter the purpose of payment."); return; }
    if (displayAmount <= 0) { setError("Please enter at least one line item with an amount."); return; }
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/submit-pv`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          applicant_name: form.applicant_name,
          applicant_email: form.applicant_email,
          pvDate: form.pvDate,
          dept: form.dept,
          ministry: form.ministry,
          project: form.project,
          payee_name: form.payee_name,
          payment_method: form.payment_method,
          payee_bank_name: form.payee_bank_name,
          payee_bank_acct: form.payee_bank_acct,
          cheque_no: form.cheque_no,
          biller_code: form.biller_code,
          ref_no: form.ref_no,
          purpose: form.purpose,
          amount: displayAmount,
          line_items: form.line_items.filter(i => i.description || i.amount),
          payment_type: "GENERAL",
          sig_applicant_name: form.sig_applicant_name,
          sig_applicant_confirm: form.sig_applicant_confirm,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Submission failed");
      setSuccess(`PV ${result.pv_no} submitted successfully!`);
      setForm(EMPTY_FORM);
      setTimeout(() => router.push("/my-pvs"), 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  const isCheque = form.payment_method === "Cheque";
  const isJomPay = form.payment_method === "JomPay";
  const isCash = form.payment_method === "Cash";
  const isTransfer = !isCheque && !isJomPay && !isCash;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-stone-800">Submit Payment Voucher</h1>
        <p className="text-xs text-stone-400 mt-0.5">Fill in all required fields and submit for Finance review</p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* ── DOCUMENT PAPER ─────────────────────────────────────────── */}
        <div className="bg-white border border-stone-300 shadow-md rounded-sm print:shadow-none">

          {/* Header */}
          <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b-2 border-stone-800">
            <div className="flex items-center gap-3">
              <LutherRose size={70} />
              <div className="hidden sm:block">
                <div className="text-[10px] font-bold text-stone-600 uppercase tracking-wide">Lutheran Church in Malaysia</div>
                <div className="text-[9px] text-stone-400">马来西亚基督教信义会</div>
              </div>
            </div>
            <div className="text-right">
              <table className="border border-stone-800 text-xs">
                <tbody>
                  <tr>
                    <td className="border border-stone-800 px-2 py-1 font-bold bg-stone-50" colSpan={2}>For Office Use Only:</td>
                  </tr>
                  <tr>
                    <td className="border border-stone-800 px-2 py-1 text-stone-600 whitespace-nowrap">Ref No:</td>
                    <td className="border border-stone-800 px-2 py-1 text-stone-400 italic">(auto-generated)</td>
                  </tr>
                  <tr>
                    <td className="border border-stone-800 px-2 py-1 text-stone-600">A/C Code:</td>
                    <td className="border border-stone-800 px-2 py-1 min-w-[90px]" />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Bilingual title */}
          <div className="text-center py-3 border-b-2 border-stone-800 px-4">
            <p className="text-xs font-bold uppercase tracking-wide leading-relaxed">
              LUTHERAN CHURCH IN MALAYSIA (REIMBURSEMENT CLAIM FORM / PAYMENT VOUCHER)
            </p>
            <p className="text-xs font-bold mt-0.5">
              马来西亚基督教信义会（费用报销 / 付款凭证表格）
            </p>
          </div>

          {/* ── MAIN FORM FIELDS ──────────────────────────────────────── */}
          <div className="px-6 py-4 space-y-0">

            <Row label="Applicant 申请者" sublabel="Full name of submitter">
              <input className={uline} value={form.applicant_name}
                onChange={e => setField("applicant_name", e.target.value)}
                placeholder="Your full name" required />
              <div className="shrink-0 flex items-end gap-2 whitespace-nowrap">
                <span className="text-sm font-semibold text-stone-700">Date 日期:</span>
                <input type="date" className={`${uline} w-36`} value={form.pvDate}
                  onChange={e => setField("pvDate", e.target.value)} required />
              </div>
            </Row>

            <Row label="Email 电邮">
              <input className={uline} type="email" value={form.applicant_email}
                onChange={e => setField("applicant_email", e.target.value)}
                placeholder="applicant@lcm.org.my" required />
            </Row>

            <Row label="Payable to 付给" sublabel="Person or company to be paid">
              <input className={uline} value={form.payee_name}
                onChange={e => setField("payee_name", e.target.value)}
                placeholder="Full name / company name" required />
            </Row>

            <Row label="Payment Method 付款方式">
              <InlineSelect value={form.payment_method} onChange={v => setField("payment_method", v)}>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </InlineSelect>
            </Row>

            {isTransfer && (
              <Row label="Payee Bank A/C No 收款人账户号码">
                <InlineSelect value={form.payee_bank_name} onChange={v => setField("payee_bank_name", v)} className="max-w-[180px]">
                  <option value="">— Select bank —</option>
                  {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                </InlineSelect>
                <span className="text-stone-400 text-xs shrink-0">A/C:</span>
                <input className={`${uline} flex-1`} value={form.payee_bank_acct}
                  onChange={e => setField("payee_bank_acct", e.target.value)}
                  placeholder="Account number" required={isTransfer} />
              </Row>
            )}
            {isCheque && (
              <Row label="Cheque No. 支票号码">
                <input className={uline} value={form.cheque_no}
                  onChange={e => setField("cheque_no", e.target.value)} placeholder="Cheque number" />
              </Row>
            )}
            {isJomPay && (
              <Row label="Biller Code 账单代码">
                <input className={uline} value={form.biller_code}
                  onChange={e => setField("biller_code", e.target.value)} placeholder="JomPay biller code" />
              </Row>
            )}

            <Row label="Ministry 事工" sublabel="Select ministry / department">
              <InlineSelect value={form.ministry} onChange={v => { setField("ministry", v); setField("project", ""); }}>
                <option value="">— Select ministry —</option>
                {MINISTRIES.map(m => <option key={m} value={m}>{m}</option>)}
              </InlineSelect>
            </Row>

            {/* Project dropdown — loads from budget_items per ministry */}
            <Row label="Project 计划" sublabel="Sub-project or budget code">
              {form.ministry ? (
                projects.length > 0 ? (
                  <div className="flex-1 flex items-end gap-2">
                    <InlineSelect value={form.project} onChange={v => setField("project", v)}>
                      <option value="">— Select project (optional) —</option>
                      {projects.map(p => <option key={p} value={p}>{p}</option>)}
                    </InlineSelect>
                    {canManageProjects && (
                      <a href="/control-center/budget" target="_blank"
                        className="shrink-0 text-[10px] text-[#4a6da7] hover:underline whitespace-nowrap">
                        + Manage
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex items-end gap-2">
                    <input className={`${uline} flex-1`} value={form.project}
                      onChange={e => setField("project", e.target.value)}
                      placeholder="No projects set up yet — type or leave blank" />
                    {canManageProjects && (
                      <a href="/control-center?tab=projects" target="_blank"
                        className="shrink-0 text-[10px] text-[#4a6da7] hover:underline whitespace-nowrap">
                        + Add projects
                      </a>
                    )}
                  </div>
                )
              ) : (
                <input className={uline} disabled placeholder="Select ministry first" />
              )}
            </Row>

            <Row label="Purpose 用途" sublabel="Describe what this payment is for">
              <input className={uline} value={form.purpose}
                onChange={e => setField("purpose", e.target.value)}
                placeholder="e.g. Monthly Cost of Living Allowance" required />
            </Row>
          </div>

          {/* ── PARTICULARS TABLE ──────────────────────────────────────── */}
          <div className="px-6 pb-2">
            <p className="text-xs font-semibold text-stone-500 mb-2 mt-1">
              Particulars of Claim / Payment
              <span className="text-stone-400 font-normal ml-1">(Please attach relevant Receipts / Invoices / Bills)</span>
            </p>
            <table className="w-full border-collapse border border-stone-800 text-sm">
              <thead>
                <tr className="bg-stone-50">
                  <th className="border border-stone-800 px-2 py-1.5 text-center text-xs font-bold w-8">#</th>
                  <th className="border border-stone-800 px-2 py-1.5 text-center text-xs font-bold w-28">Date 日期</th>
                  <th className="border border-stone-800 px-2 py-1.5 text-left text-xs font-bold">PARTICULARS 事项</th>
                  <th className="border border-stone-800 px-2 py-1.5 text-right text-xs font-bold w-28">Amount 数目 (RM)</th>
                  <th className="border border-stone-800 w-8 print:hidden" />
                </tr>
              </thead>
              <tbody>
                {form.line_items.map((item, idx) => (
                  <tr key={idx} className="group">
                    <td className="border border-stone-800 px-2 py-1 text-center text-xs text-stone-500">{idx + 1}</td>
                    <td className="border border-stone-800 px-1 py-0.5">
                      <input type="date"
                        className="w-full outline-none text-xs text-stone-600 bg-transparent border-0 py-0.5"
                        value={item.date || form.pvDate}
                        onChange={e => updateLineItem(idx, "date", e.target.value)} />
                    </td>
                    <td className="border border-stone-800 px-1 py-0.5">
                      <input className="w-full outline-none text-sm bg-transparent border-0 py-0.5 placeholder:text-stone-300"
                        placeholder="Description of item / service"
                        value={item.description}
                        onChange={e => updateLineItem(idx, "description", e.target.value)} />
                    </td>
                    <td className="border border-stone-800 px-1 py-0.5">
                      <input type="number" min="0" step="0.01"
                        className="w-full outline-none text-sm text-right bg-transparent border-0 py-0.5 placeholder:text-stone-300"
                        placeholder="0.00"
                        value={item.amount || ""}
                        onChange={e => updateLineItem(idx, "amount", e.target.value)} />
                    </td>
                    <td className="border border-stone-800 px-1 py-0.5 text-center print:hidden">
                      {form.line_items.length > 1 && (
                        <button type="button" onClick={() => removeLineItem(idx)}
                          className="text-stone-300 hover:text-red-400 transition-colors p-0.5">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {Array.from({ length: Math.max(0, 5 - form.line_items.length) }).map((_, i) => (
                  <tr key={`pad-${i}`} className="h-8">
                    <td className="border border-stone-800 px-2 py-1 text-center text-xs text-stone-300">{form.line_items.length + i + 1}</td>
                    <td className="border border-stone-800" />
                    <td className="border border-stone-800" />
                    <td className="border border-stone-800" />
                    <td className="border border-stone-800 print:hidden" />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-stone-50">
                  <td colSpan={3} className="border border-stone-800 px-3 py-1.5 text-right text-sm font-bold">
                    TOTAL AMOUNT 总数额
                  </td>
                  <td className="border border-stone-800 px-2 py-1.5 text-right text-sm font-bold text-stone-800">
                    {displayAmount > 0 ? displayAmount.toFixed(2) : "—"}
                  </td>
                  <td className="border border-stone-800 print:hidden" />
                </tr>
              </tfoot>
            </table>

            <button type="button" onClick={addLineItem}
              className="mt-2 flex items-center gap-1 text-xs text-[#4a6da7] hover:underline print:hidden">
              <Plus size={11} /> Add line item
            </button>
          </div>

          {/* ── LOA INDICATOR ─────────────────────────────────────────── */}
          {displayAmount > 0 && (
            <div className="px-6 pb-3 print:hidden">
              <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                <Info size={13} className="mt-0.5 shrink-0" />
                <span>
                  <strong>Approval required:</strong> {loa.label} — {loa.required} signatory{loa.required > 1 ? "ies" : ""} needed.
                  Total: <strong>{formatCurrency(displayAmount)}</strong>
                </span>
              </div>
            </div>
          )}

          {/* ── DECLARATION ───────────────────────────────────────────── */}
          <div className="px-6 py-4 border-t-2 border-stone-800 space-y-3 print:hidden">
            <p className="text-xs text-stone-500 leading-relaxed">
              I hereby declare that the information provided is true and accurate, and that this payment is for legitimate
              church-related expenses in accordance with LCM&apos;s financial policies.
            </p>
            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">Your Full Name (as signature) <span className="text-red-400">*</span></label>
              <input
                className="w-full border-b border-stone-400 bg-transparent outline-none text-sm px-1 py-1 focus:border-[#4a6da7] transition-colors"
                value={form.sig_applicant_name}
                onChange={e => setField("sig_applicant_name", e.target.value)}
                required />
            </div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" className="mt-0.5 accent-[#4a6da7] w-3.5 h-3.5"
                checked={form.sig_applicant_confirm}
                onChange={e => setField("sig_applicant_confirm", e.target.checked)} />
              <span className="text-xs text-stone-600">I confirm the above declaration and that all details are correct</span>
            </label>
          </div>

        </div>{/* end paper */}

        {error && <div className="mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
        {success && <div className="mt-4 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 font-medium">{success}</div>}

        <button type="submit" disabled={submitting}
          className="mt-4 w-full py-3 bg-[#4a6da7] hover:bg-[#3d5a8e] text-white text-sm font-semibold rounded-xl shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
          {submitting ? "Submitting…" : "Submit Payment Voucher"}
        </button>
      </form>
    </div>
  );
}
