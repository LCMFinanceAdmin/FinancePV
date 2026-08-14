"use client";
// The app's roles: what they are called, what they mean, who can be given them.
//
// Worth being straight about the limit, because the form cannot hide it. A role
// is a name that RLS policies and edge functions are written against — 895
// references across 84 files. This page owns the label, the description, the
// order and whether a role may be handed out. It cannot own what a role is
// permitted to do, and a role invented here would appear in every picker while
// granting nothing at all.
//
// So there is no "add a role" button. Offering one would be offering something
// that does not work, and an account that looks privileged and is not is worse
// than a missing feature.

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { fieldClass, labelClass } from "@/lib/field-styles";
import { loadRoles, type AppRole } from "@/lib/roles";
import { Pencil, Lock, Info } from "lucide-react";

export function RolesModal({ onClose, onSaved, say }: {
  onClose: () => void;
  onSaved: () => void;
  say: (m: string, ok?: boolean) => void;
}) {
  const supabase = createClient();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [rows, { data: held }] = await Promise.all([
      loadRoles(supabase, true),
      supabase.from("user_roles").select("role"),
    ]);
    setRoles(rows);
    setCounts(((held ?? []) as { role: string }[]).reduce<Record<string, number>>((acc, r) => {
      acc[r.role] = (acc[r.role] ?? 0) + 1; return acc;
    }, {}));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { refresh(); }, [refresh]);

  if (editing) {
    return <RoleForm role={editing} held={counts[editing.key] ?? 0}
      onBack={() => setEditing(null)}
      onSaved={async () => { setEditing(null); await refresh(); onSaved(); say("Role updated"); }}
      say={say} />;
  }

  return (
    <Modal
      title="Roles"
      description="What each role is called and who it can be given to."
      onClose={onClose}
      footer={<Button className="flex-1" variant="ghost" onClick={onClose}>Done</Button>}
    >
      <p className="flex gap-2 rounded-lg border-2 border-stone-300 bg-stone-50 px-3 py-2 text-[11px] text-stone-600">
        <Info size={14} className="mt-px shrink-0" />
        <span>
          What a role <em>may do</em> is written into the app and its security policies, so it is not
          editable here and new roles cannot be created from this screen — one would appear in every
          picker and grant nothing. Renaming, describing and retiring roles all work.
        </span>
      </p>

      {loading ? <p className="text-xs text-stone-400">Loading…</p> : (
        <ul className="divide-y divide-stone-200 rounded-lg border-2 border-stone-800">
          {roles.map(r => {
            const n = counts[r.key] ?? 0;
            return (
              <li key={r.key} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-stone-800">
                    {r.label}
                    {r.is_system && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600"
                        title="Built into the app — its permissions live in code">
                        <Lock size={9} /> built in
                      </span>
                    )}
                    {!r.assignable && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                        not offered
                      </span>
                    )}
                  </div>
                  {r.description && <div className="text-xs text-stone-500">{r.description}</div>}
                  <div className="text-[11px] text-stone-400">
                    <code>{r.key}</code> · {n === 0 ? "nobody holds it" : `${n} ${n === 1 ? "person" : "people"}`}
                  </div>
                </div>
                <button onClick={() => setEditing(r)} aria-label={`Edit ${r.label}`}
                  className="shrink-0 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-[#2f5b9c]">
                  <Pencil size={13} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

function RoleForm({ role, held, onBack, onSaved, say }: {
  role: AppRole; held: number;
  onBack: () => void; onSaved: () => void; say: (m: string, ok?: boolean) => void;
}) {
  const supabase = createClient();
  const [label, setLabel] = useState(role.label);
  const [description, setDescription] = useState(role.description);
  const [assignable, setAssignable] = useState(role.assignable);
  const [sortOrder, setSortOrder] = useState(String(role.sort_order));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!label.trim()) { setErr("Give it a name"); return; }
    setErr(""); setSaving(true);
    const { error } = await supabase.from("app_roles").update({
      label: label.trim(),
      description: description.trim(),
      assignable,
      sort_order: parseInt(sortOrder, 10) || 500,
      updated_at: new Date().toISOString(),
    }).eq("key", role.key);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  }

  return (
    <Modal
      title={`Edit ${role.label}`}
      description="Renaming changes what everyone sees. It does not change what the role may do."
      onClose={onBack}
      footer={<>
        <Button className="flex-1" loading={saving} onClick={save}>Save</Button>
        <Button variant="ghost" onClick={onBack}>Back</Button>
      </>}
    >
      <div>
        <label className={labelClass}>Name *</label>
        <input className={fieldClass} value={label} onChange={e => setLabel(e.target.value)} />
        <p className="mt-1 text-[11px] text-stone-500">
          Stored as <code>{role.key}</code>, which never changes — the security policies are written
          against it.
        </p>
      </div>

      <div>
        <label className={labelClass}>What it means</label>
        <input className={fieldClass} value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Shown wherever this role is offered" />
      </div>

      <div>
        <label className="flex items-start gap-2 text-sm text-stone-700">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#2f5b9c]"
            checked={assignable} onChange={e => setAssignable(e.target.checked)} />
          <span>
            Can be given to people
            <span className="block text-[11px] text-stone-500">
              Untick to retire it from the pickers.{" "}
              {held > 0
                ? `${held} ${held === 1 ? "person keeps it" : "people keep it"} and nothing about their access changes.`
                : "Nobody holds it."}
            </span>
          </span>
        </label>
      </div>

      <div>
        <label className={labelClass}>Order in the list</label>
        <input type="number" className={fieldClass} value={sortOrder}
          onChange={e => setSortOrder(e.target.value)} />
      </div>

      {err && <p className="text-xs font-medium text-red-600" role="alert">{err}</p>}
    </Modal>
  );
}
