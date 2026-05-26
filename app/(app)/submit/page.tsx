"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, getLOATier } from "@/lib/utils";
import { Plus, Trash2, Info, ChevronDown } from "lucide-react";
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
  is_asset_purchase: boolean;
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
  is_asset_purchase: false,
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

export default function SubmitPVPage() {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("user_roles").select("full_name").eq("email", user.email).single().then(({ data: profile }) => {
        setForm(f => ({
          ...f,
          applicant_email: user.email ?? "",
          applicant_name: profile?.full_name || user.user_metadata?.full_name || "",
          sig_applicant_name: profile?.full_name || user.user_metadata?.full_name || "",
        }));
      });
    });
  }, []);

  const totalFromItems = form.line_items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const displayAmount = totalFromItems;
  const payment_type = form.is_asset_purchase ? "ASSET_PURCHASE" : "GENERAL";
  const loa = getLOATier(displayAmount, payment_type);

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

    if (!form.sig_applicant_confirm) {
      setError("Please confirm the declaration before submitting."); return;
    }
    if (!form.payee_name.trim()) {
      setError("Please enter the payee name."); return;
    }
    if (!form.purpose.trim()) {
      setError("Please enter the purpose of payment."); return;
    }
    if (displayAmount <= 0) {
      setError("Please enter at least one line item with an amount."); return;
    }

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
          payment_type,
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

  // Derived bank description line (for display)
  const isCheque = form.payment_method === "Cheque";
  const isJomPay = form.payment_method === "JomPay";
  const isCash = form.payment_method === "Cash";
  const isTransfer = !isCheque && !isJomPay && !isCash;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">

      {/* Page title (outside document) */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-stone-800">Submit Payment Voucher</h1>
        <p className="text-xs text-stone-400 mt-0.5">Fill in all required fields and submit for Finance review</p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* ── DOCUMENT PAPER ─────────────────────────────────────────── */}
        <div className="bg-white border border-stone-300 shadow-md rounded-sm print:shadow-none">

          {/* Header bar */}
          <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b-2 border-stone-800">
            <div className="flex flex-col">
              <div className="w-16 h-10 bg-stone-100 border border-stone-300 flex items-center justify-center text-[10px] text-stone-400 rounded">
                LCM Logo
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

          {/* ── MAIN FORM FIELDS (document style) ───────────────────── */}
          <div className="px-6 py-4 space-y-0">

            {/* Applicant & Date */}
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

            {/* Email (not on physical form but needed) */}
            <Row label="Email 电邮">
              <input className={uline} type="email" value={form.applicant_email}
                onChange={e => setField("applicant_email", e.target.value)}
                placeholder="applicant@lcm.org.my" required />
            </Row>

            {/* Payee */}
            <Row label="Payable to 付给" sublabel="Person or company to be paid">
              <input className={uline} value={form.payee_name}
                onChange={e => setField("payee_name", e.target.value)}
                placeholder="Full name / company name" required />
            </Row>

            {/* Payment method */}
            <Row label="Payment Method 付款方式">
              <InlineSelect value={form.payment_method} onChange={v => setField("payment_method", v)}>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </InlineSelect>
            </Row>

            {/* Bank / Account — conditional on method */}
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
                  onChange={e => setField("cheque_no", e.target.value)}
                  placeholder="Cheque number" />
              </Row>
            )}
            {isJomPay && (
              <Row label="Biller Code 账单代码">
                <input className={uline} value={form.biller_code}
                  onChange={e => setField("biller_code", e.target.value)}
                  placeholder="JomPay biller code" />
              </Row>
            )}

            {/* Ministry */}
            <Row label="Ministry 事工" sublabel="Select ministry / department">
              <InlineSelect value={form.ministry} onChange={v => { setField("ministry", v); setField("project", ""); }}>
                <option value="">— Select ministry —</option>
                {MINISTRIES.map(m => <option key={m} value={m}>{m}</option>)}
              </InlineSelect>
            </Row>

            {/* Project (sub-topic of Ministry) */}
            <Row label="Project 计划" sublabel="Sub-project or budget code">
              <input className={uline} value={form.project}
                onChange={e => setField("project", e.target.value)}
                placeholder={form.ministry ? `Project under ${form.ministry} (optional)` : "Select ministry first"} />
            </Row>

            {/* Purpose */}
            <Row label="Purpose 用途" sublabel="Describe what this payment is for">
              <input className={uline} value={form.purpose}
                onChange={e => setField("purpose", e.target.value)}
                placeholder="e.g. Monthly Cost of Living Allowance" required />
            </Row>
          </div>

          {/* ── PARTICULARS TABLE ───────────────────────────────────── */}
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
                      <input
                        type="date"
                        className="w-full outline-none text-xs text-stone-600 bg-transparent border-0 py-0.5"
                        value={item.date || form.pvDate}
                        onChange={e => updateLineItem(idx, "date", e.target.value)}
                      />
                    </td>
                    <td className="border border-stone-800 px-1 py-0.5">
                      <input
                        className="w-full outline-none text-sm bg-transparent border-0 py-0.5 placeholder:text-stone-300"
                        placeholder="Description of item / service"
                        value={item.description}
                        onChange={e => updateLineItem(idx, "description", e.target.value)}
                      />
                    </td>
                    <td className="border border-stone-800 px-1 py-0.5">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-full outline-none text-sm text-right bg-transparent border-0 py-0.5 placeholder:text-stone-300"
                        placeholder="0.00"
                        value={item.amount || ""}
                        onChange={e => updateLineItem(idx, "amount", e.target.value)}
                      />
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
                {/* Padding rows to match physical form look */}
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

            {/* Add row button */}
            <button type="button" onClick={addLineItem}
              className="mt-2 flex items-center gap-1 text-xs text-[#4a6da7] hover:underline print:hidden">
              <Plus size={11} /> Add line item
            </button>
          </div>

          {/* ── ASSET PURCHASE + LOA INDICATOR ──────────────────────── */}
          <div className="px-6 pb-4 pt-2 space-y-2 print:hidden">
            <label className="flex items-center gap-2 cursor-pointer w-fit">
              <input type="checkbox" checked={form.is_asset_purchase}
                onChange={e => setField("is_asset_purchase", e.target.checked)}
                className="w-3.5 h-3.5 accent-[#4a6da7]" />
              <span className="text-xs text-stone-600">This is an <strong>Asset Purchase</strong> (affects approval tier)</span>
            </label>

            {displayAmount > 0 && (
              <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                <Info size={13} className="mt-0.5 shrink-0" />
                <span>
                  <strong>Approval required:</strong> {loa.label} — {loa.required} signatory{loa.required > 1 ? "ies" : ""} needed.
                  Total: <strong>{formatCurrency(displayAmount)}</strong>
                </span>
              </div>
            )}
          </div>

          {/* ── DECLARATION ─────────────────────────────────────────── */}
          <div className="px-6 py-4 border-t-2 border-stone-800 space-y-3 print:hidden">
            <p className="text-xs text-stone-500 leading-relaxed">
              I hereby declare that the information provided is true and accurate, and that this payment is for legitimate
              church-related expenses in accordance with LCM&apos;s financial policies.
            </p>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-stone-600 mb-1">Your Full Name (as signature) <span className="text-red-400">*</span></label>
                <input
                  className="w-full border-b border-stone-400 bg-transparent outline-none text-sm px-1 py-1 focus:border-[#4a6da7] transition-colors"
                  value={form.sig_applicant_name}
                  onChange={e => setField("sig_applicant_name", e.target.value)}
                  required
                />
              </div>
            </div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 accent-[#4a6da7] w-3.5 h-3.5"
                checked={form.sig_applicant_confirm}
                onChange={e => setField("sig_applicant_confirm", e.target.checked)}
              />
              <span className="text-xs text-stone-600">I confirm the above declaration and that all details are correct</span>
            </label>
          </div>

        </div>{/* end paper */}

        {/* ── ERROR / SUCCESS ─────────────────────────────────────────── */}
        {error && (
          <div className="mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}
        {success && (
          <div className="mt-4 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 font-medium">{success}</div>
        )}

        {/* ── SUBMIT ──────────────────────────────────────────────────── */}
        <button
          type="submit"
          disabled={submitting}
          className="mt-4 w-full py-3 bg-[#4a6da7] hover:bg-[#3d5a8e] text-white text-sm font-semibold rounded-xl shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? "Submitting…" : "Submit Payment Voucher"}
        </button>

      </form>
    </div>
  );
}
