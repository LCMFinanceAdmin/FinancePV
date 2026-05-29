"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

export default function SwitchRolePage() {
  const supabase = createClient();
  const router = useRouter();
  const [currentRole, setCurrentRole] = useState("");
  const [currentMinistries, setCurrentMinistries] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [ministries, setMinistries] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedMinistries, setSelectedMinistries] = useState<string[]>([]);
  const [switching, setSwitching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setEmail(user.email ?? "");

        const [{ data: profile }, { data: mins }] = await Promise.all([
          supabase.from("user_roles").select("role,ministries").eq("email", user.email).single(),
          supabase.from("ministries").select("name").order("name"),
        ]);

        setCurrentRole(profile?.role ?? "STAFF");
        setCurrentMinistries(profile?.ministries ?? []);
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
        .update({ role: selectedRole, ministries: mins })
        .eq("email", email);

      setCurrentRole(selectedRole);
      setCurrentMinistries(mins);
      setToast(`Switched to ${ROLES.find(r => r.value === selectedRole)?.label}`);
      setTimeout(() => setToast(""), 2000);
      router.refresh();
    } finally {
      setSwitching(false);
    }
  }

  if (loading) return (
    <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>
  );

  const currentLabel = ROLES.find(r => r.value === currentRole)?.label ?? currentRole;

  return (
    <div className="p-5 max-w-lg mx-auto space-y-5">
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 bg-green-600 text-white rounded-xl text-sm shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-xl">🧪</div>
        <div>
          <h1 className="text-xl font-bold text-stone-800">Test Role Switcher</h1>
          <p className="text-sm text-stone-400">Currently: <strong className="text-[#4a6da7]">{currentLabel}</strong></p>
        </div>
      </div>

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

      {selectedRole === "MINISTRY_HEAD" && ministries.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <div className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Assign Ministries</div>
          <div className="grid grid-cols-2 gap-y-2 gap-x-4">
            {ministries.map(m => (
              <label key={m} className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-[#4a6da7] w-4 h-4"
                  checked={selectedMinistries.includes(m)}
                  onChange={e => setSelectedMinistries(prev =>
                    e.target.checked ? [...prev, m] : prev.filter(x => x !== m)
                  )}
                />
                {m}
              </label>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={apply}
        disabled={switching || selectedRole === currentRole}
        className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-semibold text-sm transition-colors"
      >
        {switching
          ? "Switching…"
          : selectedRole === currentRole
          ? `Already ${currentLabel}`
          : `Switch to ${ROLES.find(r => r.value === selectedRole)?.label}`}
      </button>

      <button
        onClick={() => router.push("/dashboard")}
        className="w-full py-2.5 rounded-xl border border-stone-200 text-stone-600 text-sm hover:bg-stone-50 transition-colors"
      >
        ← Back to Dashboard
      </button>

      <p className="text-xs text-stone-400 text-center">
        This page is for testing only. Changes take effect immediately on next navigation.
      </p>
    </div>
  );
}
