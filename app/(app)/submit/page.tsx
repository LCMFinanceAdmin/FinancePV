"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { formatCurrency, getLOATier } from "@/lib/utils";
import { Plus, Trash2, Info } from "lucide-react";
import type { Lookup, PVLineItem } from "@/lib/types";

const PAYMENT_METHODS = ["Online Transfer", "Cheque", "Cash", "Bill Payment"];
const BANKS = [
  "Maybank", "CIMB", "Public Bank", "RHB", "Hong Leong Bank",
  "AmBank", "Bank Islam", "Bank Rakyat", "OCBC", "Standard Chartered",
];

interface FormData {
  applicant_name: string;
  applicant_email: string;
  pvDate: string;
  dept: string;
  ministry: string;
  project: string;
  payee_name: string;
  payment_method: string;
  payee_bank_name: string;
  payee_bank_acct: string;
  cheque_no: string;
  biller_code: string;
  ref_no: string;
  purpose: string;
  amount: string;
  line_items: PVLineItem[];
  payment_type: "GENERAL" | "ASSET_PURCHASE";
  sig_applicant_name: string;
  sig_applicant_confirm: boolean;
}

const EMPTY_FORM: FormData = {
  applicant_name: "", applicant_email: "", pvDate: new Date().toISOString().slice(0, 10),
  dept: "", ministry: "", project: "",
  payee_name: "", payment_method: "Online Transfer",
  payee_bank_name: "", payee_bank_acct: "",
  cheque_no: "", biller_code: "", ref_no: "",
  purpose: "", amount: "", line_items: [{ description: "", amount: 0 }],
  payment_type: "GENERAL",
  sig_applicant_name: "", sig_applicant_confirm: false,
};

