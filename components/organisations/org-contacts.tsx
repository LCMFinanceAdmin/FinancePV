"use client";
// Who to speak to at a partner organisation.
//
// The record carried one contact_name, which cannot express the thing that
// actually matters about LCA, LSC, CCM, ELCA or LEM: the person who signs is
// rarely the person you email, and the person you email is rarely the one who
// can decide. A single name forces a choice between them and loses the rest.
//
// Deliberately not the People Directory. A programme officer at ELCA is not
// somebody LCM employs, elects or pays, and filing them alongside pastors and
// vendors would make the directory answer a different question than the one it
// exists for. People in the directory who happen to work with an organisation
// are still linked to it and still shown — separately, and labelled as such,
// because they are LCM's people rather than the organisation's.

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Save, PenLine, ShieldCheck, UserCog, Mail } from "lucide-react";

export type OrgContactRole = "SIGNATORY" | "PIC" | "CONTACT" | "SUPPORT";

export interface OrgContact {
  id: string;
  organisation_id: string;
  role: OrgContactRole;
  name: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  sort_order: number;
}

const ROLES: { key: OrgContactRole; label: string; hint: string; icon: typeof PenLine }[] = [
  { key: "SIGNATORY", label: "Authorised signatory", hint: "Signs on the organisation's behalf",     icon: PenLine },
  { key: "PIC",       label: "Person in charge",     hint: "Decides — the one to escalate to",       icon: ShieldCheck },
  { key: "CONTACT",   label: "Main contact",         hint: "Who LCM corresponds with day to day",    icon: Mail },
  { key: "SUPPORT",   label: "Supporting staff",     hint: "Keeps things moving on their side",      icon: UserCog },
];
const roleMeta = (r: string) => ROLES.find(x => x.key === r) ?? ROLES[2];

// Signatory first, then decision-maker, then the people you actually write to.
// Sorted by usefulness in the moment somebody opens this, not alphabetically.
const ORDER: Record<OrgContactRole, number> = { SIGNATORY: 0, PIC: 1, CONTACT: 2, SUPPORT: 3 };

