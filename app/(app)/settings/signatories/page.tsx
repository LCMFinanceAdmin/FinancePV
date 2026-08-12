"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { excoAssignableMinistries } from "@/lib/ministries";
import { Plus, Trash2, Save, ShieldCheck, Eye, EyeOff, RotateCcw, ChevronRight, Search, X } from "lucide-react";
import { fieldClass } from "@/lib/field-styles";

const ROLES = [
  "FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3",
  "GENERAL_MANAGER", "BISHOP", "TREASURER", "SECRETARY",
  "MINISTRY_HEAD", "BUILDING_MANAGER", "BAM_COMMITTEE", "ADMINISTRATOR", "STAFF",
];

const ROLE_LABELS: Record<string, string> = {
  FINANCE_ADMIN: "Finance Executive", FINANCE_ADMIN_2: "Accounts Executive",
  FINANCE_ADMIN_3: "Finance Executive 3", GENERAL_MANAGER: "General Manager",
  BISHOP: "Bishop", TREASURER: "Treasurer", SECRETARY: "Secretary",
  MINISTRY_HEAD: "EXCO Member", BUILDING_MANAGER: "Building / Event Manager",
  BAM_COMMITTEE: "BAM Committee", ADMINISTRATOR: "Administrator", STAFF: "Staff",
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
  council_president_name: string | null; council_president_email: string | null;
}
interface District { id: string; name: string; dean_email: string | null; }

/**
 * Plain-English version of resolveLeaveApprovers() in lib/leave-approvers.ts,
 * shown while editing a person so a wrong congregation or missing Dean is
 * caught here rather than when someone's leave goes to the wrong person.
 * Kept in step with that function by hand. It follows note 6 on the church's
 * leave form: pastors need their head pastor, the Council Chairman/Rep and
 * their Dean; a Dean needs the Bishop; everyone else answers to the GM
 * and/or Bishop.
 */
