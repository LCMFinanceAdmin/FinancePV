"use client";
// A post: adding one, changing it, or taking it off the register.
//
// The register was seeded and could not grow, so a Media Desk or an Assistant
// Dean meant a migration. Posts are data.
//
// What is *not* data is the system role a post grants, because the access
// policies name those roles directly — a role invented in a dropdown would
// appear in the picker and grant nothing at all. So a post picks from the roles
// that exist, or grants none, which is the ordinary case: most posts are a
// title and a term, not a set of permissions.

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { fieldClass, labelClass } from "@/lib/field-styles";
import { roleLabel } from "@/lib/utils";
import { loadRoles, assignableRoles, type AppRole } from "@/lib/roles";
import { Plus } from "lucide-react";

export interface OfficeRow {
  id: string;
  name: string;
  kind: string;
  grants_role: string | null;
  single_holder: boolean;
  active: boolean;
  tenure: "ELECTED" | "PERMANENT" | "TEMPORARY";
  parent_office_id: string | null;
  approval_limit: number | null;
}

export interface OfficeCategory {
  key: string; label: string; description: string;
  seats_many: boolean; is_exco: boolean; sort_order: number; active: boolean;
}

const TENURES = [
  { key: "ELECTED",   label: "Elected",   hint: "Stands for a term and is filled by an election" },
  { key: "PERMANENT", label: "Permanent", hint: "Held until somebody replaces them" },
  { key: "TEMPORARY", label: "Temporary", hint: "A project or relief post that is expected to end" },
];