export default function SubmitPVPage() {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [lookups, setLookups] = useState<Lookup>({ ministries: [], departments: [], projects: [], ministry_heads: [] });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Pre-fill user details
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setForm((f) => ({
          ...f,
          applicant_email: user.email ?? "",
          applicant_name: user.user_metadata?.full_name ?? "",
          sig_applicant_name: user.user_metadata?.full_name ?? "",
        }));
      }
    });
    // Load lookups
    supabase.from("departments").select("name,head_email,head_name").then(({ data }) => {
      const depts = (data ?? []).map((d: { name: string }) => d.name);
      supabase.from("ministries").select("name").then(({ data: mins }) => {
        supabase.from("ministry_heads").select("ministry,email,name").then(({ data: mh }) => {
          setLookups({
            departments: depts,
            ministries: (mins ?? []).map((m: { name: string }) => m.name),
            projects: [],
            ministry_heads: mh ?? [],
          });
        });
      });
    });
  }, []);

  const totalFromItems = form.line_items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const displayAmount = totalFromItems > 0 ? totalFromItems : Number(form.amount) || 0;
  const loa = getLOATier(displayAmount, form.payment_type);

  function setField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function updateLineItem(idx: number, field: keyof PVLineItem, value: string | number) {
    const items = form.line_items.map((item, i) =>
      i === idx ? { ...item, [field]: field === "amount" ? Number(value) : value } : item
    );
    setForm((f) => ({ ...f, line_items: items, amount: String(items.reduce((s, i) => s + (i.amount || 0), 0)) }));
  }

  function addLineItem() {
    setForm((f) => ({ ...f, line_items: [...f.line_items, { description: "", amount: 0 }] }));
  }

  function removeLineItem(idx: number) {
    const items = form.line_items.filter((_, i) => i !== idx);
    setForm((f) => ({ ...f, line_items: items.length ? items : [{ description: "", amount: 0 }], amount: String(items.reduce((s, i) => s + (i.amount || 0), 0)) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSuccess("");

    if (!form.sig_applicant_confirm) {
      setError("Please confirm the declaration before submitting."); return;
    }
    if (!form.payee_name || !form.purpose || displayAmount <= 0) {
      setError("Please fill in payee name, purpose, and amount."); return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Call submit-pv Edge Function
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/submit-pv`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          ...form,
          amount: displayAmount,
          line_items: form.line_items.filter((i) => i.description || i.amount),
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

  return (
    <div className="p-5 max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-stone-800">Submit Payment Voucher</h1>
        <p className="text-sm text-stone-400">Fill in all required fields and confirm before submitting</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Applicant */}
        <Card>
          <div className="px-5 py-3 border-b border-stone-100 text-sm font-semibold text-stone-600">Applicant Details</div>
          <CardBody className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Full Name" required>
                <input className={input} value={form.applicant_name} onChange={(e) => setField("applicant_name", e.target.value)} required />
              </Field>
              <Field label="Email" required>
                <input className={input} type="email" value={form.applicant_email} onChange={(e) => setField("applicant_email", e.target.value)} required />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Department">
                <select className={input} value={form.dept} onChange={(e) => setField("dept", e.target.value)}>
                  <option value="">— Select —</option>
                  {lookups.departments.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="Ministry">
                <select className={input} value={form.ministry} onChange={(e) => setField("ministry", e.target.value)}>
                  <option value="">— Select —</option>
                  {lookups.ministries.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Project / Budget Code">
                <input className={input} value={form.project} onChange={(e) => setField("project", e.target.value)} placeholder="Optional" />
              </Field>
              <Field label="PV Date" required>
                <input className={input} type="date" value={form.pvDate} onChange={(e) => setField("pvDate", e.target.value)} required />
              </Field>
            </div>
          </CardBody>
        </Card>

        {/* Payee */}
        <Card>
          <div className="px-5 py-3 border-b border-stone-100 text-sm font-semibold text-stone-600">Payee & Payment Details</div>
          <CardBody className="space-y-3">
            <Field label="Payee Name" required>
              <input className={input} value={form.payee_name} onChange={(e) => setField("payee_name", e.target.value)} required placeholder="Name of person / company to be paid" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Payment Method" required>
                <select className={input} value={form.payment_method} onChange={(e) => setField("payment_method", e.target.value)}>
                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              {form.payment_method === "Online Transfer" && (
                <Field label="Bank" required>
                  <select className={input} value={form.payee_bank_name} onChange={(e) => setField("payee_bank_name", e.target.value)} required>
                    <option value="">— Select bank —</option>
                    {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </Field>
              )}
              {form.payment_method === "Cheque" && (
                <Field label="Cheque No.">
                  <input className={input} value={form.cheque_no} onChange={(e) => setField("cheque_no", e.target.value)} />
                </Field>
              )}
              {form.payment_method === "Bill Payment" && (
                <Field label="Biller Code">
                  <input className={input} value={form.biller_code} onChange={(e) => setField("biller_code", e.target.value)} />
                </Field>
              )}
            </div>
            {form.payment_method === "Online Transfer" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Account No." required>
                  <input className={input} value={form.payee_bank_acct} onChange={(e) => setField("payee_bank_acct", e.target.value)} required />
                </Field>
                <Field label="Reference No.">
                  <input className={input} value={form.ref_no} onChange={(e) => setField("ref_no", e.target.value)} placeholder="Optional" />
                </Field>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Purpose & Items */}
        <Card>
          <div className="px-5 py-3 border-b border-stone-100 text-sm font-semibold text-stone-600">Purpose & Amount</div>
          <CardBody className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Payment Type">
                <select className={input} value={form.payment_type} onChange={(e) => setField("payment_type", e.target.value as "GENERAL" | "ASSET_PURCHASE")}>
                  <option value="GENERAL">General Payment</option>
                  <option value="ASSET_PURCHASE">Asset Purchase</option>
                </select>
              </Field>
            </div>
            <Field label="Purpose / Description" required>
              <textarea className={`${input} h-20 resize-none`} value={form.purpose} onChange={(e) => setField("purpose", e.target.value)} required placeholder="Describe what this payment is for" />
            </Field>

            {/* Line items */}
            <div>
              <div className="text-xs font-medium text-stone-500 mb-2">Line Items</div>
              <div className="space-y-2">
                {form.line_items.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <input
                      className={`${input} flex-1`}
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => updateLineItem(idx, "description", e.target.value)}
                    />
                    <input
                      className={`${input} w-28`}
                      type="number"
                      placeholder="Amount"
                      min="0"
                      step="0.01"
                      value={item.amount || ""}
                      onChange={(e) => updateLineItem(idx, "amount", e.target.value)}
                    />
                    {form.line_items.length > 1 && (
                      <button type="button" onClick={() => removeLineItem(idx)} className="p-2 text-stone-400 hover:text-red-500">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" onClick={addLineItem} className="mt-2 flex items-center gap-1 text-xs text-[#4a6da7] hover:underline">
                <Plus size={12} /> Add line item
              </button>
            </div>

            {/* Total */}
            <div className="flex justify-between items-center pt-2 border-t border-stone-100">
              <span className="text-sm font-semibold text-stone-600">Total Amount</span>
              <span className="text-lg font-bold text-stone-800">{formatCurrency(displayAmount)}</span>
            </div>

            {/* LOA indicator */}
            {displayAmount > 0 && (
              <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
                <Info size={14} className="mt-0.5 shrink-0" />
                <span><strong>Approval required:</strong> {loa.label} ({loa.required} signatory{loa.required > 1 ? "ies" : ""})</span>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Declaration */}
        <Card>
          <CardBody className="space-y-3">
            <p className="text-xs text-stone-500 leading-relaxed">
              I hereby declare that the information provided is true and accurate, and that this payment is for legitimate church-related expenses in accordance with LCM's financial policies.
            </p>
            <Field label="Your Full Name (as signature)" required>
              <input className={input} value={form.sig_applicant_name} onChange={(e) => setField("sig_applicant_name", e.target.value)} required />
            </Field>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 accent-[#4a6da7]"
                checked={form.sig_applicant_confirm}
                onChange={(e) => setField("sig_applicant_confirm", e.target.checked)}
              />
              <span className="text-xs text-stone-600">I confirm the above declaration and that all details are correct</span>
            </label>
          </CardBody>
        </Card>

        {error && <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
        {success && <div className="px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{success}</div>}

        <Button type="submit" loading={submitting} className="w-full" size="lg">
          Submit Payment Voucher
        </Button>
      </form>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-stone-500 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const input = "w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800 bg-white focus:border-[#4a6da7] focus:ring-1 focus:ring-[#4a6da7] outline-none transition-colors";