function describeLeaveChain(
  u: UserRole,
  congregations: Congregation[],
  districts: District[],
  people: UserRole[],
): string {
  const eqEmail = (a?: string | null, b?: string | null) =>
    !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
  const nameOf = (email?: string | null) =>
    people.find(p => p.email?.toLowerCase() === email?.toLowerCase())?.full_name || email || "";
  const bishop = people.find(p => p.role === "BISHOP");
  const bishopLabel = bishop && bishop.email !== u.email ? `${bishop.full_name || "the Bishop"} (Bishop)` : null;

  if (u.is_pastor) {
    const cong = congregations.find(c => c.id === u.congregation_id);
    const leadsDistrict = districts.find(d => eqEmail(d.dean_email, u.email));

    // Note 6(b) on the leave form: a Dean's own leave goes to the Bishop.
    if (leadsDistrict) {
      return bishopLabel
        ? `${bishopLabel} — a Dean's leave goes to the Bishop.`
        : "nobody — no Bishop is set.";
    }
    if (!cong) return "no congregation set — assign one so the head pastor, Council Chairman and Dean can be worked out.";

    const district = districts.find(d => d.id === cong.district_id);
    // Head pastor, Council Chairman/Rep and Dean — all three.
    const parts = [
      cong.head_pastor_email && !eqEmail(cong.head_pastor_email, u.email)
        ? `${nameOf(cong.head_pastor_email)} (Head Pastor, ${cong.name})`
        : null,
      cong.council_president_email
        ? `${cong.council_president_name || cong.council_president_email} (Council Chairman/Rep, ${cong.name}, by email)`
        : null,
      district?.dean_email && !eqEmail(district.dean_email, u.email)
        ? `${nameOf(district.dean_email)} (Dean, ${district.name})`
        : null,
    ].filter(Boolean);

    if (parts.length > 1) {
      const last = parts.pop();
      return `${parts.join(", ")} and ${last} — all must approve.`;
    }
    if (parts.length === 1) return `${parts[0]} only — the others are not set up yet.`;
    return bishopLabel
      ? `${bishopLabel} — no head pastor, Council Chairman or Dean is set, so it falls back to the Bishop.`
      : "nobody — no head pastor, Council Chairman, Dean or Bishop is set.";
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
  // Adding someone is a decision with several parts — a role, whether they are
  // employed, who signs their leave. A dialogue asks for them together instead
  // of dropping a blank row at the bottom of a list of forty people.
  const [addOpen, setAddOpen] = useState(false);
  const [ministries, setMinistries] = useState<string[]>([]);
  const [congregations, setCongregations] = useState<Congregation[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  // Collapsed by default — the list is long, and most visits are to change one
  // person. Only the row being edited is open.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  const toggle = (id: string) => setExpanded(s => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

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
    // Everyone here already exists — people are created through Add User.
    const { error } = await supabase.from("user_roles").update(profile).eq("id", u.id);
    if (error) { showToast("Error: " + error.message); setSaving(false); return; }
    await load();
    setSaving(false);
    showToast("Saved");
  }

  async function deleteUser(id: string) {
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

  // A row being edited stays visible even if the typed name no longer matches,
  // so a search doesn't yank unsaved changes off the screen.
  const q = query.trim().toLowerCase();
  const visible = q
    ? users.filter(u => expanded.has(u.id) || [
        u.full_name, u.email, u.designation, ROLE_LABELS[u.role] ?? u.role,
      ].some(f => (f ?? "").toLowerCase().includes(q)))
    : users;

  return (
    <div className="cloudlight-page max-w-5xl space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#4f7fc3]">Administration</p>
          <h1 className="text-xl font-bold text-stone-800">Signatories & Roles</h1>
          <p className="text-sm text-stone-400">Manage who can access and approve in the system</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
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

      {addOpen && (
        <AddUserModal
          roles={ROLES}
          roleLabels={ROLE_LABELS}
          ministries={ministries}
          congregations={congregations}
          districts={districts}
          users={users}
          onClose={() => setAddOpen(false)}
          onSaved={async (newId, name) => {
            setAddOpen(false);
            await load();
            // Open the person just added, so whatever still needs doing —
            // an initial PIN, a ministry — is in front of you.
            setExpanded(s => new Set(s).add(newId));
            setQuery("");
            showToast(`${name} added`);
          }}
        />
      )}

      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-300" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name, email or role…"
          className="w-full rounded-xl border-2 border-stone-800 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#2f5b9c]"
        />
      </div>

      <div className="space-y-2">
        {visible.length === 0 && (
          <p className="px-1 py-6 text-center text-sm text-stone-400">Nobody matches “{query}”.</p>
        )}

        {visible.map((u) => {
          const open = expanded.has(u.id);
          return (
          <div key={u.id} className="overflow-hidden rounded-2xl border border-[#e4edf9] bg-white shadow-[0_2px_10px_rgba(41,87,149,0.04)]">
            {/* Collapsed summary — enough to find someone without opening. */}
            <button type="button" onClick={() => toggle(u.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#f8fbff]">
              <ChevronRight size={15}
                className={`shrink-0 text-stone-300 transition-transform ${open ? "rotate-90" : ""}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-stone-800">
                    {u.full_name || <span className="text-stone-400">Unnamed</span>}
                  </span>
                  {!u.is_lcm_staff && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Volunteer</span>
                  )}
                  {u.is_pastor && (
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">Pastor</span>
                  )}
                  {["BISHOP", "TREASURER", "SECRETARY"].includes(u.role) && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      u.has_pin ? "bg-green-100 text-green-700" : "bg-stone-100 text-stone-500"
                    }`}>
                      {u.has_pin ? "PIN set" : "No PIN"}
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-stone-400">
                  {u.email || "no email yet"}{u.designation ? ` · ${u.designation}` : ""}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-[#eef4fd] px-2.5 py-1 text-[11px] font-semibold text-[#3a6db0]">
                {ROLE_LABELS[u.role] ?? u.role}
              </span>
            </button>

            {open && (
            <div className="space-y-3 border-t border-[#eaf1fb] px-4 py-4">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                  {/* The email *is* the login. Changing it here would leave the
                      account behind, so it is set once when the person is added. */}
                  <input className={inp} value={u.email} disabled />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                  ) : u.is_lcm_staff ? (
                    <div>
                      <label className="text-xs text-stone-400">Reports to (for leave)</label>
                      <select className={inp} value={u.reports_to}
                        onChange={e => setUsers(us => us.map(x => x.id === u.id ? { ...x, reports_to: e.target.value as UserRole["reports_to"] } : x))}>
                        <option value="GM_AND_BISHOP">General Manager and Bishop</option>
                        <option value="BISHOP_ONLY">Bishop only</option>
                      </select>
                    </div>
                  ) : null}
                </div>

                {/* Volunteers — a BAM Committee PIC, or a Treasurer who serves
                    without being employed — take no leave and report to nobody,
                    so none of that is asked. They are here purely to approve. */}
                {u.is_lcm_staff ? (
                  <p className="text-xs text-stone-500">
                    <span className="font-semibold text-stone-600">Leave goes to:</span>{" "}
                    {describeLeaveChain(u, congregations, districts, users)}
                  </p>
                ) : (
                  <p className="text-xs text-amber-700">
                    Volunteer — approvals only. No leave, staff loan or payroll access, and no
                    reporting line.
                  </p>
                )}
              </div>

              <div className="flex gap-2 items-center pt-1 border-t border-stone-100">
                <Button size="sm" variant="secondary" loading={saving} onClick={() => saveUser(u)}>
                  <Save size={13} /> Save
                </Button>
                {/* EXCO Members (MINISTRY_HEAD) no longer use an approval PIN —
                    their verification is evidenced by a drawn signature. */}
                {["BISHOP", "TREASURER", "SECRETARY"].includes(u.role) && (
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
            </div>
            )}
          </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-[#dbe9fb] bg-[#f4f9ff] p-4 text-xs text-stone-500">
        <strong>How approval PINs work:</strong> Signatories (Bishop, Treasurer, Secretary) use a 6-digit PIN as a second confirmation when approving PVs. Each person <strong>sets and changes their own PIN privately</strong> from their Signatory Queue page, so nobody else knows it. If someone forgets their PIN, use <strong>Reset PIN</strong> here to clear it; they then set a new one themselves (you never see it). <strong>Set Initial PIN</strong> is only offered for someone who has never set one.
        <br /><br />
        <strong>EXCO Members don&apos;t use a PIN.</strong> They verify payment requests by drawing their signature, which is printed on the resulting payment voucher as proof the ministry examined the expense.
      </div>
    </div>
  );
}

/**
 * Add a person.
 *
 * The old button dropped an empty row at the foot of a list of forty people,
 * which said nothing about what was needed and was easy to abandon half-filled
 * — an unnamed row with no email, saved or not, is indistinguishable from a
 * real one. A dialogue asks the whole question at once, refuses to save until
 * it can be answered, and shows who will sign this person's leave before the
 * record exists.
 */
function AddUserModal({ roles, roleLabels, ministries, congregations, districts, users, onClose, onSaved }: {
  roles: string[];
  roleLabels: Record<string, string>;
  ministries: string[];
  congregations: Congregation[];
  districts: District[];
  users: UserRole[];
  onClose: () => void;
  onSaved: (newId: string, name: string) => void;
}) {
  const supabase = createClient();
  const [draft, setDraft] = useState<Omit<UserRole, "id" | "has_pin">>({
    email: "", full_name: "", role: "STAFF", ministries: [],
    is_lcm_staff: true, is_pastor: false, designation: null,
    congregation_id: null, reports_to: "GM_AND_BISHOP",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function set<K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) {
    setDraft(d => ({ ...d, [k]: v }));
  }

  const email = draft.email.trim().toLowerCase();
  const taken = users.some(u => u.email.trim().toLowerCase() === email);
  const needsPin = ["BISHOP", "TREASURER", "SECRETARY"].includes(draft.role);

  async function save() {
    if (!draft.full_name.trim()) { setErr("Enter their full name"); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setErr("Enter a valid email address"); return; }
    if (taken) { setErr("Somebody with that email already has a login"); return; }
    setErr("");
    setSaving(true);

    const { data, error } = await supabase.from("user_roles").insert({
      email,
      full_name: draft.full_name.trim(),
      role: draft.role,
      ministries: draft.ministries,
      is_lcm_staff: draft.is_lcm_staff,
      is_pastor: draft.is_pastor,
      designation: draft.designation?.trim() || null,
      congregation_id: draft.is_pastor ? (draft.congregation_id || null) : null,
      reports_to: draft.reports_to,
    }).select("id").single();

    setSaving(false);
    if (error) {
      setErr(error.code === "23505" ? "Somebody with that email already has a login" : error.message);
      return;
    }
    onSaved(data.id as string, draft.full_name.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/35 px-4 py-8 backdrop-blur-[2px]">
      <div className="w-full max-w-lg space-y-4 rounded-3xl border border-[#dbe9fb] bg-[#fbfdff] p-6 shadow-[0_24px_70px_rgba(22,51,94,0.24)]">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-stone-800">Add a user</h2>
            <p className="mt-0.5 text-xs text-stone-400">
              Gives someone access to the system. What they may approve follows from their role.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100">
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs text-stone-500">Full name *</label>
            <input className={inp} autoFocus value={draft.full_name}
              placeholder="e.g. Rev. Daniel Tan"
              onChange={e => set("full_name", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-stone-500">Email *</label>
            <input className={inp} type="email" value={draft.email}
              placeholder="name@lcm.org.my or personal email"
              onChange={e => set("email", e.target.value)} />
            {/* The email is the login and cannot be changed afterwards, so it
                is worth getting right here. */}
            <p className="mt-1 text-[11px] text-stone-400">
              {taken
                ? <span className="font-medium text-red-500">Somebody already signs in with that address.</span>
                : email && !email.endsWith("@lcm.org.my")
                  ? "Not an @lcm.org.my address — they will sign in by magic link."
                  : "This is their login, and cannot be changed later."}
            </p>
          </div>
        </div>

        <div>
          <label className="text-xs text-stone-500">Role</label>
          <select className={inp} value={draft.role} onChange={e => set("role", e.target.value)}>
            {roles.map(r => <option key={r} value={r}>{roleLabels[r]}</option>)}
          </select>
        </div>

        {draft.role === "MINISTRY_HEAD" && (
          <div>
            <label className="text-xs text-stone-500">Assigned ministries</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {ministries.map(m => (
                <label key={m} className="flex cursor-pointer items-center gap-1 text-xs">
                  <input type="checkbox" className="accent-[#4a6da7]"
                    checked={draft.ministries.includes(m)}
                    onChange={e => set("ministries", e.target.checked
                      ? [...draft.ministries, m]
                      : draft.ministries.filter(x => x !== m))} />
                  {m}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3 rounded-xl border border-[#dbe9fb] bg-[#f8fbff] p-3">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-700">
              <input type="checkbox" className="h-4 w-4 accent-[#4a6da7]"
                checked={draft.is_lcm_staff} onChange={e => set("is_lcm_staff", e.target.checked)} />
              Employed by LCM
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-700">
              <input type="checkbox" className="h-4 w-4 accent-[#4a6da7]"
                checked={draft.is_pastor} onChange={e => set("is_pastor", e.target.checked)} />
              Pastor
            </label>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="text-xs text-stone-400">Designation</label>
              <input className={inp} value={draft.designation ?? ""}
                placeholder="e.g. Finance Executive, Pastor"
                onChange={e => set("designation", e.target.value)} />
            </div>
            {draft.is_pastor ? (
              <div>
                <label className="text-xs text-stone-400">Congregation</label>
                <select className={inp} value={draft.congregation_id ?? ""}
                  onChange={e => set("congregation_id", e.target.value || null)}>
                  <option value="">— none —</option>
                  {congregations.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            ) : draft.is_lcm_staff ? (
              <div>
                <label className="text-xs text-stone-400">Reports to (for leave)</label>
                <select className={inp} value={draft.reports_to}
                  onChange={e => set("reports_to", e.target.value as UserRole["reports_to"])}>
                  <option value="GM_AND_BISHOP">General Manager and Bishop</option>
                  <option value="BISHOP_ONLY">Bishop only</option>
                </select>
              </div>
            ) : null}
          </div>

          {draft.is_lcm_staff ? (
            <p className="text-xs text-stone-500">
              <span className="font-semibold text-stone-600">Leave will go to:</span>{" "}
              {describeLeaveChain({ ...draft, id: "", has_pin: false }, congregations, districts, users)}
            </p>
          ) : (
            <p className="text-xs text-amber-700">
              Volunteer — approvals only. No leave, staff loan or payroll access, and no reporting line.
            </p>
          )}
        </div>

        {needsPin && (
          <p className="rounded-xl border border-[#dbe9fb] bg-[#f4f9ff] p-3 text-xs text-stone-500">
            As a signatory they will also need a 6-digit approval PIN. Once added, open their row and
            choose <strong>Set Initial PIN</strong> — or let them set their own from their queue page.
          </p>
        )}

        {err && <p className="text-xs font-medium text-red-500">{err}</p>}

        <div className="flex gap-2 pt-1">
          <Button className="flex-1" loading={saving} onClick={save}>
            <Plus size={13} /> Add user
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
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

const inp = fieldClass;
