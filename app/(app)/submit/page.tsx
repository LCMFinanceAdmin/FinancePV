"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, getLOATier } from "@/lib/utils";
import { Plus, Trash2, Info, ChevronDown, PenLine, Upload, CheckCircle, X as XIcon, Car } from "lucide-react";
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

const MILEAGE_RATE = 0.70;
const LCM_LOCATIONS = [
  "Cameron Highlands", "Ipoh", "Kuala Lumpur", "Luther Centre", "Lumut", "Penang",
  "Sitiawan", "Taiping", "Tapah", "Teluk Intan", "Tanjung Malim",
];
const TRAVEL_TYPES = [
  { value: "petrol",  label: "Petrol" },
  { value: "train",   label: "Train Ticket" },
  { value: "airfare", label: "Airfare" },
  { value: "mileage", label: "Mileage (RM0.70/km)" },
] as const;
type TravelType = typeof TRAVEL_TYPES[number]["value"];
interface TravelItem {
  date: string; travel_type: TravelType | ""; description: string;
  from: string; to: string; km: number; amount: number;
}
const EMPTY_TRAVEL_ITEM: TravelItem = { date: "", travel_type: "", description: "", from: "", to: "", km: 0, amount: 0 };

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
    <div className="flex flex-col sm:flex-row sm:items-end gap-1 sm:gap-3 py-1.5 border-b border-stone-100 last:border-0">
      <div className="shrink-0 sm:min-w-[200px]">
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
  const [userMinistries, setUserMinistries] = useState<string[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [prBanner, setPrBanner] = useState<{ id: string; request_no: string; title: string } | null>(null);
  const [isTravelClaim, setIsTravelClaim] = useState(false);
  const [travelItems, setTravelItems] = useState<TravelItem[]>([{ ...EMPTY_TRAVEL_ITEM }]);
  const [customLocations, setCustomLocations] = useState<string[]>(() => {
    if (typeof window === "undefined") return LCM_LOCATIONS;
    const stored = localStorage.getItem("lcm_travel_locations");
    return stored ? JSON.parse(stored) : LCM_LOCATIONS;
  });
  const [showLocationMgr, setShowLocationMgr] = useState(false);
  const [newLocation, setNewLocation] = useState("");

  // Finance Executive e-signature
  const [isFinanceAdmin, setIsFinanceAdmin] = useState(false);
  const [finSigData, setFinSigData]         = useState(""); // base64
  const [savedSig, setSavedSig]             = useState("");
  const [sigMode, setSigMode]               = useState<"draw" | "upload">("draw");
  const [saveSigForNext, setSaveSigForNext] = useState(false);
  const canvasRef                           = useRef<HTMLCanvasElement>(null);
  const isDrawingRef                        = useRef(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("user_roles").select("full_name,role,ministries,saved_signature").eq("email", user.email).single().then(({ data: profile }) => {
        const role = profile?.role ?? "";
        setUserRole(role);
        setUserMinistries(profile?.ministries ?? []);
        const faRoles = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"];
        const isFA = faRoles.includes(role);
        setIsFinanceAdmin(isFA);
        if (isFA && profile?.saved_signature) {
          setSavedSig(profile.saved_signature);
          setFinSigData(profile.saved_signature); // auto-apply saved sig
        }
        setForm(f => ({
          ...f,
          applicant_email: user.email ?? "",
          applicant_name: profile?.full_name || user.user_metadata?.full_name || "",
          sig_applicant_name: profile?.full_name || user.user_metadata?.full_name || "",
        }));
      });
    });

    // Pre-fill from purchase request if pr_id in query
    const params = new URLSearchParams(window.location.search);
    const prId = params.get("pr_id");
    if (prId) {
      supabase.from("purchase_requests").select("*").eq("id", prId).single().then(({ data: pr }) => {
        if (!pr) return;
        setPrBanner({ id: pr.id, request_no: pr.request_no, title: pr.title });
        setForm(f => ({
          ...f,
          ministry: pr.ministry ?? f.ministry,
          project:  pr.project  ?? f.project,
          purpose:  pr.title    ?? f.purpose,
          payee_name: pr.vendor_name ?? f.payee_name,
          line_items: pr.line_items?.length
            ? pr.line_items.map((l: { description: string; amount: number }) => ({ description: l.description, amount: l.amount, date: "" }))
            : f.line_items,
        }));
      });
    }
  }, []);

  // Load projects when ministry changes
  useEffect(() => {
    if (!form.ministry) { setProjects([]); return; }
    loadBudgetProjects(supabase, form.ministry)
      .then((projectNames) => setProjects(projectNames));
  }, [form.ministry]);

  const totalFromItems = isTravelClaim
    ? travelItems.reduce((s, i) => s + (Number(i.amount) || 0), 0)
    : form.line_items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const displayAmount = totalFromItems;
  const loa = getLOATier(displayAmount, "GENERAL");
  // Finance Executive / senior roles can always manage; Ministry Heads only for their assigned ministry
  const DIRECT_MANAGER_ROLES = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3", "GENERAL_MANAGER", "TREASURER", "BISHOP", "SECRETARY"];
  const canManageProjects =
    DIRECT_MANAGER_ROLES.includes(userRole) ||
    (userRole === "MINISTRY_HEAD" && form.ministry !== "" && userMinistries.includes(form.ministry)) ||
    (userMinistries.length > 0 && form.ministry !== "" && userMinistries.includes(form.ministry));
  const budgetManageUrl = `/budget?ministry=${encodeURIComponent(form.ministry)}`;

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

  function updateTravelItem(idx: number, patch: Partial<TravelItem>) {
    setTravelItems(items => items.map((item, i) => {
      if (i !== idx) return item;
      const merged = { ...item, ...patch };
      if (merged.travel_type === "mileage") merged.amount = Math.round(merged.km * MILEAGE_RATE * 100) / 100;
      return merged;
    }));
  }
  function addTravelItem() { setTravelItems(items => [...items, { ...EMPTY_TRAVEL_ITEM }]); }
  function removeTravelItem(idx: number) {
    setTravelItems(items => items.length > 1 ? items.filter((_, i) => i !== idx) : [{ ...EMPTY_TRAVEL_ITEM }]);
  }

  function saveLocations(locs: string[]) {
    setCustomLocations(locs);
    localStorage.setItem("lcm_travel_locations", JSON.stringify(locs));
  }
  function addLocation() {
    const v = newLocation.trim();
    if (!v || customLocations.includes(v)) return;
    saveLocations([...customLocations, v].sort());
    setNewLocation("");
  }
  function removeLocation(loc: string) {
    saveLocations(customLocations.filter(l => l !== loc));
  }

  // ── Canvas helpers for Finance Executive signature ──────────────────────
  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    isDrawingRef.current = true;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top  : e.clientY - rect.top;
    ctx.beginPath(); ctx.moveTo(x, y);
  }, []);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top  : e.clientY - rect.top;
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#1a1a2e";
    ctx.lineTo(x, y); ctx.stroke();
    setFinSigData(canvas.toDataURL("image/png"));
  }, []);

  const stopDraw = useCallback(() => { isDrawingRef.current = false; }, []);

  function clearCanvas() {
    const canvas = canvasRef.current; if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setFinSigData("");
  }

  function loadSavedSigOnCanvas(data: string) {
    setFinSigData(data);
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const img = new Image(); img.src = data;
    img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); };
  }

  function handleSigUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => loadSavedSigOnCanvas(ev.target?.result as string);
    reader.readAsDataURL(file);
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
          line_items: isTravelClaim
            ? travelItems.filter(i => i.travel_type).map(i => ({
                date: i.date || form.pvDate,
                description: i.travel_type === "mileage"
                  ? `Mileage: ${i.from} → ${i.to} (${i.km}km × RM${MILEAGE_RATE.toFixed(2)}/km)`
                  : `${TRAVEL_TYPES.find(t => t.value === i.travel_type)?.label ?? ""}: ${i.description}`,
                amount: Number(i.amount),
              }))
            : form.line_items.filter(i => i.description || i.amount),
          payment_type: isTravelClaim ? "TRAVEL_CLAIM" : "GENERAL",
          sig_applicant_name: form.sig_applicant_name,
          sig_applicant_confirm: form.sig_applicant_confirm,
          ...(isFinanceAdmin && finSigData ? { finance_signature_data: finSigData } : {}),
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Submission failed");
      // Save signature for next time if requested
      if (isFinanceAdmin && finSigData && saveSigForNext) {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser?.email) {
          await supabase.from("user_roles").update({ saved_signature: finSigData }).eq("email", authUser.email);
          setSavedSig(finSigData);
        }
      }
      // If raised from a PR, mark the PR as PV_RAISED
      if (prBanner?.id && result.pv_id) {
        await supabase.from("purchase_requests").update({
          status: "PV_RAISED", pv_id: result.pv_id, updated_at: new Date().toISOString(),
        }).eq("id", prBanner.id);
      }
      setSuccess(`PV ${result.pv_no} submitted successfully!`);
      setForm(EMPTY_FORM);
      setPrBanner(null);
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

      {/* PR pre-fill banner */}
      {prBanner && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm">
          <span className="text-blue-600 font-semibold shrink-0">📋 {prBanner.request_no}</span>
          <span className="text-blue-800 flex-1">Raising PV for: <strong>{prBanner.title}</strong></span>
          <button type="button" onClick={() => setPrBanner(null)} className="text-blue-400 hover:text-blue-600 text-xs">Clear</button>
        </div>
      )}

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
          <div className="px-3 sm:px-6 py-4 space-y-0">

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
                    {canManageProjects && form.ministry && (
                      <a href={budgetManageUrl} target="_blank"
                        className="shrink-0 text-[10px] text-[#4a6da7] hover:underline whitespace-nowrap font-medium">
                        + Manage
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex items-end gap-2">
                    <input className={`${uline} flex-1`} value={form.project}
                      onChange={e => setField("project", e.target.value)}
                      placeholder="No projects set up yet — type or leave blank" />
                    {canManageProjects && form.ministry && (
                      <a href={budgetManageUrl} target="_blank"
                        className="shrink-0 text-[10px] text-[#4a6da7] hover:underline whitespace-nowrap font-medium">
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
          <div className="px-3 sm:px-6 pb-2">
            <div className="flex items-center justify-between mb-2 mt-1">
              <p className="text-xs font-semibold text-stone-500">
                Particulars of Claim / Payment
                <span className="text-stone-400 font-normal ml-1">(Please attach relevant Receipts / Invoices / Bills)</span>
              </p>
              <button type="button" onClick={() => setIsTravelClaim(t => !t)}
                className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors shrink-0 ml-3 ${
                  isTravelClaim
                    ? "bg-[#7C4A0A] text-white border-transparent"
                    : "border-[#7C4A0A] text-[#7C4A0A] hover:bg-amber-50"
                }`}>
                <Car size={11} /> Travel Claim
              </button>
            </div>

            <datalist id="lcm-locations">
              {customLocations.map(l => <option key={l} value={l} />)}
            </datalist>

            <div className="overflow-x-auto">
            {isTravelClaim ? (
              <table className="w-full border-collapse border border-stone-800 text-sm" style={{ minWidth: 540 }}>
                <thead>
                  <tr className="bg-stone-50">
                    <th className="border border-stone-800 px-2 py-1.5 text-center text-xs font-bold w-8">#</th>
                    <th className="border border-stone-800 px-2 py-1.5 text-center text-xs font-bold w-24">Date 日期</th>
                    <th className="border border-stone-800 px-2 py-1.5 text-left text-xs font-bold w-32">Type 类型</th>
                    <th className="border border-stone-800 px-2 py-1.5 text-left text-xs font-bold">Route / Particulars 路线 / 事项</th>
                    <th className="border border-stone-800 px-2 py-1.5 text-right text-xs font-bold w-28">Amount 数目 (RM)</th>
                    <th className="border border-stone-800 w-8 print:hidden" />
                  </tr>
                </thead>
                <tbody>
                  {travelItems.map((item, idx) => (
                    <tr key={idx} className="group">
                      <td className="border border-stone-800 px-2 py-1 text-center text-xs text-stone-500">{idx + 1}</td>
                      <td className="border border-stone-800 px-1 py-0.5">
                        <input type="date"
                          className="w-full outline-none text-xs text-stone-600 bg-transparent border-0 py-0.5"
                          value={item.date || form.pvDate}
                          onChange={e => updateTravelItem(idx, { date: e.target.value })} />
                      </td>
                      <td className="border border-stone-800 px-1 py-0.5">
                        <select
                          value={item.travel_type}
                          onChange={e => updateTravelItem(idx, { travel_type: e.target.value as TravelType | "", description: "", from: "", to: "", km: 0, amount: 0 })}
                          className="w-full outline-none text-xs bg-transparent border-0 py-0.5 cursor-pointer">
                          <option value="">— Select —</option>
                          {TRAVEL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </td>
                      <td className="border border-stone-800 px-1 py-0.5">
                        {item.travel_type === "mileage" ? (
                          <div className="flex flex-col gap-1 py-0.5">
                            <div className="flex items-center gap-1">
                              <input list="lcm-locations"
                                className="outline-none text-xs bg-transparent border-b border-stone-300 flex-1 min-w-0 focus:border-[#4a6da7] placeholder:text-stone-300"
                                placeholder="From"
                                value={item.from}
                                onChange={e => updateTravelItem(idx, { from: e.target.value })} />
                              <span className="text-stone-400 text-xs shrink-0">→</span>
                              <input list="lcm-locations"
                                className="outline-none text-xs bg-transparent border-b border-stone-300 flex-1 min-w-0 focus:border-[#4a6da7] placeholder:text-stone-300"
                                placeholder="To"
                                value={item.to}
                                onChange={e => updateTravelItem(idx, { to: e.target.value })} />
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-stone-400 text-[10px] shrink-0">KM:</span>
                              <input type="number" min="0" step="0.1"
                                className="outline-none text-xs bg-transparent border-b border-stone-300 w-20 focus:border-[#4a6da7] placeholder:text-stone-300"
                                placeholder="0"
                                value={item.km || ""}
                                onChange={e => updateTravelItem(idx, { km: Number(e.target.value) })} />
                            </div>
                          </div>
                        ) : (
                          <input
                            className="w-full outline-none text-xs bg-transparent border-0 py-0.5 placeholder:text-stone-300"
                            placeholder={
                              item.travel_type === "petrol"  ? "e.g. Petrol — Tapah to Cameron Highlands"
                              : item.travel_type === "train"   ? "e.g. KL Sentral → Ipoh (KTM)"
                              : item.travel_type === "airfare" ? "e.g. KL → Kota Kinabalu (AirAsia)"
                              : "Description of travel expense"
                            }
                            value={item.description}
                            onChange={e => updateTravelItem(idx, { description: e.target.value })} />
                        )}
                      </td>
                      <td className="border border-stone-800 px-1 py-0.5">
                        {item.travel_type === "mileage" ? (
                          <div className="text-right text-sm text-stone-600 bg-stone-50 py-0.5 px-1 tabular-nums font-medium select-none">
                            {item.km > 0 ? (item.km * MILEAGE_RATE).toFixed(2) : "—"}
                          </div>
                        ) : (
                          <input type="number" min="0" step="0.01"
                            className="w-full outline-none text-sm text-right bg-transparent border-0 py-0.5 placeholder:text-stone-300"
                            placeholder="0.00"
                            value={item.amount || ""}
                            onChange={e => updateTravelItem(idx, { amount: Number(e.target.value) })} />
                        )}
                      </td>
                      <td className="border border-stone-800 px-1 py-0.5 text-center print:hidden">
                        {travelItems.length > 1 && (
                          <button type="button" onClick={() => removeTravelItem(idx)}
                            className="text-stone-300 hover:text-red-400 transition-colors p-0.5">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {Array.from({ length: Math.max(0, 5 - travelItems.length) }).map((_, i) => (
                    <tr key={`pad-${i}`} className="h-8 cursor-pointer hover:bg-amber-50/40 group/pad" onClick={addTravelItem}>
                      <td className="border border-stone-800 px-2 py-1 text-center text-xs text-stone-300">{travelItems.length + i + 1}</td>
                      <td className="border border-stone-800" />
                      <td className="border border-stone-800" />
                      <td className="border border-stone-800 px-2 text-xs text-stone-300 italic group-hover/pad:text-stone-400">{i === 0 ? "Click to add item…" : ""}</td>
                      <td className="border border-stone-800" />
                      <td className="border border-stone-800 print:hidden" />
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-stone-50">
                    <td colSpan={4} className="border border-stone-800 px-3 py-1.5 text-right text-sm font-bold">
                      TOTAL AMOUNT 总数额
                    </td>
                    <td className="border border-stone-800 px-2 py-1.5 text-right text-sm font-bold text-stone-800">
                      {displayAmount > 0 ? displayAmount.toFixed(2) : "—"}
                    </td>
                    <td className="border border-stone-800 print:hidden" />
                  </tr>
                </tfoot>
              </table>
            ) : (
              <table className="w-full border-collapse border border-stone-800 text-sm" style={{ minWidth: 420 }}>
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
            )}

            </div>{/* end overflow-x-auto */}
            <div className="flex items-center justify-between mt-2 print:hidden">
              <button type="button" onClick={isTravelClaim ? addTravelItem : addLineItem}
                className="flex items-center gap-1 text-xs text-[#4a6da7] hover:underline">
                <Plus size={11} /> {isTravelClaim ? "Add travel item" : "Add line item"}
              </button>
              {isTravelClaim && (
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-stone-400">Mileage: RM{MILEAGE_RATE.toFixed(2)}/km (auto-calculated)</span>
                  <button type="button" onClick={() => setShowLocationMgr(s => !s)}
                    className="text-[10px] text-[#7C4A0A] hover:underline font-medium">
                    {showLocationMgr ? "Close" : "Edit locations"}
                  </button>
                </div>
              )}
            </div>

            {isTravelClaim && showLocationMgr && (
              <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2 print:hidden">
                <p className="text-[11px] font-semibold text-amber-900">Location suggestions</p>
                <div className="flex flex-wrap gap-1.5">
                  {customLocations.map(loc => (
                    <span key={loc} className="flex items-center gap-1 text-xs bg-white border border-stone-200 px-2 py-0.5 rounded-full">
                      {loc}
                      <button type="button" onClick={() => removeLocation(loc)}
                        className="text-stone-300 hover:text-red-400 transition-colors ml-0.5">
                        <XIcon size={9} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={newLocation}
                    onChange={e => setNewLocation(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addLocation(); } }}
                    placeholder="Type new location and press Enter or + Add"
                    className="flex-1 text-xs border-b border-amber-300 bg-transparent outline-none py-0.5 focus:border-[#7C4A0A] placeholder:text-stone-300" />
                  <button type="button" onClick={addLocation}
                    className="text-xs text-[#7C4A0A] font-semibold hover:underline shrink-0">
                    + Add
                  </button>
                </div>
              </div>
            )}
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
          <div className="px-3 sm:px-6 py-4 border-t-2 border-stone-800 space-y-3 print:hidden">
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

          {/* ── FINANCE EXECUTIVE E-SIGNATURE ─────────────────────────── */}
          {isFinanceAdmin && (
            <div className="px-3 sm:px-6 py-4 border-t border-stone-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <PenLine size={14} className="text-[#4a6da7]" />
                  <span className="text-sm font-semibold text-stone-700">Finance Executive E-Signature</span>
                  {finSigData && <span className="text-[11px] text-green-600 font-medium">(captured)</span>}
                </div>
                <div className="flex gap-1">
                  <button type="button" onClick={() => setSigMode("draw")}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${sigMode === "draw" ? "bg-[#4a6da7]/10 border-[#4a6da7]/30 text-[#4a6da7]" : "border-stone-200 text-stone-500 hover:bg-stone-50"}`}>
                    Draw
                  </button>
                  <button type="button" onClick={() => setSigMode("upload")}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${sigMode === "upload" ? "bg-[#4a6da7]/10 border-[#4a6da7]/30 text-[#4a6da7]" : "border-stone-200 text-stone-500 hover:bg-stone-50"}`}>
                    Upload
                  </button>
                </div>
              </div>

              {sigMode === "draw" ? (
                <div className="space-y-2">
                  <div className="border-2 border-dashed border-stone-200 rounded-xl overflow-hidden bg-stone-50" style={{ touchAction: "none" }}>
                    <canvas ref={canvasRef} width={560} height={90} className="w-full cursor-crosshair"
                      onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
                      onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={clearCanvas}
                      className="text-xs text-stone-500 hover:text-stone-700 border border-stone-200 px-2.5 py-1 rounded-lg hover:bg-stone-50 transition-colors flex items-center gap-1">
                      <XIcon size={10} /> Clear
                    </button>
                    {savedSig && (
                      <button type="button" onClick={() => loadSavedSigOnCanvas(savedSig)}
                        className="text-xs text-[#4a6da7] hover:text-[#3d5a8e] border border-[#4a6da7]/30 px-2.5 py-1 rounded-lg hover:bg-blue-50 transition-colors flex items-center gap-1">
                        <CheckCircle size={11} /> Use saved signature
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-stone-200 rounded-xl p-5 bg-stone-50 cursor-pointer hover:border-[#4a6da7]/40 hover:bg-blue-50/30 transition-colors">
                  <Upload size={18} className="text-stone-400 mb-1" />
                  <span className="text-xs text-stone-500">Click to upload signature image</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleSigUpload} />
                </label>
              )}

              {finSigData && (
                <div className="mt-2 flex items-center gap-3 p-2.5 bg-green-50 border border-green-200 rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={finSigData} alt="signature preview" className="h-8 object-contain" />
                  <span className="text-xs text-green-700 flex-1">Signature captured</span>
                  <label className="flex items-center gap-1.5 text-xs text-stone-600 cursor-pointer shrink-0">
                    <input type="checkbox" checked={saveSigForNext} onChange={e => setSaveSigForNext(e.target.checked)} className="accent-[#4a6da7]" />
                    Save for next time
                  </label>
                </div>
              )}
            </div>
          )}

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
