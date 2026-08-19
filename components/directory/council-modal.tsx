"use client";
// A congregation's church council.
//
// The Chairman was already recorded, as two fields on the congregation, because
// the leave chain needs somebody to send a pastor's application to. Everyone
// else on the council was not recorded anywhere, so "who do we write to about
// this church" was a question for whoever happened to remember.
//
// The Chairman recorded here is the same Chairman: saving a chairman row writes
// congregations.council_president_name and _email through a database trigger
// (migration 145), so the leave routing keeps reading the one field it always
// read and the council list becomes the place that field is edited. They cannot
// disagree, and removing the chair clears it — leave then falls through to the
// Dean rather than waiting on an address nobody answers.

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { fieldClass, labelClass } from "@/lib/field-styles";
import { Plus, Trash2, Save, Users } from "lucide-react";

export type CouncilRole = "CHAIRMAN" | "TREASURER" | "SECRETARY" | "MEMBER";

export interface CouncilMember {
  id: string;
  congregation_id: string;
  role: CouncilRole;
  name: string;
  email: string | null;
  phone: string | null;
  sort_order: number;
}

const ROLES: { key: CouncilRole; label: string; hint?: string }[] = [
  { key: "CHAIRMAN",  label: "Chairman",  hint: "Also approves their pastor's leave" },
  { key: "TREASURER", label: "Treasurer" },
  { key: "SECRETARY", label: "Secretary" },
  { key: "MEMBER",    label: "Member" },
];

export function CouncilModal({
  congregationId, congregationName, canEdit, onClose, onSaved,
}: {
  congregationId: string;
  congregationName: string;
  canEdit: boolean;
  onClose: () => void;
  /** So the page can pick up the chairman the trigger just wrote back. */
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<CouncilMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("congregation_council_members")
      .select("*").eq("congregation_id", congregationId)
      .order("sort_order").order("name");
    if (error) setErr(error.message);
    setRows((data ?? []) as CouncilMember[]);
    setLoading(false);
  }, [supabase, congregationId]);

  useEffect(() => { load(); }, [load]);

  const isNew = (id: string) => id.startsWith("new-");

  function addRow() {
    setRows(rs => [...rs, {
      id: `new-${Date.now()}`, congregation_id: congregationId,
      role: "MEMBER", name: "", email: "", phone: "", sort_order: 500 + rs.length,
    }]);
  }

  function patch(id: string, p: Partial<CouncilMember>) {
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...p } : r));
  }

  async function save() {
    const named = rows.filter(r => r.name.trim());
    // One chair only — the database enforces it too, but a constraint error is
    // a worse way to find out than being told before pressing Save.
    if (named.filter(r => r.role === "CHAIRMAN").length > 1) {
      setErr("Only one Chairman. Change the other to Member first.");
      return;
    }
    setErr(""); setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();

    for (const r of named) {
      const payload = {
        congregation_id: congregationId,
        role: r.role,
        name: r.name.trim(),
        email: r.email?.trim() || null,
        phone: r.phone?.trim() || null,
        sort_order: r.sort_order,
        updated_at: new Date().toISOString(),
      };
      const { error } = isNew(r.id)
        ? await supabase.from("congregation_council_members")
            .insert({ ...payload, created_by: session?.user?.email ?? "" })
        : await supabase.from("congregation_council_members").update(payload).eq("id", r.id);
      if (error) { setErr(error.message); setSaving(false); return; }
    }
    setSaving(false);
    await load();
    onSaved();
  }

  async function remove(r: CouncilMember) {
    if (isNew(r.id)) { setRows(rs => rs.filter(x => x.id !== r.id)); return; }
    if (!confirm(`Remove ${r.name} from the council?`)) return;
    const { error } = await supabase.from("congregation_council_members").delete().eq("id", r.id);
    if (error) { setErr(error.message); return; }
    await load();
    onSaved();
  }

  const chair = rows.find(r => r.role === "CHAIRMAN" && r.name.trim());

  return (
    <Modal
      title={`Church council — ${congregationName}`}
      description="Who sits on the council, and how to reach them."
      onClose={onClose}
      footer={<>
        {canEdit && (
          <Button className="flex-1" loading={saving} onClick={save}>
            <Save size={13} /> Save council
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </>}
    >
      {/* Said here because it is not obvious that a name typed on this screen
          decides where a leave application goes. */}
      <p className="rounded-lg bg-[#f4f7fb] px-3 py-2 text-[12px] text-stone-600">
        {chair
          ? <>Leave for this congregation&rsquo;s pastors goes to <strong>{chair.name}</strong> as Chairman,
              alongside the head pastor and the district Dean.</>
          : <>No Chairman set, so leave for this congregation&rsquo;s pastors falls through to the district
              Dean. Naming one here sets it — nothing else to fill in.</>}
      </p>

      {loading ? (
        <p className="py-6 text-center text-sm text-stone-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-stone-400">
          Nobody recorded yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map(r => (
            <li key={r.id} className="rounded-xl border-2 border-stone-200 p-2.5">
              <div className="grid gap-2 sm:grid-cols-[130px_1fr]">
                <div>
                  <label className={labelClass}>Office</label>
                  <select className={fieldClass} value={r.role} disabled={!canEdit}
                    onChange={e => patch(r.id, { role: e.target.value as CouncilRole })}>
                    {ROLES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Name *</label>
                  <input className={fieldClass} value={r.name} disabled={!canEdit}
                    placeholder="Full name"
                    onChange={e => patch(r.id, { name: e.target.value })} />
                </div>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Email</label>
                  <input className={fieldClass} type="email" value={r.email ?? ""} disabled={!canEdit}
                    placeholder="name@example.com"
                    onChange={e => patch(r.id, { email: e.target.value })} />
                  {r.role === "CHAIRMAN" && (
                    <p className="mt-1 text-[10.5px] text-stone-400">
                      Leave approvals are emailed here as a one-time link — the Chairman is not LCM
                      staff and has no login.
                    </p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>Phone</label>
                  <input className={fieldClass} value={r.phone ?? ""} disabled={!canEdit}
                    placeholder="01x-xxx xxxx"
                    onChange={e => patch(r.id, { phone: e.target.value })} />
                </div>
              </div>
              {canEdit && (
                <div className="mt-1.5 flex justify-end">
                  <button onClick={() => remove(r)}
                    className="inline-flex items-center gap-1 rounded p-1 text-[11px] text-stone-400 hover:text-red-600">
                    <Trash2 size={12} /> Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <Button size="sm" variant="secondary" onClick={addRow}>
          <Plus size={13} /> Add council member
        </Button>
      )}

      {err && <p className="text-xs font-medium text-red-600" role="alert">{err}</p>}

      <p className="flex items-start gap-1.5 text-[11px] text-stone-400">
        <Users size={12} className="mt-0.5 shrink-0" />
        The Chairman recorded here is the same one the leave chain uses — saving updates both, so
        they cannot disagree.
      </p>
    </Modal>
  );
}
