"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardBody } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { PurchaseRequest } from "@/lib/types";
import {
  ShieldCheck, Upload, CheckCircle, XCircle,
  AlertCircle, ImagePlus, Trash2, Eye, X as XIcon,
  UserCircle2, ShoppingCart, FileText,
} from "lucide-react";
import Image from "next/image";

const SIGNATORY_ROLES = ["BISHOP", "TREASURER", "SECRETARY", "GENERAL_MANAGER"];
const MINISTRIES = [
  "Mission", "Social Concern", "Education", "Education Desk", "Stewardship", "Orang Asli",
  "Property", "Head Quarters (HQ)", "Reconcile", "Trustees",
  "Building Asset Management (BAM)",
  "Sisters and Women Fellowship (SWF)", "Young Adult and Youth (YAY)",
];
const ROLE_LABELS: Record<string, string> = {
  BISHOP: "Bishop", TREASURER: "Treasurer",
  SECRETARY: "Secretary", GENERAL_MANAGER: "General Manager",
  FINANCE_ADMIN: "Finance Executive", FINANCE_ADMIN_2: "Accounts Executive",
  FINANCE_ADMIN_3: "Finance Executive 3",
};

interface Signatory {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_authorized: boolean;
  has_pin: boolean;
  signature_url: string | null;
  signature_path: string | null;
}

interface MinistryHead {
  email: string;
  full_name: string;
  ministries: string[];
}

interface Stats {
  pending_review: number;
  pending_signatory: number;
  approved_month: number;
  paid_month: number;
  paid_amount: number;
}

export default function ControlCenterPage() {
  return (
    <Suspense>
      <ControlCenterInner />
    </Suspense>
  );
}