export function OfficeModal({
  office, categories, allOffices, holdingCount = 0, onClose, onSaved, say,
}: {
  office: OfficeRow | null;
  categories: OfficeCategory[];
  /** Every post, so one can be chosen as the parent — and so this one's own
      descendants can be kept out of that list. */
  allOffices: OfficeRow[];
  /** How many terms have been served in it — decides retire versus delete. */
  holdingCount?: number;
  onClose: () => void;
  onSaved: (message: string) => void;
  say: (m: string, ok?: boolean) => void;
}) {
  const supabase = createClient();
  const [name, setName] = useState(office?.name ?? "");
  const [kind, setKind] = useState(office?.kind ?? categories[0]?.key ?? "APPOINTED");
  const [parentId, setParentId] = useState(office?.parent_office_id ?? "");
  const [limit, setLimit] = useState(office?.approval_limit != null ? String(office.approval_limit) : "");
  const [tenure, setTenure] = useState<OfficeRow["tenure"]>(office?.tenure ?? "PERMANENT");
  const [grantsRole, setGrantsRole] = useState(office?.grants_role ?? "");
  const [singleHolder, setSingleHolder] = useState(office?.single_holder ?? true);
  const [active, setActive] = useState(office?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [roles, setRoles] = useState<AppRole[]>([]);
  useEffect(() => { loadRoles(supabase).then(setRoles); }, [supabase]);

  const category = categories.find(c => c.key === kind);
  const seatsMany = category?.seats_many ?? false;

  /**
   * Posts that may be this one's parent.
   *
   * Its own descendants are excluded, because making a post a child of its own
   * child produces a cycle the page would then recurse through forever. The
   * database can only refuse a post being its own direct parent — a CHECK sees
   * one row.
   */
  const descendants = (() => {
    const out = new Set<string>();
    if (!office) return out;
    const walk = (id: string) => {
      for (const o of allOffices) {
        if (o.parent_office_id === id && !out.has(o.id)) { out.add(o.id); walk(o.id); }
      }
    };
    out.add(office.id); walk(office.id);
    return out;
  })();
  const parentOptions = allOffices.filter(o => !descendants.has(o.id));

  async function save() {
    if (!name.trim()) { setErr("Give the post a name"); return; }
    if (limit.trim() !== "" && (!Number.isFinite(Number(limit)) || Number(limit) < 0)) {
      setErr("The approval limit has to be a number, or blank for no limit");
      return;
    }
    setErr(""); setSaving(true);
    const payload = {
      name: name.trim(),
      kind,
      tenure,
      grants_role: grantsRole || null,
      single_holder: seatsMany ? false : singleHolder,
      active,
      parent_office_id: parentId || null,
      approval_limit: limit.trim() === "" ? null : Number(limit),
    };
    const { error } = office
      ? await supabase.from("offices").update(payload).eq("id", office.id)
      : await supabase.from("offices").insert({ ...payload, sort_order: 500 });
    setSaving(false);
    if (error) {
      setErr(error.code === "23505" ? "There is already a post with that name." : error.message);
      return;
    }
    onSaved(office ? "Post updated" : "Post added");
  }

  /**
   * Taking a post off the register.
   *
   * One that has been held is never deleted — somebody served in it, and a
   * voucher signed last year was signed by whoever held it then. Retiring keeps
   * the record and takes it off the working list. Only a post nobody has ever
   * held actually goes.
   */
  async function remove() {
    if (!office) return;

    if (holdingCount > 0) {
      const ok = confirm(
        `Retire ${office.name}?\n\n` +
        `${holdingCount} term${holdingCount === 1 ? " has" : "s have"} been served in it, so the post ` +
        "is kept and hidden rather than deleted — the record of who held it stays intact.",
      );
      if (!ok) return;
      const { error } = await supabase.from("offices").update({ active: false }).eq("id", office.id);
      if (error) { say(error.message, false); return; }
      onSaved(`${office.name} retired`);
      return;
    }

    if (!confirm(`Delete ${office.name}? Nobody has ever held it, so nothing is lost.`)) return;
    const { error } = await supabase.from("offices").delete().eq("id", office.id);
    if (error) { say(error.message, false); return; }
    onSaved(`${office.name} deleted`);
  }

  return (
    <Modal
      title={office ? `Edit ${office.name}` : "Add a post"}
      description={office
        ? "What the post is, how long it is held for, and what access it carries."
        : "Posts are added here as the church grows — a new desk, a new portfolio, a new project committee."}
      onClose={onClose}
      footer={<>
        <Button className="flex-1" loading={saving} onClick={save}>
          <Plus size={13} /> {office ? "Save post" : "Add post"}
        </Button>
        {office && (
          <Button variant="ghost" onClick={remove}>
            {holdingCount > 0 ? "Retire" : "Delete"}
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </>}
    >
      <div>
        <label className={labelClass}>Name *</label>
        <input className={fieldClass} value={name} onChange={e => setName(e.target.value)}
          placeholder="e.g. Media Desk, Assistant Dean" />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Kind</label>
          <select className={fieldClass} value={kind} onChange={e => setKind(e.target.value)}>
            {categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <p className="mt-1 text-[11px] text-stone-500">{category?.description}</p>
        </div>
        <div>
          <label className={labelClass}>Held for</label>
          <select className={fieldClass} value={tenure}
            onChange={e => setTenure(e.target.value as OfficeRow["tenure"])}>
            {TENURES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <p className="mt-1 text-[11px] text-stone-500">{TENURES.find(t => t.key === tenure)?.hint}</p>
        </div>
      </div>

      <div>
        <label className={labelClass}>Sits under</label>
        <select className={fieldClass} value={parentId} onChange={e => setParentId(e.target.value)}>
          <option value="">Nothing — it stands on its own</option>
          {parentOptions.map(o => (
            <option key={o.id} value={o.id}>{o.name}{o.active ? "" : " (retired)"}</option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-stone-500">
          For a body that answers to another — BAM sits under the Property portfolio.
          The register groups it beneath its parent.
        </p>
      </div>

      <div>
        <label className={labelClass}>May approve up to (RM)</label>
        <input type="number" min="0" step="100" className={fieldClass} value={limit}
          onChange={e => setLimit(e.target.value)} placeholder="No limit" />
        <p className="mt-1 text-[11px] text-stone-500">
          The most this body may verify on one voucher, against its budget items. Above it the
          voucher goes to {parentId
            ? allOffices.find(o => o.id === parentId)?.name ?? "the post it sits under"
            : "the post it sits under"} rather than being refused. Blank means no limit of its own.
        </p>
      </div>

      <div>
        <label className={labelClass}>Gives access as</label>
        <select className={fieldClass} value={grantsRole} onChange={e => setGrantsRole(e.target.value)}>
          <option value="">Nothing — it is a title, not a permission</option>
          {assignableRoles(roles, grantsRole).map(r => (
            <option key={r.key} value={r.key}>{r.label}</option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-stone-500">
          Whoever holds it gains this role and the outgoing holder loses it. Most posts grant
          nothing — leave it blank unless the post really carries system access.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {!seatsMany && (
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" className="h-4 w-4 accent-[#2f5b9c]"
              checked={singleHolder} onChange={e => setSingleHolder(e.target.checked)} />
            One holder at a time
          </label>
        )}
        {office && (
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" className="h-4 w-4 accent-[#2f5b9c]"
              checked={active} onChange={e => setActive(e.target.checked)} />
            On the working list
          </label>
        )}
      </div>

      {err && <p className="text-xs font-medium text-red-600" role="alert">{err}</p>}
    </Modal>
  );
}
