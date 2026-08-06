"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { excoAssignableMinistries } from "@/lib/ministries";
import { Plus, Trash2, Save, ShieldCheck, Eye, EyeOff, RotateCcw } from "lucide-react";

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
  // Church directory. Position and employment sit alongside the system role
  // above — a pastor elected to EXCO is MINISTRY_HEAD with is_pastor true.
  is_lcm_staff: boolean;
  is_pastor: boolean;
  designation: string | null;
  congregation_id: string | null;
  reports_to: "BISHOP_ONLY" | "GM_AND_BISHOP";
}

interface Congregation {
  id: string; name: string; district_id: string | null; head_pastor_email: string | null;
}
interface District { id: string; name: string; dean_email: string | null; }

/**
 * Plain-English version of resolveLeaveApprovers() in lib/leave-approvers.ts,
 * shown while editing a person so a wrong congregation or missing Dean is
 * caught here rather than when someone's leave goes to the wrong person.
 * Kept in step with that function by hand — it describes the same three rules.
 */
function describeLeaveChain(
  u: UserRole,
  congregations: Congregation[],
  districts: District[],
  people: UserRole[],
): string {
  const nameOf = (email?: string | null) =>
    people.find(p => p.email?.toLowerCase() === email?.toLowerCase())?.full_name || email || "";
  const bishop = people.find(p => p.role === "BISHOP");
  const bishopLabel = bishop && bishop.email !== u.email ? `${bishop.full_name || "the Bishop"} (Bishop)` : null;

  if (!u.is_lcm_staff) return "not applicable — this person isn't employed by LCM.";

  if (u.is_pastor) {
    const cong = congregations.find(c => c.id === u.congregation_id);
    if (!cong) return "no congregation set, so only the Bishop — assign one to route through the head pastor or Dean.";
    const district = districts.find(d => d.id === cong.district_id);
    const isHead = cong.head_pastor_email?.toLowerCase() === u.email?.toLowerCase();

    // The head pastor settles routine pastoral leave — the Bishop is only
    // involved when it escalates to the Dean below.
    if (cong.head_pastor_email && !isHead) {
      return `${nameOf(cong.head_pastor_email)} (head pastor, ${cong.name}) — that's the full chain.`;
    }
    // No head pastor, or this person is the head pastor — the Dean takes it.
    if (district?.dean_email && district.dean_email.toLowerCase() !== u.email?.toLowerCase()) {
      const why = isHead ? "they are the head pastor" : `${cong.name} has no head pastor`;
      return [`${nameOf(district.dean_email)} (Dean, ${district.name})`, bishopLabel].filter(Boolean).join(" → ") + ` — because ${why}.`;
    }
    return bishopLabel ? `${bishopLabel} only — no head pastor or Dean applies.` : "nobody — no head pastor, Dean or Bishop is set.";
  }

  const gm = people.find(p => p.role === "GENERAL_MANAGER");
  const gmLabel = u.reports_to !== "BISHOP_ONLY" && gm && gm.email !== u.email
    ? `${gm.full_name || "the General Manager"} (GM)` : null;
  const chain = [gmLabel, bishopLabel].filter(Boolean);
  return chain.length ? chain.join(" → ") : "nobody — no GM or Bishop is set.";
}