export function OrgContacts({ organisationId, canEdit }: {
  organisationId: string;
  canEdit: boolean;
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<OrgContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("organisation_contacts").select("*")
      .eq("organisation_id", organisationId)
      .order("sort_order").order("name");
    if (error) setErr(error.message);
    setRows((data ?? []) as OrgContact[]);
    setLoading(false);
  }, [supabase, organisationId]);

  useEffect(() => { load(); }, [load]);

  const isNew = (id: string) => id.startsWith("new-");
  const patch = (id: string, p: Partial<OrgContact>) =>
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...p } : r));

  function addRow() {
    setRows(rs => [...rs, {
      id: `new-${Date.now()}`, organisation_id: organisationId,
      role: "CONTACT", name: "", position: "", email: "", phone: "", notes: "",
      sort_order: 500 + rs.length,
    }]);
  }

  async function save() {
    const named = rows.filter(r => r.name.trim());
    setErr(""); setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    for (const r of named) {
      const payload = {
        organisation_id: organisationId,
        role: r.role,
        name: r.name.trim(),
        position: r.position?.trim() || null,
        email: r.email?.trim() || null,
        phone: r.phone?.trim() || null,
        notes: r.notes?.trim() || null,
        // Kept in the order the roles matter, so the list reads the same way
        // wherever it is shown and does not depend on entry order.
        sort_order: ORDER[r.role] * 100 + (r.sort_order % 100),
        updated_at: new Date().toISOString(),
      };
      const { error } = isNew(r.id)
        ? await supabase.from("organisation_contacts")
            .insert({ ...payload, created_by: session?.user?.email ?? "" })
        : await supabase.from("organisation_contacts").update(payload).eq("id", r.id);
      if (error) { setErr(error.message); setSaving(false); return; }
    }
    setSaving(false);
    await load();
  }

  async function remove(r: OrgContact) {
    if (isNew(r.id)) { setRows(rs => rs.filter(x => x.id !== r.id)); return; }
    if (!confirm(`Remove ${r.name}?`)) return;
    const { error } = await supabase.from("organisation_contacts").delete().eq("id", r.id);
    if (error) { setErr(error.message); return; }
    await load();
  }

  const inp = "w-full border-2 border-stone-200 rounded-lg px-2 py-1.5 !text-[13px] outline-none focus:border-[#2f5b9c] bg-white";
  const lbl = "block text-[10.5px] font-semibold text-stone-500 mb-0.5";

  const signatory = rows.find(r => r.role === "SIGNATORY" && r.name.trim());
  const pic = rows.find(r => r.role === "PIC" && r.name.trim());

  return (
    <div className="space-y-2">
      {/* The two answers somebody opens this record for, before the list. */}
      <div className="rounded-lg bg-[#f4f7fb] px-3 py-2 text-[12px] text-stone-600">
        {signatory || pic ? (
          <>
            {signatory && <>Signs: <strong className="text-stone-800">{signatory.name}</strong></>}
            {signatory && pic && " · "}
            {pic && <>Decides: <strong className="text-stone-800">{pic.name}</strong></>}
          </>
        ) : (
          <>No authorised signatory or person in charge recorded — the two things usually wanted
            from this record first.</>
        )}
      </div>

      {loading ? (
        <p className="py-3 text-center text-[13px] text-stone-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="py-2 text-[13px] text-stone-400">
          Nobody recorded yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map(r => {
            const meta = roleMeta(r.role);
            const Icon = meta.icon;
            return (
              <li key={r.id} className="rounded-xl border-2 border-stone-200 p-2.5">
                <div className="grid gap-2 sm:grid-cols-[190px_1fr_1fr]">
                  <div>
                    <label className={lbl}>Their part</label>
                    <select className={inp} value={r.role} disabled={!canEdit}
                      onChange={e => patch(r.id, { role: e.target.value as OrgContactRole })}>
                      {ROLES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </select>
                    <p className="mt-0.5 flex items-center gap-1 text-[10.5px] text-stone-400">
                      <Icon size={10} /> {meta.hint}
                    </p>
                  </div>
                  <div>
                    <label className={lbl}>Name *</label>
                    <input className={inp} value={r.name} disabled={!canEdit}
                      placeholder="Full name" onChange={e => patch(r.id, { name: e.target.value })} />
                  </div>
                  <div>
                    <label className={lbl}>Position there</label>
                    <input className={inp} value={r.position ?? ""} disabled={!canEdit}
                      placeholder="e.g. General Secretary"
                      onChange={e => patch(r.id, { position: e.target.value })} />
                  </div>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <div>
                    <label className={lbl}>Email</label>
                    <input className={inp} type="email" value={r.email ?? ""} disabled={!canEdit}
                      onChange={e => patch(r.id, { email: e.target.value })} />
                  </div>
                  <div>
                    <label className={lbl}>Phone</label>
                    <input className={inp} value={r.phone ?? ""} disabled={!canEdit}
                      onChange={e => patch(r.id, { phone: e.target.value })} />
                  </div>
                  <div>
                    <label className={lbl}>Notes</label>
                    <input className={inp} value={r.notes ?? ""} disabled={!canEdit}
                      placeholder="Anything worth remembering"
                      onChange={e => patch(r.id, { notes: e.target.value })} />
                  </div>
                </div>
                {canEdit && (
                  <div className="mt-1 flex justify-end">
                    <button onClick={() => remove(r)}
                      className="inline-flex items-center gap-1 rounded p-1 text-[11px] text-stone-400 hover:text-red-600">
                      <Trash2 size={12} /> Remove
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {err && <p className="text-[12px] font-medium text-red-600" role="alert">{err}</p>}

      {canEdit && (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={addRow}>
            <Plus size={13} /> Add someone
          </Button>
          {rows.length > 0 && (
            <Button size="sm" loading={saving} onClick={save}>
              <Save size={13} /> Save contacts
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
