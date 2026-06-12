"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Eye, EyeOff } from "lucide-react";

const ROLES = [
  { value: "FINANCE_ADMIN",   label: "Finance Executive",  color: "bg-blue-100 text-blue-800 border-blue-200" },
  { value: "FINANCE_ADMIN_2", label: "Accounts Executive", color: "bg-blue-100 text-blue-800 border-blue-200" },
  { value: "GENERAL_MANAGER", label: "General Manager",    color: "bg-purple-100 text-purple-800 border-purple-200" },
  { value: "BISHOP",          label: "Bishop",             color: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  { value: "TREASURER",       label: "Treasurer",          color: "bg-green-100 text-green-800 border-green-200" },
  { value: "SECRETARY",       label: "Secretary",          color: "bg-teal-100 text-teal-800 border-teal-200" },
  { value: "MINISTRY_HEAD",   label: "EXCO Member",        color: "bg-amber-100 text-amber-800 border-amber-200" },
  { value: "STAFF",           label: "Staff",              color: "bg-stone-100 text-stone-600 border-stone-200" },
];

const PIN_ROLES = ["BISHOP", "TREASURER", "SECRETARY", "GENERAL_MANAGER", "MINISTRY_HEAD"];

const inp = "border border-stone-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#4a6da7] bg-white w-full";

export default function SwitchRolePage() {
  const supabase = createClient();
  const router = useRouter();
  const [currentRole, setCurrentRole] = useState("");
  const [email, setEmail] = useState("");
  const [ministries, setMinistries] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedMinistries, setSelectedMinistries] = useState<string[]>([]);
  const [hasPin, setHasPin] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [toastOk, setToastOk] = useState(true);

  // PIN section
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [savingPin, setSavingPin] = useState(false);

  function showToast(msg: string, ok = true) {
    setToast(msg); setToastOk(ok);
    setTimeout(() => setToast(""), 3000);
  }

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setEmail(user.email ?? "");

        const [{ data: profile }, { data: mins }] = await Promise.all([
          supabase.from("user_roles").select("role,ministries,has_pin").eq("email", user.email).single(),
          supabase.from("ministries").select("name").order("name"),
        ]);

        setCurrentRole(profile?.role ?? "STAFF");
        setHasPin(profile?.has_pin ?? false);
        setSelectedRole(profile?.role ?? "STAFF");
        setSelectedMinistries(profile?.ministries ?? []);
        setMinistries((mins ?? []).map((m: { name: string }) => m.name));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function apply() {
    setSwitching(true);
    try {
      const mins = selectedRole === "MINISTRY_HEAD" ? selectedMinistries : [];
      await supabase
        .from("user_roles")
        .upsert({ email, role: selectedRole, ministries: mins }, { onConflict: "email" });

      setCurrentRole(selectedRole);
      showToast(`Switched to ${ROLES.find(r => r.value === selectedRole)?.label}`);
      router.refresh();
    } finally {
      setSwitching(false);
    }
  }

  async function savePin() {
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      showToast("PIN must be exactly 6 digits", false); return;
    }
    if (pin !== pinConfirm) {
      showToast("PINs do not match", false); return;
    }
    setSavingPin(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      // Call set-pin in self-service mode (no target_user_id)
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/set-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ pin }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Failed to save PIN");
      setHasPin(true);
      setPin(""); setPinConfirm("");
      showToast("PIN saved — you can now approve as a signatory");
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed", false);
    } finally {
      setSavingPin(false);
    }
  }

  if (loading) return <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>;

  const currentLabel = ROLES.find(r => r.value === currentRole)?.label ?? currentRole;
  const needsPin = PIN_ROLES.includes(selectedRole) && selectedRole !== "GENERAL_MANAGER";

  return (
    <div className="p-5 max-w-lg mx-auto space-y-5">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm shadow-lg text-white ${toastOk ? "bg-green-600" : "bg-red-500"}`}>
          {toast}
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-xl">🧪</div>
        <div>
          <h1 className="text-xl font-bold text-stone-800">Test Role Switcher</h1>
          <p className="text-sm text-stone-400">
            Currently: <strong className="text-[#4a6da7]">{currentLabel}</strong>
            {hasPin && <span className="ml-2 text-xs text-green-600 font-medium">✓ PIN set</span>}
          </p>
        </div>
      </div>

      {/* Role grid */}
      <div className="grid grid-cols-2 gap-2">
        {ROLES.map(r => (
          <button
            key={r.value}
            onClick={() => { setSelectedRole(r.value); setSelectedMinistries([]); }}
            className={`py-3 px-4 rounded-xl text-sm font-medium border-2 transition-all text-left ${
              selectedRole === r.value
                ? "border-amber-400 bg-amber-50 text-amber-900 shadow-sm"
                : "border-stone-200 text-stone-600 hover:border-stone-300 bg-white"
            }`}
          >
            <div>{r.label}</div>
            {selectedRole === r.value && currentRole !== r.value && (
              <div className="text-xs text-amber-600 mt-0.5">← switching to</div>
            )}
            {currentRole === r.value && (
              <div className="text-xs text-[#4a6da7] mt-0.5">← current</div>
            )}
          </button>
        ))}
      </div>

      {/* Ministry selection for EXCO */}
      {selectedRole === "MINISTRY_HEAD" && ministries.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <div className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Assign Ministries</div>
          <div className="grid grid-cols-2 gap-y-2 gap-x-4">
            {ministries.map(m => (
              <label key={m} className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer">
                <input type="checkbox" className="accent-[#4a6da7] w-4 h-4"
                  checked={selectedMinistries.includes(m)}
                  onChange={e => setSelectedMinistries(prev =>
                    e.target.checked ? [...prev, m] : prev.filter(x => x !== m)
                  )} />
                {m}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Switch button */}
      <button
        onClick={apply}
        disabled={switching || selectedRole === currentRole}
        className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-semibold text-sm transition-colors"
      >
        {switching ? "Switching…" : selectedRole === currentRole
          ? `Already ${currentLabel}`
          : `Switch to ${ROLES.find(r => r.value === selectedRole)?.label}`}
      </button>

      {/* PIN section — shown when a signatory role needs a PIN */}
      {needsPin && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div>
            <div className="text-sm font-semibold text-blue-900">
              {hasPin ? "✓ Approval PIN is set for your account" : "⚠ Set your Approval PIN"}
            </div>
            <div className="text-xs text-blue-700 mt-0.5">
              {hasPin
                ? "You can update it below if needed. Use this PIN when approving PVs."
                : `${ROLES.find(r => r.value === selectedRole)?.label} role requires a PIN to approve PVs. Set it here for your test account (${email}).`}
            </div>
          </div>

          <div className="space-y-2">
            <div>
              <label className="text-xs text-stone-600 block mb-1">6-digit PIN</label>
              <div className="relative">
                <input
                  className={`${inp} tracking-[0.4em] text-lg pr-10`}
                  type={showPin ? "text" : "password"}
                  maxLength={6}
                  placeholder="••••••"
                  value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
                <button type="button" onClick={() => setShowPin(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                  {showPin ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-stone-600 block mb-1">Confirm PIN</label>
              <input
                className={`${inp} tracking-[0.4em] text-lg`}
                type="password"
                maxLength={6}
                placeholder="••••••"
                value={pinConfirm}
                onChange={e => setPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </div>
            <button
              onClick={savePin}
              disabled={savingPin || pin.length < 6}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-40"
            >
              {savingPin ? "Saving…" : hasPin ? "Update PIN" : "Save PIN"}
            </button>
          </div>

          {hasPin && (
            <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              ✓ PIN is set — switch to {ROLES.find(r => r.value === selectedRole)?.label} role and use this PIN when approving
            </div>
          )}
        </div>
      )}

      {selectedRole === "GENERAL_MANAGER" && (
        <div className="text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded-xl px-3 py-2">
          ℹ General Manager does not require a PIN — you can approve PVs and PRs directly
        </div>
      )}

      <button
        onClick={() => router.push("/dashboard")}
        className="w-full py-2.5 rounded-xl border border-stone-200 text-stone-600 text-sm hover:bg-stone-50 transition-colors"
      >
        ← Back to Dashboard
      </button>

      <p className="text-xs text-stone-400 text-center">
        This page is for testing only. The PIN set here applies to your account ({email}).
      </p>
    </div>
  );
}