export default function SignatoriesPage() {
  const supabase = createClient();
  const [users, setUsers] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [pinModal, setPinModal] = useState<{ userId: string; email: string } | null>(null);
  const [ministries, setMinistries] = useState<string[]>([]);
  const [congregations, setCongregations] = useState<Congregation[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);

  async function load() {
    const [{ data: ur }, { data: min }, { data: cong }, { data: dist }] = await Promise.all([
      supabase.from("user_roles")
        .select("id,email,full_name,role,ministries,has_pin,is_lcm_staff,is_pastor,designation,congregation_id,reports_to")
        .order("role"),
      supabase.from("ministries").select("name").order("name"),
      supabase.from("congregations").select("*").order("name"),
      supabase.from("districts").select("*").order("name"),
    ]);
    setUsers(ur ?? []);
    setCongregations((cong ?? []) as Congregation[]);
    setDistricts((dist ?? []) as District[]);
    // Only standing committees can be assigned to an EXCO Member — offices,
    // payee groupings and finance functions are filtered out.
    setMinistries(excoAssignableMinistries((min ?? []).map((m: { name: string }) => m.name)));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(""), 2500); }

  async function saveUser(u: UserRole) {
    setSaving(true);
    const profile = {
      full_name: u.full_name, role: u.role, ministries: u.ministries,
      is_lcm_staff: u.is_lcm_staff, is_pastor: u.is_pastor,
      designation: u.designation || null,
      // A congregation only means something for a pastor, so it is cleared
      // rather than left dangling if the flag is turned off.
      congregation_id: u.is_pastor ? (u.congregation_id || null) : null,
      reports_to: u.reports_to,
    };
    if (u.id.startsWith("new-")) {
      const { error } = await supabase.from("user_roles").insert({ email: u.email, ...profile });
      if (error) { showToast("Error: " + error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("user_roles").update(profile).eq("id", u.id);
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

  // Clear a signatory's PIN so they set a fresh one themselves on their own
  // page. We never see the new value — this is the "forgot their PIN" reset.
  async function resetPin(userId: string, email: string) {
    if (!confirm(`Reset the approval PIN for ${email}?\n\nTheir current PIN stops working immediately, and they set a new one themselves from their approval page. You will not see the new PIN.`)) return;
    setSaving(true);
    const session = (await supabase.auth.getSession()).data.session;
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/set-pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ target_user_id: userId, reset: true }),
    });
    const result = await res.json();
    setSaving(false);
    if (!res.ok) { showToast("Error: " + result.error); return; }
    await load();
    showToast(`PIN reset — ${email} can now set a new one`);
  }

  if (loading) return <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>;

  return (
    <div className="cloudlight-page max-w-5xl space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#4f7fc3]">Administration</p>
          <h1 className="text-xl font-bold text-stone-800">Signatories & Roles</h1>
          <p className="text-sm text-stone-400">Manage who can access and approve in the system</p>
        </div>
        <Button size="sm" onClick={() => setUsers(u => [...u, {
          id: `new-${Date.now()}`, email: "", full_name: "", role: "STAFF", ministries: [], has_pin: false,
          is_lcm_staff: true, is_pastor: false, designation: null, congregation_id: null,
          reports_to: "GM_AND_BISHOP",
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
                  <label className="text-xs text-stone-400">
                    Email
                    {u.email && !u.email.endsWith("@lcm.org.my") && (
                      <span className="ml-1.5 text-[10px] text-amber-600 font-medium">(uses magic link login)</span>
                    )}
                  </label>
                  <input className={inp} value={u.email} placeholder="name@lcm.org.my or personal email" disabled={!u.id.startsWith("new-")}
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

              {/* ── Church directory ────────────────────────────────────── */}
              <div className="rounded-xl border border-[#dbe9fb] bg-[#f8fbff] p-3 space-y-3">
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer">
                    <input type="checkbox" className="accent-[#4a6da7] w-4 h-4"
                      checked={u.is_lcm_staff}
                      onChange={e => setUsers(us => us.map(x => x.id === u.id ? { ...x, is_lcm_staff: e.target.checked } : x))} />
                    Employed by LCM
                  </label>
                  <label className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer">
                    <input type="checkbox" className="accent-[#4a6da7] w-4 h-4"
                      checked={u.is_pastor}
                      onChange={e => setUsers(us => us.map(x => x.id === u.id ? { ...x, is_pastor: e.target.checked } : x))} />
                    Pastor
                  </label>
                  {!u.is_lcm_staff && (
                    <span className="text-xs text-amber-700">
                      No leave, staff loans or payroll — volunteer access only.
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-stone-400">Designation</label>
                    <input className={inp} value={u.designation ?? ""} placeholder="e.g. Finance Executive, Pastor"
                      onChange={e => setUsers(us => us.map(x => x.id === u.id ? { ...x, designation: e.target.value } : x))} />
                  </div>
                  {u.is_pastor ? (
                    <div>
                      <label className="text-xs text-stone-400">Congregation</label>
                      <select className={inp} value={u.congregation_id ?? ""}
                        onChange={e => setUsers(us => us.map(x => x.id === u.id ? { ...x, congregation_id: e.target.value || null } : x))}>
                        <option value="">— none —</option>
                        {congregations.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="text-xs text-stone-400">Reports to (for leave)</label>
                      <select className={inp} value={u.reports_to}
                        onChange={e => setUsers(us => us.map(x => x.id === u.id ? { ...x, reports_to: e.target.value as UserRole["reports_to"] } : x))}>
                        <option value="GM_AND_BISHOP">General Manager and Bishop</option>
                        <option value="BISHOP_ONLY">Bishop only</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* The resulting approval chain, so a wrong setting is caught
                    here rather than when someone's leave goes astray. */}
                <p className="text-xs text-stone-500">
                  <span className="font-semibold text-stone-600">Leave goes to:</span>{" "}
                  {describeLeaveChain(u, congregations, districts, users)}
                </p>
              </div>

              <div className="flex gap-2 items-center pt-1 border-t border-stone-100">
                <Button size="sm" variant="secondary" loading={saving} onClick={() => saveUser(u)}>
                  <Save size={13} /> Save
                </Button>
                {/* EXCO Members (MINISTRY_HEAD) no longer use an approval PIN —
                    their verification is evidenced by a drawn signature. */}
                {["BISHOP", "TREASURER", "SECRETARY"].includes(u.role) && !u.id.startsWith("new-") && (
                  u.has_pin ? (
                    <Button size="sm" variant="ghost" loading={saving} onClick={() => resetPin(u.id, u.email)}>
                      <RotateCcw size={13} /> Reset PIN
                    </Button>
                  ) : (
                    <Button size="sm" variant="primary" onClick={() => setPinModal({ userId: u.id, email: u.email })}>
                      <ShieldCheck size={13} /> Set Initial PIN
                    </Button>
                  )
                )}
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => deleteUser(u.id)}>
                  <Trash2 size={13} className="text-red-400" />
                </Button>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="rounded-2xl border border-[#dbe9fb] bg-[#f4f9ff] p-4 text-xs text-stone-500">
        <strong>How approval PINs work:</strong> Signatories (Bishop, Treasurer, Secretary) use a 6-digit PIN as a second confirmation when approving PVs. Each person <strong>sets and changes their own PIN privately</strong> from their Signatory Queue page, so nobody else knows it. If someone forgets their PIN, use <strong>Reset PIN</strong> here to clear it; they then set a new one themselves (you never see it). <strong>Set Initial PIN</strong> is only offered for someone who has never set one.
        <br /><br />
        <strong>EXCO Members don&apos;t use a PIN.</strong> They verify payment requests by drawing their signature, which is printed on the resulting payment voucher as proof the ministry examined the expense.
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4 backdrop-blur-[2px]">
      <div className="w-full max-w-sm space-y-4 rounded-3xl border border-[#dbe9fb] bg-[#fbfdff] p-6 shadow-[0_24px_70px_rgba(22,51,94,0.24)]">
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
