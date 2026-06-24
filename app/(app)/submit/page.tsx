"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, getLOATier } from "@/lib/utils";
import {
  Plus, Trash2, Info, ChevronDown, PenLine, Upload, CheckCircle,
  X as XIcon, Car, Camera, Paperclip, FileText as FileIcon,
} from "lucide-react";
import { loadBudgetProjects } from "@/lib/budget-utils";
import type { PVLineItem } from "@/lib/types";

// ── Ministry list ───────────────────────────────────────────────────────
const MINISTRIES = [
  "Mission", "Social Concern", "Education", "Stewardship", "Orang Asli",
  "Property", "Head Quarters (HQ)", "Reconcile", "Trustees",
  "Sisters and Women Fellowship (SWF)", "Young Adult and Youth (YAY)",
  "Luther Study Centre",
];

const WORKSHEET_TYPE_LABEL = {
  PA_PERSONNEL: "PA Personnel",
  BUILDING_CARE_TAKER: "Building Care Taker",
  RELA_PERSONNEL: "RELA Personnel",
};

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

interface AttachmentFile { file: File; previewUrl: string; sourceUrl?: string; name?: string; }

function formatFileSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

interface FormData {
  applicant_name: string; applicant_email: string; dept: string; pvDate: string;
  payee_name: string; payment_method: string; payee_bank_name: string;
  payee_bank_acct: string; cheque_no: string; biller_code: string; ref_no: string;
  ministry: string; project: string; purpose: string;
  line_items: PVLineItem[];
  sig_applicant_name: string; sig_applicant_confirm: boolean;
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

// ── Desktop inline styles ───────────────────────────────────────────────
const uline = "border-0 border-b border-stone-400 bg-transparent outline-none text-sm text-stone-800 px-1 py-0 w-full focus:border-[#4a6da7] transition-colors placeholder:text-stone-300";
const uselect = `${uline} cursor-pointer appearance-none pr-6`;

// ── Mobile styles ───────────────────────────────────────────────────────
const mInput = "w-full border border-stone-200 rounded-xl px-4 py-3 text-sm text-stone-800 outline-none focus:border-[#4a6da7] bg-white transition-colors placeholder:text-stone-300";
const mLabel = "block text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5";

function InlineSelect({ value, onChange, children, className = "" }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`relative flex-1 ${className}`}>
      <select value={value} onChange={e => onChange(e.target.value)} className={uselect}>{children}</select>
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

const SECTION_TITLES = [
  "Your Details", "Payee & Payment", "Ministry & Purpose",
  "Claim Items", "Supporting Documents", "Declaration",
];

export default function SubmitPVPage() {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [pvType, setPvType] = useState<"LCM" | "BAM" | "LSC" | "HLE">(() => {
    if (typeof window === "undefined") return "LCM";
    const t = new URLSearchParams(window.location.search).get("type");
    if (t === "bam") return "BAM";
    if (t === "lsc") return "LSC";
    if (t === "hle") return "HLE";
    return "LCM";
  });
  const [userRole, setUserRole] = useState("");
  const [userMinistries, setUserMinistries] = useState<string[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [prBanner, setPrBanner] = useState<{ id: string; request_no: string; title: string } | null>(null);
  const [claimBanner, setClaimBanner] = useState<{ id: string; claim_no: string; claimant: string } | null>(null);
  const [worksheetBanner, setWorksheetBanner] = useState<{ id: string; worksheet_no: string; worker_name: string } | null>(null);
  const [isTravelClaim, setIsTravelClaim] = useState(false);
  const [travelItems, setTravelItems] = useState<TravelItem[]>([{ ...EMPTY_TRAVEL_ITEM }]);
  const [customLocations, setCustomLocations] = useState<string[]>(() => {
    if (typeof window === "undefined") return LCM_LOCATIONS;
    const stored = localStorage.getItem("lcm_travel_locations");
    return stored ? JSON.parse(stored) : LCM_LOCATIONS;
  });
  const [showLocationMgr, setShowLocationMgr] = useState(false);
  const [newLocation, setNewLocation] = useState("");

  // Attachments
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [previewDocUrl, setPreviewDocUrl] = useState<string | null>(null);

  // Mobile accordion
  const [isMobile, setIsMobile] = useState(false);
  const [openSection, setOpenSection] = useState(0);

  // Finance Executive e-signature
  const [isFinanceAdmin, setIsFinanceAdmin] = useState(false);
  const [finSigData, setFinSigData] = useState("");
  const [savedSig, setSavedSig] = useState("");
  const [sigMode, setSigMode] = useState<"draw" | "upload">("draw");
  const [saveSigForNext, setSaveSigForNext] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  // Applicant signature (mobile declaration)
  const applicantCanvasRef = useRef<HTMLCanvasElement>(null);
  const isApplicantDrawingRef = useRef(false);
  const [applicantSigData, setApplicantSigData] = useState("");

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("user_roles").select("full_name,role,ministries,saved_signature").eq("email", user.email).single().then(({ data: profile }) => {
        const role = profile?.role ?? "";
        setUserRole(role);
        setUserMinistries(profile?.ministries ?? []);
        const faRoles = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"];
        const isFA = faRoles.includes(role);
        const isBM = role === "BUILDING_MANAGER";
        setIsFinanceAdmin(isFA);
        // Building Manager can only submit BAM PVs
        if (isBM) setPvType("BAM");
        if (isFA && profile?.saved_signature) {
          setSavedSig(profile.saved_signature);
          setFinSigData(profile.saved_signature);
        }
        setForm(f => ({
          ...f,
          applicant_email: user.email ?? "",
          applicant_name: profile?.full_name || user.user_metadata?.full_name || "",
          sig_applicant_name: profile?.full_name || user.user_metadata?.full_name || "",
          // Pre-fill ministry to Property for Building Manager
          ministry: isBM ? "Property" : f.ministry,
        }));
      });
    });

    const params = new URLSearchParams(window.location.search);

    // GM Claim pre-fill
    const claimId = params.get("claim_id");
    if (claimId) {
      const claimant = params.get("claim_claimant") ?? "";
      const ministry = params.get("claim_ministry") ?? "";
      const amount = parseFloat(params.get("claim_amount") ?? "0") || 0;
      const purpose = params.get("claim_purpose") ?? "";
      setClaimBanner({ id: claimId, claim_no: "", claimant });
      supabase.from("gm_claims").select("claim_no,attachments").eq("id", claimId).single().then(({ data }) => {
        if (data) {
          setClaimBanner(b => b ? { ...b, claim_no: data.claim_no } : b);
          // Pre-populate attachments from GM claim as URL-backed entries
          if (data.attachments?.length) {
            const preloaded: AttachmentFile[] = data.attachments.map((url: string, i: number) => {
              const rawName = decodeURIComponent(url.split("/").pop() ?? "");
              const name = rawName.replace(/^\d+_/, "").replace(/_/g, " ") || `attachment-${i + 1}`;
              return {
                file: new File([], name),
                name,
                previewUrl: url,
                sourceUrl: url,
              };
            });
            setAttachments(preloaded);
          }
        }
      });
      setForm(f => ({
        ...f,
        ministry: ministry || f.ministry,
        purpose: purpose || f.purpose,
        payee_name: claimant || f.payee_name,
        line_items: amount > 0 ? [{ description: purpose, amount, date: "" }] : f.line_items,
      }));
    }

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