function ControlCenterInner() {
  const supabase = createClient();
  const router = useRouter();

  const [signatories, setSignatories] = useState<Signatory[]>([]);
  const [ministryHeads, setMinistryHeads] = useState<MinistryHead[]>([]);
  const [stats, setStats] = useState<Stats>({ pending_review: 0, pending_signatory: 0, approved_month: 0, paid_month: 0, paid_amount: 0 });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ msg: "", ok: true });
  const [prs, setPrs] = useState<PurchaseRequest[]>([]);
  const [prTab, setPrTab] = useState<"submitted" | "approved">("submitted");
  const [assigningMinistry, setAssigningMinistry] = useState<string | null>(null);
  const [assignEmail, setAssignEmail] = useState("");
  const [assignSaving, setAssignSaving] = useState(false);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast({ msg: "", ok: true }), 3000);
  }

  async function load() {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    const [{ data: sigs }, pending, pendingSig, approvedMonth, paidMonth, { data: heads }] = await Promise.all([
      supabase.from("user_roles").select("id,email,full_name,role,is_authorized,has_pin,signature_url,signature_path").in("role", SIGNATORY_ROLES).order("role"),
      supabase.from("pvs").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
      supabase.from("pvs").select("id", { count: "exact", head: true }).eq("status", "PENDING_SIGNATORY"),
      supabase.from("pvs").select("id", { count: "exact", head: true }).in("status", ["APPROVED"]).gte("updated_at", monthStart),
      supabase.from("pvs").select("amount").eq("status", "PAID").gte("paid_at", monthStart),
      supabase.from("user_roles").select("email,full_name,ministries").not("ministries", "is", null),
    ]);

    setSignatories(sigs ?? []);
    setMinistryHeads((heads ?? []).filter((h: MinistryHead) => h.ministries && h.ministries.length > 0));
    const paidAmt = (paidMonth.data ?? []).reduce((s: number, r: { amount: number }) => s + (r.amount || 0), 0);
    setStats({
      pending_review: pending.count ?? 0,
      pending_signatory: pendingSig.count ?? 0,
      approved_month: approvedMonth.count ?? 0,
      paid_month: (paidMonth.data ?? []).length,
      paid_amount: paidAmt,
    });
    // Load purchase requests
    const { data: prData } = await supabase
      .from("purchase_requests")
      .select("*")
      .in("status", ["SUBMITTED", "APPROVED"])
      .order("submitted_at", { ascending: false });
    setPrs((prData ?? []) as PurchaseRequest[]);

    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function toggleAuthorization(sig: Signatory) {
    const newVal = !sig.is_authorized;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("user_roles").update({
      is_authorized: newVal,
      authorized_by: user?.email,
      authorized_at: new Date().toISOString(),
    }).eq("id", sig.id);
    setSignatories(ss => ss.map(s => s.id === sig.id ? { ...s, is_authorized: newVal } : s));
    showToast(`${sig.full_name} ${newVal ? "authorized" : "deauthorized"}`);
  }

  async function uploadSignature(sig: Signatory, file: File) {
    if (!file.type.startsWith("image/")) { showToast("Please upload an image file", false); return; }
    if (file.size > 2 * 1024 * 1024) { showToast("File must be under 2MB", false); return; }

    const path = `signatures/${sig.id}.${file.name.split(".").pop()}`;
    const { error: upErr } = await supabase.storage.from("signatures").upload(path, file, { upsert: true });
    if (upErr) { showToast("Upload failed: " + upErr.message, false); return; }

    const { data: { publicUrl } } = supabase.storage.from("signatures").getPublicUrl(path);
    await supabase.from("user_roles").update({ signature_url: publicUrl, signature_path: path }).eq("id", sig.id);
    setSignatories(ss => ss.map(s => s.id === sig.id ? { ...s, signature_url: publicUrl } : s));
    showToast(`Signature uploaded for ${sig.full_name}`);
  }

  async function removeSignature(sig: Signatory) {
    if (!sig.signature_path && sig.signature_url) {
      await supabase.from("user_roles").update({ signature_url: null, signature_path: null }).eq("id", sig.id);
    } else if (sig.signature_url) {
      const path = `signatures/${sig.id}`;
      await supabase.storage.from("signatures").remove([path]);
      await supabase.from("user_roles").update({ signature_url: null, signature_path: null }).eq("id", sig.id);
    }
    setSignatories(ss => ss.map(s => s.id === sig.id ? { ...s, signature_url: null } : s));
    showToast("Signature removed");
  }

  async function assignMinistry(ministry: string) {
    const email = assignEmail.trim().toLowerCase();
    if (!email) return;
    setAssignSaving(true);
    try {
      const { data, error } = await supabase.rpc("assign_ministry_head", {
        target_email: email,
        ministry_name: ministry,
        action: "add",
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      showToast(`Assigned ${email} to ${ministry}`);
      setAssigningMinistry(null);
      setAssignEmail("");
      await load();
    } catch (err: unknown) {
      showToast((err as Error).message, false);
    } finally {
      setAssignSaving(false);
    }
  }

  async function removeMinistryAssignment(ministry: string, email: string) {
    try {
      const { data, error } = await supabase.rpc("assign_ministry_head", {
        target_email: email,
        ministry_name: ministry,
        action: "remove",
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      showToast(`Removed ${email} from ${ministry}`);
      await load();
    } catch (err: unknown) {
      showToast((err as Error).message, false);
    }
  }

  // Build ministry → head map
  const ministryHeadMap: Record<string, { email: string; name: string }[]> = {};
  ministryHeads.forEach(h => {
    (h.ministries ?? []).forEach((m: string) => {
      if (!ministryHeadMap[m]) ministryHeadMap[m] = [];
      ministryHeadMap[m].push({ email: h.email, name: h.full_name });
    });
  });

  if (loading) return <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>;

  return (
    <div className="p-5 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-stone-800">Control Center</h1>
        <p className="text-sm text-stone-400">Finance Executive — system overview and signatory management</p>
      </div>

      {toast.msg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white ${toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.msg}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Pending Review"      value={stats.pending_review}    color="text-amber-600"  />
        <StatCard label="Awaiting Signature"  value={stats.pending_signatory} color="text-purple-600" />
        <StatCard label="Approved This Month" value={stats.approved_month}    color="text-green-600"  />
        <StatCard label="Paid This Month"     value={`${stats.paid_month} · ${formatCurrency(stats.paid_amount)}`} color="text-[#4a6da7]" />
      </div>

      {/* Ministry Head Assignments */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-stone-700">EXCO Member Assignments</h2>
          <a href="/settings/signatories" className="text-xs text-[#4a6da7] hover:underline font-medium">
            Manage Roles →
          </a>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          {MINISTRIES.map((ministry, idx) => {
            const assigned = ministryHeadMap[ministry] ?? [];
            const isAssigning = assigningMinistry === ministry;
            return (
              <div key={ministry} className={idx < MINISTRIES.length - 1 ? "border-b border-stone-100" : ""}>
                {/* Main row */}
                <div className="flex items-center justify-between px-4 py-2.5 gap-4">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <UserCircle2 size={15} className={assigned.length > 0 ? "text-[#4a6da7] shrink-0" : "text-stone-300 shrink-0"} />
                    <span className="text-sm font-medium text-stone-800 truncate">{ministry}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {assigned.length > 0 ? (
                      <div className="flex flex-col items-end gap-1">
                        {assigned.map(h => (
                          <div key={h.email} className="flex items-center gap-2">
                            <div className="text-right">
                              {h.name && h.name !== h.email && (
                                <div className="text-xs font-semibold text-stone-700 leading-tight">{h.name}</div>
                              )}
                              <div className="text-xs text-[#4a6da7]">{h.email}</div>
                            </div>
                            <button
                              onClick={() => removeMinistryAssignment(ministry, h.email)}
                              className="text-stone-300 hover:text-red-400 transition-colors"
                              title="Remove assignment"
                            >
                              <XIcon size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-stone-400 italic">Unassigned</span>
                    )}
                    <button
                      onClick={() => {
                        if (isAssigning) { setAssigningMinistry(null); setAssignEmail(""); }
                        else { setAssigningMinistry(ministry); setAssignEmail(""); }
                      }}
                      className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
                        isAssigning
                          ? "border-stone-300 text-stone-500 bg-stone-50"
                          : "border-[#4a6da7]/40 text-[#4a6da7] hover:bg-[#4a6da7]/5"
                      }`}
                    >
                      {isAssigning ? "Cancel" : assigned.length > 0 ? "+ Add" : "Assign"}
                    </button>
                  </div>
                </div>

                {/* Inline assign form */}
                {isAssigning && (
                  <div className="px-4 pb-3 flex items-center gap-2 bg-blue-50/50 border-t border-blue-100">
                    <div className="flex-1 relative">
                      <input
                        autoFocus
                        type="email"
                        className="w-full text-sm border border-stone-200 rounded-lg px-3 py-1.5 outline-none focus:border-[#4a6da7] bg-white placeholder:text-stone-300"
                        placeholder="Enter Google / email address"
                        value={assignEmail}
                        onChange={e => setAssignEmail(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") assignMinistry(ministry); if (e.key === "Escape") { setAssigningMinistry(null); setAssignEmail(""); } }}
                      />
                    </div>
                    <button
                      onClick={() => assignMinistry(ministry)}
                      disabled={assignSaving || !assignEmail.trim()}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#4a6da7] text-white hover:bg-[#3d5c96] disabled:opacity-40 transition-colors whitespace-nowrap"
                    >
                      {assignSaving ? "Saving…" : "Assign"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Authorised Signatories */}
      <div>
        <h2 className="text-base font-bold text-stone-700 mb-3">Authorised Signatories</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {signatories.map((sig) => (
            <SignatoryCard
              key={sig.id}
              sig={sig}
              onToggleAuth={() => toggleAuthorization(sig)}
              onUpload={(file) => uploadSignature(sig, file)}
              onRemoveSig={() => removeSignature(sig)}
            />
          ))}
          {signatories.length === 0 && (
            <div className="col-span-2 text-sm text-stone-400 py-6 text-center">
              No signatories found. Add them in Settings → Signatories & Roles.
            </div>
          )}
        </div>
      </div>

      {/* Purchase Requests */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-stone-700 flex items-center gap-2">
            <ShoppingCart size={16} className="text-[#4a6da7]" /> Purchase Requests
          </h2>
          <a href="/purchase-requests" className="text-xs text-[#4a6da7] hover:underline font-medium">View all →</a>
        </div>
        <div className="flex gap-1 bg-stone-100 rounded-xl p-1 w-fit mb-3">
          {(["submitted", "approved"] as const).map(t => {
            const count = prs.filter(p => p.status === t.toUpperCase()).length;
            return (
              <button key={t} onClick={() => setPrTab(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${prTab === t ? "bg-white text-stone-800 shadow-sm" : "text-stone-500"}`}>
                {t === "submitted" ? "Awaiting Approval" : "Approved — Raise PV"}
                {count > 0 && <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${t === "submitted" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>{count}</span>}
              </button>
            );
          })}
        </div>
        {(() => {
          const filtered = prs.filter(p => p.status === (prTab === "submitted" ? "SUBMITTED" : "APPROVED"));
          if (filtered.length === 0) return (
            <div className="text-sm text-stone-400 py-6 text-center bg-white border border-stone-200 rounded-xl">
              {prTab === "submitted" ? "No purchase requests awaiting GM/Signatory approval" : "No approved requests ready to raise a PV"}
            </div>
          );
          return (
            <div className="space-y-2">
              {filtered.map(pr => (
                <div key={pr.id} className="bg-white border border-stone-200 rounded-xl px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-semibold text-stone-500">{pr.request_no}</span>
                        <span className="text-xs bg-[#4a6da7]/10 text-[#4a6da7] px-2 py-0.5 rounded-full font-medium">{pr.ministry}</span>
                      </div>
                      <div className="text-sm font-semibold text-stone-800">{pr.title}</div>
                      <div className="text-xs text-stone-500">by {pr.submitted_by_name || pr.submitted_by_email} · {formatDate(pr.submitted_at)}</div>
                      {pr.vendor_name && <div className="text-xs text-stone-400">Vendor: {pr.vendor_name}</div>}
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <div className="text-sm font-bold text-stone-800">{formatCurrency(pr.estimated_amount)}</div>
                      {prTab === "approved" && (
                        <button
                          onClick={() => router.push(`/submit?pr_id=${pr.id}`)}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-[#4a6da7] hover:bg-[#3d5d8f] text-white font-medium transition-colors">
                          <FileText size={12} /> Raise PV
                        </button>
                      )}
                      {prTab === "submitted" && (
                        <span className="text-xs text-amber-600 font-medium">Awaiting GM/Sig</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Quick links */}
      <div>
        <h2 className="text-base font-bold text-stone-700 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { href: "/admin",                label: "Review PVs",          desc: "Process pending vouchers" },
            { href: "/recurring",            label: "Recurring Expenses",  desc: "Manage scheduled payments" },
            { href: "/signatory-activity",   label: "Signatory Activity",  desc: "View approval history" },
            { href: "/hod-activity",         label: "HOD Activity",        desc: "View HOD verifications" },
            { href: "/settings/signatories", label: "Manage Users",        desc: "Roles & approval PINs" },
            { href: "/budget",               label: "Ministry Budget",     desc: "View & manage budgets" },
          ].map((q) => (
            <a key={q.href} href={q.href} className="block p-3 bg-white border border-stone-200 rounded-xl hover:border-[#4a6da7]/40 hover:shadow-sm transition-all">
              <div className="text-sm font-semibold text-stone-700">{q.label}</div>
              <div className="text-xs text-stone-400 mt-0.5">{q.desc}</div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <Card>
      <CardBody className="py-3">
        <div className={`text-lg font-bold ${color}`}>{value}</div>
        <div className="text-xs text-stone-400 mt-0.5">{label}</div>
      </CardBody>
    </Card>
  );
}

function SignatoryCard({ sig, onToggleAuth, onUpload, onRemoveSig }: {
  sig: Signatory;
  onToggleAuth: () => void;
  onUpload: (f: File) => void;
  onRemoveSig: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewSig, setPreviewSig] = useState(false);

  return (
    <Card className={sig.is_authorized ? "border-stone-200" : "border-red-200 bg-red-50/30"}>
      <CardBody className="space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-bold text-stone-800">{sig.full_name || "—"}</div>
            <div className="text-xs text-stone-500">{sig.email}</div>
            <div className="text-xs text-[#4a6da7] font-medium mt-0.5">{ROLE_LABELS[sig.role] ?? sig.role}</div>
          </div>
          <button
            onClick={onToggleAuth}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
              sig.is_authorized
                ? "bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700"
                : "bg-red-100 text-red-700 hover:bg-green-100 hover:text-green-700"
            }`}
          >
            {sig.is_authorized ? <CheckCircle size={12} /> : <XCircle size={12} />}
            {sig.is_authorized ? "Authorized" : "Not Authorized"}
          </button>
        </div>

        {/* Status badges */}
        <div className="flex gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sig.has_pin ? "bg-blue-100 text-blue-700" : "bg-stone-100 text-stone-500"}`}>
            {sig.has_pin ? "PIN Set" : "No PIN"}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sig.signature_url ? "bg-purple-100 text-purple-700" : "bg-stone-100 text-stone-500"}`}>
            {sig.signature_url ? "Signature ✓" : "No Signature"}
          </span>
        </div>

        {/* Signature preview */}
        {sig.signature_url && previewSig && (
          <div className="relative w-full h-20 bg-stone-50 rounded-lg overflow-hidden border border-stone-200">
            <Image src={sig.signature_url} alt="Signature" fill className="object-contain p-2" />
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          {sig.signature_url ? (
            <>
              <button
                onClick={() => setPreviewSig(p => !p)}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 transition-colors"
              >
                <Eye size={12} /> {previewSig ? "Hide" : "Preview"}
              </button>
              <button
                onClick={onRemoveSig}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
              >
                <Trash2 size={12} /> Remove
              </button>
            </>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-[#4a6da7]/10 hover:bg-[#4a6da7]/20 text-[#4a6da7] transition-colors"
            >
              <ImagePlus size={12} /> Upload Signature
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); }}
          />
        </div>

        {!sig.is_authorized && (
          <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            <AlertCircle size={12} /> This signatory is not authorized to sign PVs.
          </div>
        )}
        {!sig.has_pin && (
          <div className="flex items-center gap-1.5 text-xs text-stone-500 bg-stone-50 rounded-lg px-3 py-2">
            <ShieldCheck size={12} /> No approval PIN set.
          </div>
        )}
      </CardBody>
    </Card>
  );
}
