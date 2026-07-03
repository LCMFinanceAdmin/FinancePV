"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Plus, Trash2, Save, ShieldCheck, Eye, EyeOff } from "lucide-react";

const ROLES = [
  "FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3",
  "GENERAL_MANAGER", "BISHOP", "TREASURER", "SECRETARY",
  "MINISTRY_HEAD", "BUILDING_MANAGER", "BAM_COMMITTEE", "STAFF",
];

const ROLE_LABELS: Record<string, string> = {
  FINANCE_ADMIN: "Finance Executive", FINANCE_ADMIN_2: "Accounts Executive",
  FINANCE_ADMIN_3: "Finance Executive 3", GENERAL_MANAGER: "General Manager",
  BISHOP: "Bishop", TREASURER: "Treasurer", SECRETARY: "Secretary",
  MINISTRY_HEAD: "EXCO Member", BUILDING_MANAGER: "Building / Event Manager",
  BAM_COMMITTEE: "BAM Committee", STAFF: "Staff",
};

interface UserRole {
  id: string;
  email: string;
  full_name: string;
  role: string;
  ministries: string[];
  has_pin: boolean;
}

export default function SignatoriesPage() {
  const supabase = createClient();
  const [users, setUsers] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [pinModal, setPinModal] = useState<{ userId: string; email: string } | null>(null);
  const [ministries, setMinistries] = useState<string[]>([]);

  async function load() {
    const [{ data: ur }, { data: min }] = await Promise.all([
      supabase.from("user_roles").select("id,email,full_name,role,ministries,has_pin").order("role"),
      supabase.from("ministries").select("name").order("name"),
    ]);
    setUsers(ur ?? []);
    setMinistries((min ?? []).map((m: { name: string }) => m.name));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(""), 2500); }

  async function saveUser(u: UserRole) {
    setSaving(true);
    if (u.id.startsWith("new-")) {
      const { error } = await supabase.from("user_roles").insert({
        email: u.email, full_name: u.full_name, role: u.role, ministries: u.ministries,
      });
      if (error) { showToast("Error: " + error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("user_roles").update({
        full_name: u.full_name, role: u.role, ministries: u.ministries,
      }).eq("id", u.id);
      if (error) { showToast("Error: " + error.message); setSaving(false); return; }
    }
    await load();
    setSaving(false);
    showToast("Saved");
  }

  async function deleteUser(id: string) {
    if (id.startsWith("new-")) { setUsers(u => u.filter(x => x.id !== id)); return; }
    await supabase.from("user_roles").delete().eq("id", id);
    setUsers(u => u.filter(x => x.id !== id));
    showToast("Removed");
  }

  if (loading) return <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>;

  return (
    <div className="p-5 max-w-2xl mx-auto space-y-5">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-xl font-bold text-stone-800">Signatories & Roles</h1>
          <p className="text-sm text-stone-400">Manage who can access and approve in the system</p>
        </div>
        <Button size="sm" onClick={() => setUsers(u => [...u, {
          id: `new-${Date.now()}`, email: "", full_name: "", role: "STAFF", ministries: [], has_pin: false,
        }])}>
          <Plus size={13} /> Add User
        </Button>
      </div>

      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 bg-green-600 text-white rounded-xl text-sm shadow-lg">{toast}</div>
      )}

      {pinModal && (
        <PinSetupModal
          userId={pinModal.userId}
          email={pinModal.email}
          onClose={() => { setPinModal(null); load(); }}
          showToast={showToast}
        />
      )}

      <div className="space-y-3">
        {users.map((u) => (
          <Card key={u.id}>
            <CardBody className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-stone-400">Full Name</label>
                  <input className={inp} value={u.full_name} placeholder="Full name"
                    onChange={(e) => setUsers(us => us.map(x => x.id === u.id ? { ...x, full_name: e.target.value } : x))} />
                </div>
                <div>
                  <label className="text-xs text-stone-400">Email (Google account)</label>
                  <input className={inp} value={u.email} placeholder="name@lcm.org.my" disabled={!u.id.startsWith("new-")}
                    onChange={(e) => setUsers(us => us.map(x => x.id === u.id ? { ...x, email: e.target.value } : x))} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-stone-400">Role</label>
                  <select className={inp} value={u.role}
                    onChange={(e) => setUsers(us => us.map(x => x.id === u.id ? { ...x, role: e.target.value } : x))}>
                    {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                </div>
                {(u.role === "MINISTRY_HEAD") && (
                  <div>
                    <label className="text-xs text-stone-400">Assigned Ministries</label>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {ministries.map((m) => (
                        <label key={m} className="flex items-center gap-1 text-xs cursor-pointer">
                          <input type="checkbox" className="accent-[#4a6da7]"
                            checked={u.ministries.includes(m)}
                            onChange={(e) => setUsers(us => us.map(x => x.id === u.id ? {
                              ...x, ministries: e.target.checked
                                ? [...x.ministries, m]
                                : x.ministries.filter(mi => mi !== m)
                            } : x))}
                          />
                          {m}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 items-center pt-1 border-t border-stone-100">
                <Button size="sm" variant="secondary" loading={saving} onClick={() => saveUser(u)}>
                  <Save size={13} /> Save
                </Button>
                {["BISHOP", "TREASURER", "SECRETARY", "GENERAL_MANAGER", "MINISTRY_HEAD"].includes(u.role) && !u.id.startsWith("new-") && (
                  <Button size="sm" variant={u.has_pin ? "ghost" : "primary"} onClick={() => setPinModal({ userId: u.id, email: u.email })}>
                    <ShieldCheck size={13} />
                    {u.has_pin ? "Change PIN" : "Set Approval PIN"}
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => deleteUser(u.id)}>
                  <Trash2 size={13} className="text-red-400" />
                </Button>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="text-xs text-stone-400 bg-stone-50 rounded-xl p-4">
        <strong>How approval PINs work:</strong> Signatories and EXCO Members use a 6-digit PIN as a second confirmation when approving or verifying PVs. Finance Executives set PINs for signatories here. EXCO Members set their own PIN from their EXCO Queue page.
      </div>
    </div>
  );
}

function PinSetupModal({ userId, email, onClose, showToast }: {
  userId: string; email: string;
  onClose: () => void; showToast: (m: string) => void;
}) {
  const supabase = createClient();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) { showToast("PIN must be exactly 6 digits"); return; }
    if (pin !== confirm) { showToast("PINs do not match"); return; }
    setSaving(true);

    const session = (await supabase.auth.getSession()).data.session;
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/set-pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ target_user_id: userId, pin }),
    });
    const result = await res.json();
    setSaving(false);
    if (!res.ok) { showToast("Error: " + result.error); return; }
    showToast(`PIN set for ${email}`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
        <div>
          <h2 className="text-base font-bold text-stone-800">Set Approval PIN</h2>
          <p className="text-xs text-stone-400 mt-0.5">For {email}</p>
        </div>
        <div>
          <label className="text-xs text-stone-500 mb-1 block">6-digit PIN</label>
          <div className="relative">
            <input
              className={`${inp} pr-10 tracking-widest text-lg`}
              type={show ? "text" : "password"}
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••••"
            />
            <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400">
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs text-stone-500 mb-1 block">Confirm PIN</label>
          <input
            className={`${inp} tracking-widest text-lg`}
            type="password"
            maxLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="••••••"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <Button className="flex-1" loading={saving} onClick={save}>Save PIN</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

const inp = "border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7] bg-white w-full";
