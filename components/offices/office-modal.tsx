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

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { fieldClass, labelClass } from "@/lib/field-styles";
import { roleLabel, SWITCHABLE_ROLES } from "@/lib/utils";
import { Plus } from "lucide-react";

export interface OfficeRow {
  id: string;
  name: string;
  kind: string;
  grants_role: string | null;
  single_holder: boolean;
  active: boolean;
  tenure: "ELECTED" | "PERMANENT" | "TEMPORARY";
}

const KINDS = [
  { key: "EXCO",      label: "EXCO portfolio",                  hint: "An elected seat on the EXCO" },
  { key: "PROJECT",   label: "Project or supporting committee", hint: "Set up for a purpose or a period; carries no EXCO seat" },
  { key: "COMMITTEE", label: "Standing committee",              hint: "Several people may serve at once" },
  { key: "APPOINTED", label: "Appointed post",                  hint: "Given rather than elected — a desk or a manager" },
  { key: "CHURCH",    label: "Church office",                   hint: "A constitutional post like Bishop or Secretary" },
  { key: "DEAN",      label: "Dean",                            hint: "Leads a district; set the district afterwards" },
];

const TENURES = [
  { key: "ELECTED",   label: "Elected",   hint: "Stands for a term and is filled by an election" },
  { key: "PERMANENT", label: "Permanent", hint: "Held until somebody replaces them" },
  { key: "TEMPORARY", label: "Temporary", hint: "A project or relief post that is expected to end" },
];

/** Committees seat several people, so the one-holder question does not apply. */
const MULTI_KINDS = ["COMMITTEE", "PROJECT"];

export function OfficeModal({ office, holdingCount = 0, onClose, onSaved, say }: {
  office: OfficeRow | null;
  /** How many terms have been served in it — decides retire versus delete. */
  holdingCount?: number;
  onClose: () => void;
  onSaved: (message: string) => void;
  say: (m: string, ok?: boolean) => void;
}) {
  const supabase = createClient();
  const [name, setName] = useState(office?.name ?? "");
  const [kind, setKind] = useState(office?.kind ?? "APPOINTED");
  const [tenure, setTenure] = useState<OfficeRow["tenure"]>(office?.tenure ?? "PERMANENT");
  const [grantsRole, setGrantsRole] = useState(office?.grants_role ?? "");
  const [singleHolder, setSingleHolder] = useState(office?.single_holder ?? true);
  const [active, setActive] = useState(office?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!name.trim()) { setErr("Give the post a name"); return; }
    setErr(""); setSaving(true);
    const payload = {
      name: name.trim(),
      kind,
      tenure,
      grants_role: grantsRole || null,
      single_holder: MULTI_KINDS.includes(kind) ? false : singleHolder,
      active,
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
            {KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
          <p className="mt-1 text-[11px] text-stone-500">{KINDS.find(k => k.key === kind)?.hint}</p>
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
        <label className={labelClass}>Gives access as</label>
        <select className={fieldClass} value={grantsRole} onChange={e => setGrantsRole(e.target.value)}>
          <option value="">Nothing — it is a title, not a permission</option>
          {SWITCHABLE_ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
        </select>
        <p className="mt-1 text-[11px] text-stone-500">
          Whoever holds it gains this role and the outgoing holder loses it. Most posts grant
          nothing — leave it blank unless the post really carries system access.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {!MULTI_KINDS.includes(kind) && (
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