    // Worksheet pre-fill (PA Personnel / Building Care Taker / RELA Personnel)
    const worksheetId = params.get("worksheet_id");
    if (worksheetId) {
      supabase.from("worker_worksheets").select("*").eq("id", worksheetId).single().then(({ data: ws }) => {
        if (!ws) return;
        setWorksheetBanner({ id: ws.id, worksheet_no: ws.worksheet_no, worker_name: ws.worker_name });
        setPvType("BAM");
        const typeLabel = WORKSHEET_TYPE_LABEL[ws.worker_type as keyof typeof WORKSHEET_TYPE_LABEL] ?? ws.worker_type;
        const purpose = `Wages — ${typeLabel} (${ws.period_label})`;
        setForm(f => ({
          ...f,
          ministry: "Property",
          purpose,
          payee_name: ws.worker_name,
          line_items: [{ description: purpose, amount: ws.total_amount, date: "" }],
        }));
        if (ws.pdf_url) {
          setAttachments(prev => [...prev, {
            file: new File([], `${ws.worksheet_no}.pdf`),
            name: `Worksheet ${ws.worksheet_no} (signed)`,
            previewUrl: ws.pdf_url,
            sourceUrl: ws.pdf_url,
          }]);
        }
      });
    }
  }, []);

  useEffect(() => {
    if (!form.ministry) { setProjects([]); return; }
    loadBudgetProjects(supabase, form.ministry).then(setProjects);
  }, [form.ministry]);

  const totalFromItems = isTravelClaim
    ? travelItems.reduce((s, i) => s + (Number(i.amount) || 0), 0)
    : form.line_items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const displayAmount = totalFromItems;
  const loa = getLOATier(displayAmount, "GENERAL");

  const DIRECT_MANAGER_ROLES = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3", "GENERAL_MANAGER", "TREASURER", "BISHOP", "SECRETARY"];
  const canManageProjects =
    DIRECT_MANAGER_ROLES.includes(userRole) ||
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
  function addLineItem() { setForm(f => ({ ...f, line_items: [...f.line_items, { description: "", amount: 0, date: "" }] })); }
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
  function removeLocation(loc: string) { saveLocations(customLocations.filter(l => l !== loc)); }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const newFiles = Array.from(files)
      .filter(f => f.type.startsWith("image/") || f.type === "application/pdf")
      .map(f => ({ file: f, previewUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : "" }));
    setAttachments(prev => [...prev, ...newFiles]);
  }
  function removeAttachment(idx: number) {
    setAttachments(prev => {
      if (prev[idx]?.previewUrl) URL.revokeObjectURL(prev[idx].previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  }

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

  const startApplicantDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    isApplicantDrawingRef.current = true;
    const canvas = applicantCanvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top  : e.clientY - rect.top;
    ctx.beginPath(); ctx.moveTo(x, y);
  }, []);

  const drawApplicant = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isApplicantDrawingRef.current) return;
    const canvas = applicantCanvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top  : e.clientY - rect.top;
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#1a1a2e";
    ctx.lineTo(x, y); ctx.stroke();
    setApplicantSigData(canvas.toDataURL("image/png"));
  }, []);

  const stopApplicantDraw = useCallback(() => { isApplicantDrawingRef.current = false; }, []);

  function clearApplicantCanvas() {
    const canvas = applicantCanvasRef.current; if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setApplicantSigData("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!form.sig_applicant_confirm) { setError("Please confirm the declaration before submitting."); return; }
    if (isMobile && !applicantSigData) { setError("Please sign the declaration before submitting."); return; }
    if (!form.payee_name.trim()) { setError("Please enter the payee name."); return; }
    if (!form.purpose.trim()) { setError("Please enter the purpose of payment."); return; }
    if (displayAmount <= 0) { setError("Please enter at least one line item with an amount."); return; }
    setSubmitting(true);
    try {
      // Upload attachments to Supabase storage (skip pre-populated GM claim files)
      const attachmentUrls: string[] = [];
      for (const att of attachments) {
        if (att.sourceUrl) { attachmentUrls.push(att.sourceUrl); continue; }
        const ext = att.file.name.split(".").pop() ?? "bin";
        const path = `pvs/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from("pv-attachments").upload(path, att.file);
        if (!uploadErr) {
          const { data: { publicUrl } } = supabase.storage.from("pv-attachments").getPublicUrl(path);
          attachmentUrls.push(publicUrl);
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/submit-pv`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          pv_type: pvType,
          applicant_name: form.applicant_name,
          applicant_email: form.applicant_email,
          pvDate: form.pvDate,
          dept: form.dept,
          ministry: pvType === "BAM" ? (form.ministry || "Property") : pvType === "LSC" ? "Luther Study Centre" : form.ministry,
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
          attachment_urls: attachmentUrls,
          ...(isFinanceAdmin && finSigData ? { finance_signature_data: finSigData } : {}),
          ...(applicantSigData ? { applicant_signature_data: applicantSigData } : {}),
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Submission failed");

      if (isFinanceAdmin && finSigData && saveSigForNext) {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser?.email) {
          await supabase.from("user_roles").update({ saved_signature: finSigData }).eq("email", authUser.email);
          setSavedSig(finSigData);
        }
      }
      if (prBanner?.id && result.pv_id) {
        await supabase.from("purchase_requests").update({
          status: "PV_RAISED", pv_id: result.pv_id, updated_at: new Date().toISOString(),
        }).eq("id", prBanner.id);
      }
      if (worksheetBanner?.id && result.pv_id) {
        await supabase.from("worker_worksheets").update({
          status: "PV_RAISED", pv_id: result.pv_id, updated_at: new Date().toISOString(),
        }).eq("id", worksheetBanner.id);
      }
      // Link GM claim (read directly from URL — more reliable than state)
      const urlParams = new URLSearchParams(window.location.search);
      const urlClaimId = urlParams.get("claim_id");
      if (urlClaimId && result.pv_id) {
        await supabase.from("gm_claims").update({
          pv_id: result.pv_id, updated_at: new Date().toISOString(),
        }).eq("id", urlClaimId);
        // Notify GM that PV is ready for verification
        const claimant = urlParams.get("claim_claimant") ?? "";
        const { data: gmUsers } = await supabase.from("user_roles").select("email")
          .eq("role", "GENERAL_MANAGER");
        if (gmUsers?.length) {
          await supabase.from("notifications").insert(gmUsers.map((gm: { email: string }) => ({
            recipient_email: gm.email,
            type: "GM_CLAIM_PV",
            pv_no: result.pv_no,
            pv_id: result.pv_id,
            message: `PV ${result.pv_no} has been created for ${claimant || "a claimant"}. Please verify and proceed to signatories.`,
            read: false,
            created_at: new Date().toISOString(),
          })));
        }
      }
      setSuccess(`PV ${result.pv_no} submitted successfully!`);
      setForm(EMPTY_FORM);
      setPrBanner(null);
      setClaimBanner(null);
      setWorksheetBanner(null);
      // Revoke all object URLs
      attachments.forEach(a => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl); });
      setAttachments([]);
      clearApplicantCanvas();
      // Redirect back to GM Claims if came from a claim; the Building/Event
      // Manager has no access to the generic /my-pvs list, so send him to his
      // own BAM-scoped page instead. Everyone else lands on /my-pvs.
      const redirectTo = urlClaimId
        ? "/gm-claims"
        : userRole === "BUILDING_MANAGER" ? "/my-bam-pvs" : "/my-pvs";
      setTimeout(() => router.push(redirectTo), 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  const isCheque  = form.payment_method === "Cheque";
  const isJomPay  = form.payment_method === "JomPay";
  const isCash    = form.payment_method === "Cash";
  const isTransfer = !isCheque && !isJomPay && !isCash;

  // ── Section completion + summary (for mobile accordion) ────────────────
  const sectionComplete = [
    !!(form.applicant_name && form.applicant_email && form.pvDate),
    !!(form.payee_name && (isCash || (isCheque) || (isJomPay) || (!isCash && !isCheque && !isJomPay && form.payee_bank_acct))),
    !!(form.ministry && form.purpose),
    displayAmount > 0,
    true,
    !!(form.sig_applicant_confirm && applicantSigData),
  ];
  const sectionSummary = [
    form.applicant_name || "Tap to fill in",
    form.payee_name ? `${form.payee_name} · ${form.payment_method}` : "Tap to fill in",
    form.ministry ? `${form.ministry}${form.purpose ? ` · ${form.purpose.slice(0, 28)}` : ""}` : "Tap to fill in",
    displayAmount > 0 ? `${isTravelClaim ? "Travel" : "General"} · ${formatCurrency(displayAmount)}` : "Tap to add items",
    attachments.length > 0 ? `${attachments.length} file(s) attached` : "Optional",
    (form.sig_applicant_confirm && applicantSigData) ? "Signed & confirmed ✓" : "Tap to sign & confirm",
  ];

  // ── Shared: attachments UI ──────────────────────────────────────────────
  const AttachmentsUI = (
    <div className="space-y-3">
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors ${dragOver ? "border-[#4a6da7] bg-blue-50" : "border-stone-200"}`}
      >
        <Paperclip size={20} className="mx-auto text-stone-300 mb-2" />
        <p className="text-xs text-stone-400 mb-3">Attach receipts, invoices, or photos</p>
        <div className="flex flex-wrap justify-center gap-2">
          <label className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-stone-200 text-xs text-stone-600 cursor-pointer hover:bg-stone-50 transition-colors font-medium">
            <Upload size={12} /> Choose File
            <input type="file" accept="image/*,application/pdf" multiple className="hidden"
              onChange={e => { handleFiles(e.target.files); e.target.value = ""; }} />
          </label>
          <label className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-stone-200 text-xs text-stone-600 cursor-pointer hover:bg-stone-50 transition-colors font-medium">
            <Camera size={12} /> Take Photo
            <input type="file" accept="image/*" capture="environment" multiple className="hidden"
              onChange={e => { handleFiles(e.target.files); e.target.value = ""; }} />
          </label>
        </div>
      </div>
      {attachments.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {attachments.map((att, idx) => (
            <div key={idx} className="relative group">
              {(() => {
                const url = att.previewUrl || att.sourceUrl;
                const isImg = /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(url || att.file.name);
                const active = previewDocUrl === url;
                return isImg && url ? (
                  <button type="button" onClick={() => setPreviewDocUrl(active ? null : url)}
                    className={`h-20 rounded-xl overflow-hidden border w-full transition-colors ${active ? "border-[#4a6da7]" : "border-stone-200"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={att.name || att.file.name} className="w-full h-full object-cover" />
                  </button>
                ) : (
                  <button type="button" onClick={() => url && setPreviewDocUrl(active ? null : url)}
                    className={`h-20 rounded-xl border w-full flex flex-col items-center justify-center gap-1 px-1 transition-colors ${active ? "border-[#4a6da7] bg-blue-50" : "border-stone-200 bg-stone-50 hover:bg-blue-50 hover:border-[#4a6da7]/40"}`}>
                    <FileIcon size={20} className="text-[#4a6da7]" />
                    <span className="text-[9px] text-stone-500 text-center leading-tight break-all line-clamp-2">{att.name || att.file.name}</span>
                  </button>
                );
              })()}
              <button type="button" onClick={() => removeAttachment(idx)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white shadow border border-stone-200 flex items-center justify-center opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity z-10">
                <XIcon size={9} className="text-stone-600" />
              </button>
              <p className="text-[9px] text-stone-400 mt-0.5 text-center truncate">{att.sourceUrl ? "GM Claim" : formatFileSize(att.file.size)}</p>
            </div>
          ))}
        </div>
      )}
      {previewDocUrl && (
        <div className="mt-3 rounded-xl border border-[#4a6da7]/30 overflow-hidden bg-stone-50">
          {/\.(jpg|jpeg|png|webp|gif|heic)$/i.test(previewDocUrl)
            ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={previewDocUrl} alt="preview" className="max-w-full max-h-96 object-contain mx-auto block" />
            : <iframe src={previewDocUrl} className="w-full h-96 border-0" title="Document preview" />
          }
        </div>
      )}
    </div>
  );

  // ── Shared: e-signature UI ──────────────────────────────────────────────
  const SignatureUI = isFinanceAdmin ? (
    <div className="space-y-3 pt-3 border-t border-stone-100">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <PenLine size={14} className="text-[#4a6da7]" />
          <span className="text-sm font-semibold text-stone-700">Finance Executive E-Signature</span>
          {finSigData && <span className="text-[11px] text-green-600 font-medium">(captured)</span>}
        </div>
        <div className="flex gap-1">
          {(["draw", "upload"] as const).map(m => (
            <button key={m} type="button" onClick={() => setSigMode(m)}
              className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors capitalize ${sigMode === m ? "bg-[#4a6da7]/10 border-[#4a6da7]/30 text-[#4a6da7]" : "border-stone-200 text-stone-500 hover:bg-stone-50"}`}>
              {m}
            </button>
          ))}
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
              className="text-xs text-stone-500 border border-stone-200 px-2.5 py-1 rounded-lg hover:bg-stone-50 transition-colors flex items-center gap-1">
              <XIcon size={10} /> Clear
            </button>
            {savedSig && (
              <button type="button" onClick={() => loadSavedSigOnCanvas(savedSig)}
                className="text-xs text-[#4a6da7] border border-[#4a6da7]/30 px-2.5 py-1 rounded-lg hover:bg-blue-50 transition-colors flex items-center gap-1">
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
        <div className="flex items-center gap-3 p-2.5 bg-green-50 border border-green-200 rounded-xl">
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
  ) : null;

  // ── Mobile section content ──────────────────────────────────────────────
  const mobileSections: React.ReactNode[] = [

    // 0: Your Details
    <div key="s0" className="space-y-4">
      <div>
        <label className={mLabel}>Full Name <span className="text-red-400">*</span></label>
        <input className={mInput} value={form.applicant_name}
          onChange={e => setField("applicant_name", e.target.value)} placeholder="Your full name" />
      </div>
      <div>
        <label className={mLabel}>Email <span className="text-red-400">*</span></label>
        <input className={mInput} type="email" value={form.applicant_email}
          onChange={e => setField("applicant_email", e.target.value)} placeholder="your@email.com" />
      </div>
      <div>
        <label className={mLabel}>Date <span className="text-red-400">*</span></label>
        <input className={mInput} type="date" value={form.pvDate}
          onChange={e => setField("pvDate", e.target.value)} />
      </div>
    </div>,

    // 1: Payee & Payment
    <div key="s1" className="space-y-4">
      <div>
        <label className={mLabel}>Payable To <span className="text-red-400">*</span></label>
        <input className={mInput} value={form.payee_name}
          onChange={e => setField("payee_name", e.target.value)} placeholder="Full name or company" />
      </div>
      <div>
        <label className={mLabel}>Payment Method</label>
        <div className="relative">
          <select className={`${mInput} appearance-none pr-10 cursor-pointer`} value={form.payment_method}
            onChange={e => setField("payment_method", e.target.value)}>
            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
        </div>
      </div>
      {isTransfer && <>
        <div>
          <label className={mLabel}>Payee Bank</label>
          <div className="relative">
            <select className={`${mInput} appearance-none pr-10 cursor-pointer`} value={form.payee_bank_name}
              onChange={e => setField("payee_bank_name", e.target.value)}>
              <option value="">— Select bank —</option>
              {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
          </div>
        </div>
        <div>
          <label className={mLabel}>Account Number <span className="text-red-400">*</span></label>
          <input className={mInput} value={form.payee_bank_acct}
            onChange={e => setField("payee_bank_acct", e.target.value)} placeholder="Bank account number" />
        </div>
      </>}
      {isCheque && (
        <div>
          <label className={mLabel}>Cheque No.</label>
          <input className={mInput} value={form.cheque_no}
            onChange={e => setField("cheque_no", e.target.value)} placeholder="Cheque number" />
        </div>
      )}
      {isJomPay && (
        <div>
          <label className={mLabel}>Biller Code</label>
          <input className={mInput} value={form.biller_code}
            onChange={e => setField("biller_code", e.target.value)} placeholder="JomPay biller code" />
        </div>
      )}
    </div>,

    // 2: Ministry & Purpose
    <div key="s2" className="space-y-4">
      {pvType !== "HLE" && (
        <div>
          <label className={mLabel}>Ministry <span className="text-red-400">*</span></label>
          {pvType === "LSC" ? (
            <div className={`${mInput} text-stone-500 bg-stone-50`}>Luther Study Centre</div>
          ) : (
            <div className="relative">
              <select className={`${mInput} appearance-none pr-10 cursor-pointer`} value={form.ministry}
                onChange={e => { setField("ministry", e.target.value); setField("project", ""); }}>
                <option value="">— Select ministry —</option>
                {MINISTRIES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
            </div>
          )}
        </div>
      )}
      <div>
        <label className={mLabel}>Project <span className="text-stone-300 font-normal normal-case">(optional)</span></label>
        {form.ministry && projects.length > 0 ? (
          <div className="relative">
            <select className={`${mInput} appearance-none pr-10 cursor-pointer`} value={form.project}
              onChange={e => setField("project", e.target.value)}>
              <option value="">— Select project —</option>
              {projects.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
          </div>
        ) : (
          <input className={mInput} disabled={!form.ministry} value={form.project}
            onChange={e => setField("project", e.target.value)}
            placeholder={form.ministry ? "No projects set up — type or leave blank" : "Select ministry first"} />
        )}
        {canManageProjects && form.ministry && (
          <a href={budgetManageUrl} target="_blank" className="text-[11px] text-[#4a6da7] hover:underline font-medium mt-1 inline-block">
            + Manage projects
          </a>
        )}
      </div>
      <div>
        <label className={mLabel}>Purpose <span className="text-red-400">*</span></label>
        <input className={mInput} value={form.purpose}
          onChange={e => setField("purpose", e.target.value)}
          placeholder="e.g. Monthly Cost of Living Allowance" />
      </div>
    </div>,

    // 3: Claim Items
    <div key="s3" className="space-y-4">
      <datalist id="lcm-locations">
        {customLocations.map(l => <option key={l} value={l} />)}
      </datalist>

      {/* Travel toggle */}
      <button type="button" onClick={() => setIsTravelClaim(t => !t)}
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border font-semibold text-sm transition-colors ${
          isTravelClaim ? "bg-[#7C4A0A] text-white border-transparent" : "border-[#7C4A0A] text-[#7C4A0A] bg-white"
        }`}>
        <Car size={15} /> {isTravelClaim ? "Switch to General Claim" : "Switch to Travel Claim"}
      </button>

      {isTravelClaim ? (
        <div className="space-y-3">
          {travelItems.map((item, idx) => (
            <div key={idx} className="border border-stone-200 rounded-2xl p-4 space-y-3 bg-amber-50/30">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-500 uppercase tracking-wide">Item {idx + 1}</span>
                {travelItems.length > 1 && (
                  <button type="button" onClick={() => removeTravelItem(idx)} className="text-stone-300 hover:text-red-400 p-1 transition-colors">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div>
                <label className={mLabel}>Date</label>
                <input type="date" className={mInput} value={item.date || form.pvDate}
                  onChange={e => updateTravelItem(idx, { date: e.target.value })} />
              </div>
              <div>
                <label className={mLabel}>Type</label>
                <div className="relative">
                  <select className={`${mInput} appearance-none pr-10 cursor-pointer`} value={item.travel_type}
                    onChange={e => updateTravelItem(idx, { travel_type: e.target.value as TravelType | "", description: "", from: "", to: "", km: 0, amount: 0 })}>
                    <option value="">— Select type —</option>
                    {TRAVEL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                </div>
              </div>
              {item.travel_type === "mileage" ? <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={mLabel}>From</label>
                    <input list="lcm-locations" className={mInput} placeholder="From" value={item.from}
                      onChange={e => updateTravelItem(idx, { from: e.target.value })} />
                  </div>
                  <div>
                    <label className={mLabel}>To</label>
                    <input list="lcm-locations" className={mInput} placeholder="To" value={item.to}
                      onChange={e => updateTravelItem(idx, { to: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className={mLabel}>Distance (km)</label>
                  <input type="number" min="0" step="0.1" className={mInput} placeholder="0"
                    value={item.km || ""}
                    onChange={e => updateTravelItem(idx, { km: Number(e.target.value) })} />
                  {item.km > 0 && (
                    <p className="text-xs text-[#7C4A0A] font-semibold mt-1.5">
                      = RM {(item.km * MILEAGE_RATE).toFixed(2)} (RM{MILEAGE_RATE.toFixed(2)}/km)
                    </p>
                  )}
                </div>
              </> : item.travel_type ? <>
                <div>
                  <label className={mLabel}>Description</label>
                  <input className={mInput} value={item.description}
                    placeholder={
                      item.travel_type === "petrol"  ? "e.g. Petrol — Tapah to Cameron Highlands"
                      : item.travel_type === "train"   ? "e.g. KL Sentral → Ipoh (KTM)"
                      : "e.g. KL → Kota Kinabalu (AirAsia)"
                    }
                    onChange={e => updateTravelItem(idx, { description: e.target.value })} />
                </div>
                <div>
                  <label className={mLabel}>Amount (RM)</label>
                  <input type="number" min="0" step="0.01" className={mInput} placeholder="0.00"
                    value={item.amount || ""}
                    onChange={e => updateTravelItem(idx, { amount: Number(e.target.value) })} />
                </div>
              </> : null}
            </div>
          ))}
          <button type="button" onClick={addTravelItem}
            className="w-full flex items-center justify-center gap-2 py-3.5 border-2 border-dashed border-stone-200 rounded-2xl text-sm text-stone-400 hover:border-stone-300 hover:text-stone-500 transition-colors">
            <Plus size={14} /> Add travel item
          </button>
          <button type="button" onClick={() => setShowLocationMgr(s => !s)}
            className="text-xs text-[#7C4A0A] hover:underline font-medium w-full text-center py-1">
            {showLocationMgr ? "Close location editor" : "Edit location suggestions"}
          </button>
          {showLocationMgr && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
              <p className="text-[11px] font-semibold text-amber-900">Location suggestions</p>
              <div className="flex flex-wrap gap-1.5">
                {customLocations.map(loc => (
                  <span key={loc} className="flex items-center gap-1 text-xs bg-white border border-stone-200 px-2 py-0.5 rounded-full">
                    {loc}
                    <button type="button" onClick={() => removeLocation(loc)} className="text-stone-300 hover:text-red-400 ml-0.5"><XIcon size={9} /></button>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input value={newLocation} onChange={e => setNewLocation(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addLocation(); } }}
                  placeholder="Add new location…"
                  className="flex-1 text-xs border-b border-amber-300 bg-transparent outline-none py-1 focus:border-[#7C4A0A] placeholder:text-stone-300" />
                <button type="button" onClick={addLocation} className="text-xs text-[#7C4A0A] font-semibold hover:underline shrink-0">+ Add</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {form.line_items.map((item, idx) => (
            <div key={idx} className="border border-stone-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-500 uppercase tracking-wide">Item {idx + 1}</span>
                {form.line_items.length > 1 && (
                  <button type="button" onClick={() => removeLineItem(idx)} className="text-stone-300 hover:text-red-400 p-1 transition-colors">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div>
                <label className={mLabel}>Date</label>
                <input type="date" className={mInput} value={item.date || form.pvDate}
                  onChange={e => updateLineItem(idx, "date", e.target.value)} />
              </div>
              <div>
                <label className={mLabel}>Description</label>
                <input className={mInput} value={item.description}
                  placeholder="Description of item / service"
                  onChange={e => updateLineItem(idx, "description", e.target.value)} />
              </div>
              <div>
                <label className={mLabel}>Amount (RM)</label>
                <input type="number" min="0" step="0.01" className={mInput} placeholder="0.00"
                  value={item.amount || ""}
                  onChange={e => updateLineItem(idx, "amount", e.target.value)} />
              </div>
            </div>
          ))}
          <button type="button" onClick={addLineItem}
            className="w-full flex items-center justify-center gap-2 py-3.5 border-2 border-dashed border-stone-200 rounded-2xl text-sm text-stone-400 hover:border-stone-300 hover:text-stone-500 transition-colors">
            <Plus size={14} /> Add item
          </button>
        </div>
      )}

      {displayAmount > 0 && (
        <div className="flex items-center justify-between p-3.5 bg-stone-50 rounded-xl border border-stone-100">
          <span className="text-sm text-stone-600">Total</span>
          <span className="text-base font-bold text-stone-800">{formatCurrency(displayAmount)}</span>
        </div>
      )}
      {displayAmount > 0 && (
        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
          <Info size={13} className="mt-0.5 shrink-0" />
          <span><strong>Approval:</strong> {loa.label} — {loa.required} signatory{loa.required > 1 ? "ies" : ""} needed.</span>
        </div>
      )}
    </div>,

    // 4: Supporting Documents
    AttachmentsUI,

    // 5: Declaration
    <div key="s5" className="space-y-4">
      <p className="text-xs text-stone-500 leading-relaxed bg-stone-50 p-3 rounded-xl border border-stone-100">
        I hereby declare that the information provided is true and accurate, and that this payment is for legitimate
        church-related expenses in accordance with LCM&apos;s financial policies.
      </p>
      <div>
        <label className={mLabel}>Signature <span className="text-red-400">*</span></label>
        <div className="border-2 border-dashed border-stone-300 rounded-2xl overflow-hidden bg-white" style={{ touchAction: "none" }}>
          <canvas
            ref={applicantCanvasRef}
            width={400} height={130}
            className="w-full cursor-crosshair"
            onMouseDown={startApplicantDraw} onMouseMove={drawApplicant}
            onMouseUp={stopApplicantDraw} onMouseLeave={stopApplicantDraw}
            onTouchStart={startApplicantDraw} onTouchMove={drawApplicant} onTouchEnd={stopApplicantDraw}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5 px-0.5">
          <p className="text-[11px] text-stone-400">Sign above with your finger</p>
          {applicantSigData && (
            <button type="button" onClick={clearApplicantCanvas}
              className="text-[11px] text-stone-400 hover:text-red-400 flex items-center gap-1 transition-colors">
              <XIcon size={10} /> Clear
            </button>
          )}
        </div>
      </div>
      <label className="flex items-start gap-3 cursor-pointer p-3 bg-stone-50 rounded-xl border border-stone-100">
        <input type="checkbox" className="mt-0.5 accent-[#4a6da7] w-4 h-4 shrink-0"
          checked={form.sig_applicant_confirm}
          onChange={e => setField("sig_applicant_confirm", e.target.checked)} />
        <span className="text-sm text-stone-600">I confirm the above declaration and that all details are correct</span>
      </label>
      {SignatureUI}
    </div>,
  ];

  // ── MOBILE RENDER ───────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="min-h-screen bg-stone-50">
        {/* Sticky progress header */}
        <div className="sticky top-0 z-10 bg-white border-b border-stone-100 px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-stone-800">Submit Payment Voucher</h1>
            {pvType === "BAM" && <span className="text-xs font-bold px-2 py-0.5 rounded border border-stone-800 text-stone-800">BAM (MAYBANK)</span>}
            {pvType === "LSC" && <span className="text-xs font-bold px-2 py-0.5 rounded border border-stone-800 text-stone-800">LSC (RHB)</span>}
            {pvType === "HLE" && <span className="text-xs font-bold px-2 py-0.5 rounded border border-stone-800 text-stone-800">Highlands (MAYBANK)</span>}
          </div>
          <div className="flex gap-1 mt-2.5">
            {SECTION_TITLES.map((_, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${
                sectionComplete[i] ? "bg-[#4a6da7]" : i === openSection ? "bg-[#4a6da7]/40" : "bg-stone-200"
              }`} />
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {claimBanner && (
            <div className="mx-4 mt-4 flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm">
              <span className="text-green-700 font-semibold shrink-0">📋 {claimBanner.claim_no || "GM Claim"}</span>
              <span className="text-green-800 flex-1 text-xs">Creating PV for GM Claim — Claimant: <strong>{claimBanner.claimant}</strong></span>
              <button type="button" onClick={() => setClaimBanner(null)} className="text-green-400 text-xs shrink-0">Clear</button>
            </div>
          )}
          {prBanner && (
            <div className="mx-4 mt-4 flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm">
              <span className="text-blue-600 font-semibold shrink-0">📋 {prBanner.request_no}</span>
              <span className="text-blue-800 flex-1 text-xs">Raising PV for: <strong>{prBanner.title}</strong></span>
              <button type="button" onClick={() => setPrBanner(null)} className="text-blue-400 text-xs shrink-0">Clear</button>
            </div>
          )}
          {worksheetBanner && (
            <div className="mx-4 mt-4 flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm">
              <span className="text-green-700 font-semibold shrink-0">🖊 {worksheetBanner.worksheet_no}</span>
              <span className="text-green-800 flex-1 text-xs">Raising PV for worksheet — <strong>{worksheetBanner.worker_name}</strong>. Signed worksheet attached.</span>
              <button type="button" onClick={() => setWorksheetBanner(null)} className="text-green-400 text-xs shrink-0">Clear</button>
            </div>
          )}

          <div className="p-4 space-y-3 pb-10">
            {SECTION_TITLES.map((title, i) => (
              <div key={i} className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
                <button
                  type="button"
                  onClick={() => setOpenSection(openSection === i ? -1 : i)}
                  className="w-full flex items-center gap-3 px-4 py-4 text-left"
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    sectionComplete[i]
                      ? "bg-green-500 text-white"
                      : i === openSection
                        ? "bg-[#4a6da7] text-white"
                        : "bg-stone-100 text-stone-500"
                  } text-xs font-bold transition-colors`}>
                    {sectionComplete[i] ? <CheckCircle size={14} /> : i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-stone-800">{title}</div>
                    {openSection !== i && (
                      <div className="text-xs text-stone-400 truncate mt-0.5">{sectionSummary[i]}</div>
                    )}
                  </div>
                  <ChevronDown size={16} className={`text-stone-400 transition-transform shrink-0 ${openSection === i ? "rotate-180" : ""}`} />
                </button>

                {openSection === i && (
                  <div className="px-4 pb-5 border-t border-stone-100">
                    <div className="pt-4">{mobileSections[i]}</div>
                    {i < SECTION_TITLES.length - 1 && (
                      <button type="button" onClick={() => setOpenSection(i + 1)}
                        className="mt-4 w-full py-3 rounded-xl bg-stone-100 text-stone-700 text-sm font-semibold hover:bg-stone-200 transition-colors">
                        Next: {SECTION_TITLES[i + 1]} →
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Submit area */}
            <div className="space-y-3 pt-1">
              {displayAmount > 0 && (
                <div className="flex items-center justify-between px-4 py-3 bg-stone-50 rounded-xl border border-stone-100">
                  <span className="text-sm text-stone-500">Total Amount</span>
                  <span className="text-base font-bold text-stone-800">{formatCurrency(displayAmount)}</span>
                </div>
              )}
              {error && <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}
              {success && <div className="px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 font-medium">{success}</div>}
              <button type="submit" disabled={submitting}
                className="w-full py-4 bg-[#4a6da7] hover:bg-[#3d5a8e] text-white text-sm font-semibold rounded-xl shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                {submitting ? "Submitting…" : "Submit Payment Voucher"}
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  // ── DESKTOP RENDER ──────────────────────────────────────────────────────
  const isBuildingManagerRole = userRole === "BUILDING_MANAGER";
  const canSubmitBAM = isFinanceAdmin || isBuildingManagerRole;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-stone-800">Submit Payment Voucher</h1>
        <p className="text-xs text-stone-400 mt-0.5">Fill in all required fields and submit for Finance review</p>
      </div>

      {/* PV Type toggle — Finance Exec can choose; Building Manager is locked to BAM */}
      {canSubmitBAM && (
        <div className="mb-5 flex flex-wrap gap-2">
          {!isBuildingManagerRole && (
            <button type="button" onClick={() => setPvType("LCM")}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${pvType === "LCM" ? "bg-[#4a6da7] text-white border-[#4a6da7]" : "bg-white text-stone-600 border-stone-300 hover:border-[#4a6da7]"}`}>
              LCM PV
            </button>
          )}
          <button type="button" onClick={() => { setPvType("BAM"); setForm(f => ({ ...f, ministry: f.ministry || "Property" })); }}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${pvType === "BAM" ? "bg-[#4a6da7] text-white border-[#4a6da7]" : "bg-white text-stone-600 border-stone-300 hover:border-[#4a6da7]"}`}>
            BAM PV <span className="text-[10px] opacity-80">(MAYBANK)</span>
          </button>
          {!isBuildingManagerRole && (
            <button type="button" onClick={() => { setPvType("LSC"); setForm(f => ({ ...f, ministry: "Luther Study Centre" })); }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${pvType === "LSC" ? "bg-[#4a6da7] text-white border-[#4a6da7]" : "bg-white text-stone-600 border-stone-300 hover:border-[#4a6da7]"}`}>
              LSC <span className="text-[10px] opacity-80">(RHB)</span>
            </button>
          )}
          {!isBuildingManagerRole && (
            <button type="button" onClick={() => { setPvType("HLE"); setForm(f => ({ ...f, ministry: "" })); }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${pvType === "HLE" ? "bg-[#4a6da7] text-white border-[#4a6da7]" : "bg-white text-stone-600 border-stone-300 hover:border-[#4a6da7]"}`}>
              Highlands <span className="text-[10px] opacity-80">(MAYBANK)</span>
            </button>
          )}
        </div>
      )}

      {claimBanner && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm">
          <span className="text-green-700 font-semibold shrink-0">📋 {claimBanner.claim_no || "GM Claim"}</span>
          <span className="text-green-800 flex-1">Creating PV for GM Claim — Claimant: <strong>{claimBanner.claimant}</strong></span>
          <button type="button" onClick={() => setClaimBanner(null)} className="text-green-400 hover:text-green-600 text-xs">Clear</button>
        </div>
      )}
      {prBanner && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm">
          <span className="text-blue-600 font-semibold shrink-0">📋 {prBanner.request_no}</span>
          <span className="text-blue-800 flex-1">Raising PV for: <strong>{prBanner.title}</strong></span>
          <button type="button" onClick={() => setPrBanner(null)} className="text-blue-400 hover:text-blue-600 text-xs">Clear</button>
        </div>
      )}
      {worksheetBanner && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm">
          <span className="text-green-700 font-semibold shrink-0">🖊 {worksheetBanner.worksheet_no}</span>
          <span className="text-green-800 flex-1">Raising PV for worksheet — <strong>{worksheetBanner.worker_name}</strong>. Signed worksheet attached as supporting document.</span>
          <button type="button" onClick={() => setWorksheetBanner(null)} className="text-green-400 hover:text-green-600 text-xs">Clear</button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="bg-white border border-stone-300 shadow-md rounded-sm print:shadow-none">

          {/* Header */}
          <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b-2 border-stone-800">
            <div className="flex items-center gap-3">
              <LutherRose size={70} />
              <div className="hidden sm:block">
                {pvType === "HLE" ? (
                  <>
                    <div className="text-[10px] font-bold text-stone-600 uppercase tracking-wide">Highlands Lakeview Enterprises Sdn. Bhd.</div>
                    <div className="text-[9px] text-stone-400">Managed by Lutheran Church in Malaysia</div>
                  </>
                ) : pvType === "LSC" ? (
                  <>
                    <div className="text-[10px] font-bold text-stone-600 uppercase tracking-wide">Lutheran Church in Malaysia</div>
                    <div className="text-[9px] text-stone-400">Luther Study Centre</div>
                  </>
                ) : (
                  <>
                    <div className="text-[10px] font-bold text-stone-600 uppercase tracking-wide">Lutheran Church in Malaysia</div>
                    <div className="text-[9px] text-stone-400">马来西亚基督教信义会</div>
                  </>
                )}
              </div>
            </div>
            <div className="text-right flex flex-col items-end gap-1">
              <table className="border border-stone-800 text-xs">
                <tbody>
                  <tr><td className="border border-stone-800 px-2 py-1 font-bold bg-stone-50" colSpan={2}>For Office Use Only:</td></tr>
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
              {pvType === "BAM" && (
                <div className="border-2 border-stone-800 text-center min-w-[90px]">
                  <div className="text-2xl font-black text-stone-900 px-3 py-1">BAM</div>
                  <div className="text-[10px] font-bold text-stone-700 border-t border-stone-800 px-2 py-0.5">(MAYBANK)</div>
                </div>
              )}
              {pvType === "LSC" && (
                <div className="border-2 border-stone-800 text-center min-w-[90px]">
                  <div className="text-2xl font-black text-stone-900 px-3 py-1">LSC</div>
                  <div className="text-[10px] font-bold text-stone-700 border-t border-stone-800 px-2 py-0.5">(RHB)</div>
                </div>
              )}
              {pvType === "HLE" && (
                <div className="border-2 border-stone-800 text-center min-w-[90px]">
                  <div className="text-lg font-black text-stone-900 px-3 py-1 leading-tight">HLE</div>
                  <div className="text-[10px] font-bold text-stone-700 border-t border-stone-800 px-2 py-0.5">(MAYBANK)</div>
                </div>
              )}
            </div>
          </div>

          {/* Bilingual title */}
          <div className="text-center py-3 border-b-2 border-stone-800 px-4">
            {pvType === "HLE" ? (
              <p className="text-xs font-bold uppercase tracking-wide leading-relaxed">
                HIGHLANDS LAKEVIEW ENTERPRISES SDN. BHD. (REIMBURSEMENT CLAIM FORM / PAYMENT VOUCHER)
              </p>
            ) : pvType === "LSC" ? (
              <>
                <p className="text-xs font-bold uppercase tracking-wide leading-relaxed">
                  LUTHERAN CHURCH IN MALAYSIA — LUTHER STUDY CENTRE (REIMBURSEMENT CLAIM FORM / PAYMENT VOUCHER)
                </p>
                <p className="text-xs font-bold mt-0.5">马来西亚基督教信义会 — 路德研究中心（费用报销 / 付款凭证表格）</p>
              </>
            ) : (
              <>
                <p className="text-xs font-bold uppercase tracking-wide leading-relaxed">
                  LUTHERAN CHURCH IN MALAYSIA (REIMBURSEMENT CLAIM FORM / PAYMENT VOUCHER)
                </p>
                <p className="text-xs font-bold mt-0.5">马来西亚基督教信义会（费用报销 / 付款凭证表格）</p>
              </>
            )}
          </div>

          {/* Main form fields */}
          <div className="px-3 sm:px-6 py-4 space-y-0">
            <Row label="Applicant 申请者" sublabel="Full name of submitter">
              <input className={uline} value={form.applicant_name}
                onChange={e => setField("applicant_name", e.target.value)} placeholder="Your full name" required />
              <div className="shrink-0 flex items-end gap-2 whitespace-nowrap">
                <span className="text-sm font-semibold text-stone-700">Date 日期:</span>
                <input type="date" className={`${uline} w-36`} value={form.pvDate}
                  onChange={e => setField("pvDate", e.target.value)} required />
              </div>
            </Row>

            <Row label="Email 电邮">
              <input className={uline} type="email" value={form.applicant_email}
                onChange={e => setField("applicant_email", e.target.value)} placeholder="applicant@lcm.org.my" required />
            </Row>

            <Row label="Payable to 付给" sublabel="Person or company to be paid">
              <input className={uline} value={form.payee_name}
                onChange={e => setField("payee_name", e.target.value)} placeholder="Full name / company name" required />
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
                  onChange={e => setField("payee_bank_acct", e.target.value)} placeholder="Account number" required={isTransfer} />
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

            {pvType !== "HLE" && (
              <Row label="Ministry 事工" sublabel="Select ministry / department">
                {pvType === "LSC" ? (
                  <span className={`${uline} text-stone-500`}>Luther Study Centre</span>
                ) : (
                  <InlineSelect value={form.ministry} onChange={v => { setField("ministry", v); setField("project", ""); }}>
                    <option value="">— Select ministry —</option>
                    {MINISTRIES.map(m => <option key={m} value={m}>{m}</option>)}
                  </InlineSelect>
                )}
              </Row>
            )}

            <Row label="Project 计划" sublabel="Sub-project or budget code">
              {form.ministry ? (
                projects.length > 0 ? (
                  <div className="flex-1 flex items-end gap-2">
                    <InlineSelect value={form.project} onChange={v => setField("project", v)}>
                      <option value="">— Select project (optional) —</option>
                      {projects.map(p => <option key={p} value={p}>{p}</option>)}
                    </InlineSelect>
                    {canManageProjects && (
                      <a href={budgetManageUrl} target="_blank" className="shrink-0 text-[10px] text-[#4a6da7] hover:underline whitespace-nowrap font-medium">+ Manage</a>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex items-end gap-2">
                    <input className={`${uline} flex-1`} value={form.project}
                      onChange={e => setField("project", e.target.value)} placeholder="No projects set up yet — type or leave blank" />
                    {canManageProjects && (
                      <a href={budgetManageUrl} target="_blank" className="shrink-0 text-[10px] text-[#4a6da7] hover:underline whitespace-nowrap font-medium">+ Add projects</a>
                    )}
                  </div>
                )
              ) : (
                <input className={uline} disabled placeholder="Select ministry first" />
              )}
            </Row>

            <Row label="Purpose 用途" sublabel="Describe what this payment is for">
              <input className={uline} value={form.purpose}
                onChange={e => setField("purpose", e.target.value)} placeholder="e.g. Monthly Cost of Living Allowance" required />
            </Row>
          </div>

          {/* Particulars table */}
          <div className="px-3 sm:px-6 pb-2">
            <div className="flex items-center justify-between mb-2 mt-1">
              <p className="text-xs font-semibold text-stone-500">
                Particulars of Claim / Payment
                <span className="text-stone-400 font-normal ml-1">(Please attach relevant Receipts / Invoices / Bills)</span>
              </p>
              <button type="button" onClick={() => setIsTravelClaim(t => !t)}
                className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors shrink-0 ml-3 ${
                  isTravelClaim ? "bg-[#7C4A0A] text-white border-transparent" : "border-[#7C4A0A] text-[#7C4A0A] hover:bg-amber-50"
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
                          <input type="date" className="w-full outline-none text-xs text-stone-600 bg-transparent border-0 py-0.5"
                            value={item.date || form.pvDate} onChange={e => updateTravelItem(idx, { date: e.target.value })} />
                        </td>
                        <td className="border border-stone-800 px-1 py-0.5">
                          <select value={item.travel_type}
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
                                <input list="lcm-locations" className="outline-none text-xs bg-transparent border-b border-stone-300 flex-1 min-w-0 focus:border-[#4a6da7] placeholder:text-stone-300" placeholder="From" value={item.from} onChange={e => updateTravelItem(idx, { from: e.target.value })} />
                                <span className="text-stone-400 text-xs shrink-0">→</span>
                                <input list="lcm-locations" className="outline-none text-xs bg-transparent border-b border-stone-300 flex-1 min-w-0 focus:border-[#4a6da7] placeholder:text-stone-300" placeholder="To" value={item.to} onChange={e => updateTravelItem(idx, { to: e.target.value })} />
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-stone-400 text-[10px] shrink-0">KM:</span>
                                <input type="number" min="0" step="0.1" className="outline-none text-xs bg-transparent border-b border-stone-300 w-20 focus:border-[#4a6da7] placeholder:text-stone-300" placeholder="0" value={item.km || ""} onChange={e => updateTravelItem(idx, { km: Number(e.target.value) })} />
                              </div>
                            </div>
                          ) : (
                            <input className="w-full outline-none text-xs bg-transparent border-0 py-0.5 placeholder:text-stone-300"
                              placeholder={item.travel_type === "petrol" ? "e.g. Petrol — Tapah to Cameron Highlands" : item.travel_type === "train" ? "e.g. KL Sentral → Ipoh (KTM)" : item.travel_type === "airfare" ? "e.g. KL → Kota Kinabalu (AirAsia)" : "Description"}
                              value={item.description} onChange={e => updateTravelItem(idx, { description: e.target.value })} />
                          )}
                        </td>
                        <td className="border border-stone-800 px-1 py-0.5">
                          {item.travel_type === "mileage" ? (
                            <div className="text-right text-sm text-stone-600 bg-stone-50 py-0.5 px-1 tabular-nums font-medium select-none">
                              {item.km > 0 ? (item.km * MILEAGE_RATE).toFixed(2) : "—"}
                            </div>
                          ) : (
                            <input type="number" min="0" step="0.01" className="w-full outline-none text-sm text-right bg-transparent border-0 py-0.5 placeholder:text-stone-300" placeholder="0.00" value={item.amount || ""} onChange={e => updateTravelItem(idx, { amount: Number(e.target.value) })} />
                          )}
                        </td>
                        <td className="border border-stone-800 px-1 py-0.5 text-center print:hidden">
                          {travelItems.length > 1 && (
                            <button type="button" onClick={() => removeTravelItem(idx)} className="text-stone-300 hover:text-red-400 transition-colors p-0.5"><Trash2 size={12} /></button>
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
                      <td colSpan={4} className="border border-stone-800 px-3 py-1.5 text-right text-sm font-bold">TOTAL AMOUNT 总数额</td>
                      <td className="border border-stone-800 px-2 py-1.5 text-right text-sm font-bold text-stone-800">{displayAmount > 0 ? displayAmount.toFixed(2) : "—"}</td>
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
                          <input type="date" className="w-full outline-none text-xs text-stone-600 bg-transparent border-0 py-0.5" value={item.date || form.pvDate} onChange={e => updateLineItem(idx, "date", e.target.value)} />
                        </td>
                        <td className="border border-stone-800 px-1 py-0.5">
                          <input className="w-full outline-none text-sm bg-transparent border-0 py-0.5 placeholder:text-stone-300" placeholder="Description of item / service" value={item.description} onChange={e => updateLineItem(idx, "description", e.target.value)} />
                        </td>
                        <td className="border border-stone-800 px-1 py-0.5">
                          <input type="number" min="0" step="0.01" className="w-full outline-none text-sm text-right bg-transparent border-0 py-0.5 placeholder:text-stone-300" placeholder="0.00" value={item.amount || ""} onChange={e => updateLineItem(idx, "amount", e.target.value)} />
                        </td>
                        <td className="border border-stone-800 px-1 py-0.5 text-center print:hidden">
                          {form.line_items.length > 1 && (
                            <button type="button" onClick={() => removeLineItem(idx)} className="text-stone-300 hover:text-red-400 transition-colors p-0.5"><Trash2 size={12} /></button>
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
                      <td colSpan={3} className="border border-stone-800 px-3 py-1.5 text-right text-sm font-bold">TOTAL AMOUNT 总数额</td>
                      <td className="border border-stone-800 px-2 py-1.5 text-right text-sm font-bold text-stone-800">{displayAmount > 0 ? displayAmount.toFixed(2) : "—"}</td>
                      <td className="border border-stone-800 print:hidden" />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

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
                      <button type="button" onClick={() => removeLocation(loc)} className="text-stone-300 hover:text-red-400 transition-colors ml-0.5"><XIcon size={9} /></button>
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input value={newLocation} onChange={e => setNewLocation(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addLocation(); } }}
                    placeholder="Type new location and press Enter or + Add"
                    className="flex-1 text-xs border-b border-amber-300 bg-transparent outline-none py-0.5 focus:border-[#7C4A0A] placeholder:text-stone-300" />
                  <button type="button" onClick={addLocation} className="text-xs text-[#7C4A0A] font-semibold hover:underline shrink-0">+ Add</button>
                </div>
              </div>
            )}
          </div>

          {/* LOA indicator */}
          {displayAmount > 0 && (
            <div className="px-6 pb-3 print:hidden">
              <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                <Info size={13} className="mt-0.5 shrink-0" />
                <span><strong>Approval required:</strong> {loa.label} — {loa.required} signatory{loa.required > 1 ? "ies" : ""} needed. Total: <strong>{formatCurrency(displayAmount)}</strong></span>
              </div>
            </div>
          )}

          {/* Supporting Documents */}
          <div className="px-3 sm:px-6 py-4 border-t border-stone-200 print:hidden">
            <div className="flex items-center gap-2 mb-3">
              <Paperclip size={13} className="text-stone-500" />
              <span className="text-sm font-semibold text-stone-700">Supporting Documents</span>
              <span className="text-xs text-stone-400">(Receipts, Invoices, Bills — optional)</span>
            </div>
            {AttachmentsUI}
          </div>

          {/* Declaration */}
          <div className="px-3 sm:px-6 py-4 border-t-2 border-stone-800 space-y-3 print:hidden">
            <p className="text-xs text-stone-500 leading-relaxed">
              I hereby declare that the information provided is true and accurate, and that this payment is for legitimate
              church-related expenses in accordance with LCM&apos;s financial policies.
            </p>
            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">Your Full Name (as signature) <span className="text-red-400">*</span></label>
              <input className="w-full border-b border-stone-400 bg-transparent outline-none text-sm px-1 py-1 focus:border-[#4a6da7] transition-colors"
                value={form.sig_applicant_name} onChange={e => setField("sig_applicant_name", e.target.value)} required />
            </div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" className="mt-0.5 accent-[#4a6da7] w-3.5 h-3.5"
                checked={form.sig_applicant_confirm} onChange={e => setField("sig_applicant_confirm", e.target.checked)} />
              <span className="text-xs text-stone-600">I confirm the above declaration and that all details are correct</span>
            </label>
          </div>

          {/* Finance Executive E-Signature */}
          {isFinanceAdmin && (
            <div className="px-3 sm:px-6 py-4 border-t border-stone-200">{SignatureUI}</div>
          )}

        </div>

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
