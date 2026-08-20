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
  /** Length of one term in years — 4 for the Bishop, 2 for the rest. */
  term_years: number | null;
  /** What the post covers — see migration 156. */
  responsibilities: string | null;
}

/**
 * The person sitting in the post right now, if anybody is.
 *
 * Passed in rather than looked up here because the page has already worked out
 * which term is running, and two answers to "who holds this" is one more than
 * the question has.
 */
export interface CurrentHolder {
  holdingId: string;
  personId: string;
  name: string;
  /** The address they sign in with, which is not their contact address. */
  login: string | null;
  termStart: string;
  termEnd: string | null;
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
  office, categories, allOffices, holder = null, holdingCount = 0, onClose, onSaved, say,
}: {
  office: OfficeRow | null;
  categories: OfficeCategory[];
  /** Whoever holds it now — their term is edited here, alongside the post. */
  holder?: CurrentHolder | null;
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
  const [tenure, setTenure] = useState<OfficeRow["tenure"]>(office?.tenure ?? "PERMANENT");
  const [grantsRole, setGrantsRole] = useState(office?.grants_role ?? "");
  const [termYears, setTermYears] = useState(office?.term_years != null ? String(office.term_years) : "");
  const [responsibilities, setResponsibilities] = useState(office?.responsibilities ?? "");
  // The sitting holder's term. Editable here because "since 11 Aug 2026" is
  // read off this row on the register, and the only way to correct it was a
  // separate modal reached from a pencil most people never found.
  const [termStart, setTermStart] = useState(holder?.termStart ?? "");
  const [termEnd, setTermEnd] = useState(holder?.termEnd ?? "");
  // Changing the sign-in address is its own action, not part of Save — it
  // rewrites the address across every table that records what the person did.
  const [login, setLogin] = useState(holder?.login ?? "");
  const [movingLogin, setMovingLogin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [roles, setRoles] = useState<AppRole[]>([]);
  useEffect(() => { loadRoles(supabase).then(setRoles); }, [supabase]);

  const category = categories.find(c => c.key === kind);
  const seatsMany = category?.seats_many ?? false;

  // Which questions this kind of post actually has an answer to. Asking all of
  // them of every post is what made the form read as a list of settings rather
  // than a description of the post.
  //
  //   An elected post stands for a fixed term and seats one person. It answers
  //   to the membership, not to another post, so "reports to" is meaningless
  //   for it — the Bishop sits under nobody.
  //
  //   A committee or a staff post does sit beneath something, and a committee
  //   seats as many people as it needs.
  const isElected  = tenure === "ELECTED";
  const reportsTo  = !isElected;                 // committees, projects, HQ staff posts
  const hasTerm    = isElected;

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
    if (hasTerm && termYears.trim() !== ""
        && (!Number.isInteger(Number(termYears)) || Number(termYears) < 1 || Number(termYears) > 20)) {
      setErr("A term is a whole number of years, between 1 and 20");
      return;
    }
    setErr(""); setSaving(true);
    const payload = {
      name: name.trim(),
      kind,
      tenure,
      grants_role: grantsRole || null,
      // Follows the kind rather than being asked: an elected post seats one
      // person because only one was elected, and a committee seats several
      // because that is what a committee is.
      single_holder: !seatsMany,
      // Only a post that answers to another keeps a parent. Changing a
      // committee into an elected post would otherwise leave it reporting
      // somewhere with no way to see that it did.
      parent_office_id: reportsTo ? (parentId || null) : null,
      term_years: hasTerm && termYears.trim() !== "" ? Number(termYears) : null,
      responsibilities: responsibilities.trim() || null,
    };
    const { error } = office
      ? await supabase.from("offices").update(payload).eq("id", office.id)
      : await supabase.from("offices").insert({ ...payload, sort_order: 500 });
    if (error) {
      setSaving(false);
      setErr(error.code === "23505" ? "There is already a post with that name." : error.message);
      return;
    }

    // The sitting holder's dates, if they were touched. A term that ends before
    // it starts would read as current forever, since nothing between the two
    // dates is ever today.
    if (holder && (termStart !== holder.termStart || (termEnd || null) !== holder.termEnd)) {
      if (!termStart) { setSaving(false); setErr("A term needs a start date"); return; }
      if (termEnd && termEnd < termStart) {
        setSaving(false); setErr("The term cannot end before it starts"); return;
      }
      const { error: tErr } = await supabase.from("office_holdings")
        .update({ term_start: termStart, term_end: termEnd || null })
        .eq("id", holder.holdingId);
      if (tErr) { setSaving(false); setErr(tErr.message); return; }
    }

    setSaving(false);
    onSaved(office ? "Post updated" : "Post added");
  }

  /**
   * Move the holder's sign-in address.
   *
   * The address is the identity — it is joined by text from around fifty
   * columns, so this is never a one-field edit. rename_user_login moves the lot
   * in one transaction, user_roles first, which is what carries the system role
   * across with them. It is asked first what *would* move, because a number in
   * the confirmation is what makes this safe to press.
   */
  async function moveLogin() {
    if (!holder?.login) return;
    const next = login.trim().toLowerCase();
    if (!next || next === holder.login.toLowerCase()) return;
    setErr(""); setMovingLogin(true);
    try {
      const { data: preview, error: dryErr } = await supabase.rpc("rename_user_login", {
        p_old: holder.login, p_new: next, p_apply: false,
      });
      if (dryErr) throw new Error(dryErr.message);
      const pv = preview as { rows: number; columns: number };
      const ok = confirm(
        [
          `Change ${holder.name}'s sign-in address from ${holder.login} to ${next}?`,
          `${pv.rows} record${pv.rows === 1 ? "" : "s"} across ${pv.columns} table${pv.columns === 1 ? "" : "s"} move with it` +
            " — vouchers, approvals, notifications, their signature and PIN. Their role and this post come with them.",
          `They must sign in as ${next} from now on. Their personal contact email is not affected.`,
        ].join("\n\n"),
      );
      if (!ok) return;

      const { data: done, error } = await supabase.rpc("rename_user_login", {
        p_old: holder.login, p_new: next, p_apply: true,
      });
      if (error) throw new Error(error.message);
      const d = done as { rows: number };
      onSaved(`${holder.name} signs in as ${next} now — ${d.rows} records moved`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not change the address");
    } finally {
      setMovingLogin(false);
    }
  }

  /**
   * Taking a post off the register.
   *
   * One that has been held is never deleted — somebody served in it, and a
   * voucher signed last year was signed by whoever held it then. Retiring keeps
   * the record and takes it off the working list. Only a post nobody has ever
   * held actually goes.
   */
  /** Back onto the working list. The record was never lost, only hidden. */
  async function reinstate() {
    if (!office) return;
    setSaving(true);
    const { error } = await supabase.from("offices").update({ active: true }).eq("id", office.id);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved(`${office.name} is back on the register`);
  }

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
        {office && (office.active ? (
          <Button variant="ghost" onClick={remove}>
            {holdingCount > 0 ? "Retire" : "Delete"}
          </Button>
        ) : (
          // The checkbox that used to do this read as a setting rather than an
          // action, which is why it was easy to miss that it was the only way
          // back onto the register.
          <Button variant="ghost" onClick={reinstate}>Reinstate</Button>
        ))}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </>}
    >
      <div>
        <label className={labelClass}>Name *</label>
        <input className={fieldClass} value={name} onChange={e => setName(e.target.value)}
          placeholder="e.g. Media Desk, Assistant Dean" />
      </div>

      <div>
        <label className={labelClass}>What it covers</label>
        <textarea className={`${fieldClass} min-h-[73px]`} value={responsibilities}
          onChange={e => setResponsibilities(e.target.value)}
          placeholder="e.g. Oversees the church's buildings and land — repairs, insurance, tenancy, and any purchase or disposal of property." />
        <p className="mt-0.5 text-[11px] text-stone-500">
          The decisions it carries and the part of the ministry it answers for. Shown on the
          register, and when working out which post a decision belongs to.
        </p>
      </div>

      <div className="grid gap-1.5 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Kind</label>
          <select className={fieldClass} value={kind} onChange={e => setKind(e.target.value)}>
            {categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <p className="mt-0.5 text-[11px] text-stone-500">{category?.description}</p>
        </div>
        <div>
          <label className={labelClass}>Held for</label>
          <select className={fieldClass} value={tenure}
            onChange={e => setTenure(e.target.value as OfficeRow["tenure"])}>
            {TENURES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <p className="mt-0.5 text-[11px] text-stone-500">{TENURES.find(t => t.key === tenure)?.hint}</p>
        </div>
      </div>

      {/* Only for a post that answers to another. An elected post answers to
          the membership that elected it — the Bishop sits under nobody — so
          asking was noise on exactly the posts people edit most. */}
      {reportsTo && (
        <div>
          <label className={labelClass}>Reports to</label>
          <select className={fieldClass} value={parentId} onChange={e => setParentId(e.target.value)}>
            <option value="">Nothing — it stands on its own</option>
            {parentOptions.map(o => (
              <option key={o.id} value={o.id}>{o.name}{o.active ? "" : " (retired)"}</option>
            ))}
          </select>
          <p className="mt-0.5 text-[11px] text-stone-500">
            For a body that answers to another — BAM reports to the Property portfolio.
            The register groups it beneath its parent.
          </p>
        </div>
      )}

      {hasTerm && (
        <div>
          <label className={labelClass}>Term length (years)</label>
          <input type="number" min="1" max="20" step="1" className={fieldClass} value={termYears}
            onChange={e => setTermYears(e.target.value)} placeholder="e.g. 4" />
          <p className="mt-0.5 text-[11px] text-stone-500">
            What the constitution sets — four years for the Bishop, two for the Secretary,
            Treasurer and every EXCO portfolio. Recording an election fills the end date in from
            this, and the holder stands as current until that date passes.
          </p>
        </div>
      )}

      <div>
        <label className={labelClass}>Gives access as</label>
        <select className={fieldClass} value={grantsRole} onChange={e => setGrantsRole(e.target.value)}>
          <option value="">Nothing — it is a title, not a permission</option>
          {assignableRoles(roles, grantsRole).map(r => (
            <option key={r.key} value={r.key}>{r.label}</option>
          ))}
        </select>
        <p className="mt-0.5 text-[11px] text-stone-500">
          Whoever holds it gains this role and the outgoing holder loses it. Most posts grant
          nothing — leave it blank unless the post really carries system access.
        </p>
      </div>

      {holder && (
        <div className="space-y-1.5 rounded-xl border-2 border-[#dbe9fb] bg-[#f8fbff] p-2.5">
          <p className="text-[12px] font-bold text-[#1e3f75]">
            Currently held by {holder.name}
          </p>

          <div className="grid gap-1.5 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Since</label>
              <input type="date" className={fieldClass} value={termStart}
                onChange={e => setTermStart(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Until</label>
              <input type="date" className={fieldClass} value={termEnd}
                onChange={e => setTermEnd(e.target.value)} />
              <p className="mt-0.5 text-[11px] text-stone-500">
                Leave blank while they are still serving.
              </p>
            </div>
          </div>

          {/* Separate from Save, and confirmed with a count, because it is not a
              field edit: the address is the identity, joined by text from about
              fifty columns with almost no foreign keys behind it. */}
          <div>
            <label className={labelClass}>Signs in as</label>
            {holder.login ? (
              <>
                <div className="flex gap-2">
                  <input className={fieldClass} value={login} type="email"
                    onChange={e => setLogin(e.target.value)} />
                  <Button variant="secondary" loading={movingLogin}
                    disabled={!login.trim() || login.trim().toLowerCase() === holder.login.toLowerCase()}
                    onClick={moveLogin}>
                    Change
                  </Button>
                </div>
                <p className="mt-0.5 text-[11px] text-stone-500">
                  Everything they have signed or approved moves with the address, and their
                  system role comes with them — the post is not disturbed. Their personal
                  contact email is separate and is not touched. You will be shown how many
                  records move before anything happens.
                </p>
              </>
            ) : (
              <p className="text-[11px] text-amber-700">
                No account signs in as this person yet, so there is no address to change.
                Give them one from their profile under Access &amp; role.
              </p>
            )}
          </div>
        </div>
      )}

      {/* How many it seats is no longer a question, because the kind already
          answers it. Both checkboxes that used to sit here were settings a
          person could put in a state the post cannot actually be in — an
          elected post seating three, a committee seating one. */}
      <p className="rounded-lg bg-stone-50 px-2.5 py-1.5 text-[12px] text-stone-600">
        {seatsMany
          ? `A ${category?.label.replace(/s$/, "").toLowerCase() ?? "post"} seats as many people as it needs.`
          : "One holder at a time — this post seats a single person."}
        {office && !office.active && (
          <span className="mt-1 block font-medium text-amber-700">
            Retired, so it is off the working list. Reinstate it below to bring it back.
          </span>
        )}
      </p>

      {err && <p className="text-xs font-medium text-red-600" role="alert">{err}</p>}
    </Modal>
  );
}
