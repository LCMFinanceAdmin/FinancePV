"use client";
// Church Directory — districts and the Dean leading each, congregations and
// their Council Chairman/Rep.
//
// This is what leave routing is derived from. Following note 6 on the church's
// leave form, a pastor's application goes to their congregation's Council
// Chairman/Rep and their district Dean. Both change hands regularly, so this
// has to be editable here rather than hardcoded.
//
// Laid out as two tables rather than a card per record. A card repeats every
// field label once per row, so five districts meant five copies of "District
// name" and "Dean" and a screenful of scrolling to compare two of them. A table
// states each label once in the header and puts the values in a column, which is
// the shape the question actually has: who is Dean of what, which churches still
// have nobody.

import { useState, useEffect, useCallback, Fragment } from "react";
import { createClient } from "@/lib/supabase/client";
import { withTitle } from "@/lib/ministry";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, Save, Church, MapPin, Users, FolderOpen, AlertTriangle, Check, ChevronRight } from "lucide-react";
import { CouncilModal } from "@/components/directory/council-modal";
import { CongregationDocsModal } from "@/components/directory/congregation-docs-modal";

interface District { id: string; name: string; dean_email: string | null; }
interface Congregation {
  id: string; name: string; district_id: string | null; head_pastor_email: string | null;
  /** Registry of Societies registration — each congregation registers separately. */
  ros_number: string | null;
  council_president_name: string | null; council_president_email: string | null;
}
interface Person {
  id: string; full_name: string;
  /** Their contact address, and the one they sign in with — often different. */
  email: string | null; user_email: string | null;
  /** PASTOR | REVEREND, or null for anyone not in ministry. */
  ordination: string | null;
  ministry_status: string | null;
  congregation_id: string | null;
}

/**
 * The address to record for a Dean or a head pastor.
 *
 * Their login where they have one, because that is what leave routing matches
 * against — lib/leave-approvers.ts compares this to the signed-in address, and
 * a contact address nobody signs in with would leave the approval unreachable.
 */
const loginOf = (p: Person) => (p.user_email || p.email || "").trim();

const isNew = (id: string) => id.startsWith("new-");

/**
 * What a row looked like when it was loaded.
 *
 * Kept so Save can appear only on rows that were actually changed. A Save button
 * on every row is a button that means nothing — with twenty congregations there
 * is no way to see which two are unsaved, which is exactly when it matters.
 */
const districtSig = (d: District) => JSON.stringify([d.name, d.dean_email]);
const congregationSig = (c: Congregation) =>
  JSON.stringify([c.name, c.district_id, c.head_pastor_email, c.ros_number]);

// Table furniture. Gridlines both ways: a row of seven values is hard to track
// across without them, and the columns here are unrelated to each other.
const th = "px-2.5 py-2 text-left text-[10.5px] font-bold uppercase tracking-wider text-stone-500 whitespace-nowrap";
const td = "px-2.5 py-1.5 align-middle";
const rowCls = "divide-x divide-stone-100 border-t border-stone-100 hover:bg-[#f8fbff]";
/**
 * Cell inputs read as text until you go near them.
 *
 * A bordered box in every cell turns a table back into the form this replaced.
 * The `!` on the size is not decoration: globals.css sets `font: inherit` on
 * inputs and selects outside any layer, and unlayered CSS beats a layered
 * utility, so a plain text-[13px] here is silently dropped.
 */
const cell = "w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 !text-[13px] text-stone-700 hover:border-stone-200 focus:bg-white";
const iconBtn = "rounded p-1 text-stone-300 transition-colors hover:bg-stone-100 hover:text-[#2f5b9c] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-stone-300";
const saveBtn = "inline-flex items-center gap-1 rounded-md bg-[#2f5b9c] px-2 py-1 !text-[11px] !font-bold text-white transition-colors hover:bg-[#24487d] disabled:opacity-40";

export default function ChurchDirectoryPage() {
  const supabase = createClient();
  const [districts, setDistricts] = useState<District[]>([]);
  const [congregations, setCongregations] = useState<Congregation[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [councilFor, setCouncilFor] = useState<Congregation | null>(null);
  const [docsFor, setDocsFor] = useState<Congregation | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  /** "districtId|personId" -> why they cannot be that district's Dean. */
  const [deanBlocks, setDeanBlocks] = useState<Record<string, string>>({});
  const [toast, setToast] = useState({ msg: "", ok: true });
  /** Row id -> its signature at load, for spotting unsaved edits. */
  const [baseline, setBaseline] = useState<Record<string, string>>({});
  /** Congregations whose leave-routing detail is open. */
  const [openRouting, setOpenRouting] = useState<Set<string>>(new Set());

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast({ msg: "", ok: true }), 3000);
  }

  const load = useCallback(async () => {
    const [{ data: d }, { data: c }, { data: p }, { data: ur }] = await Promise.all([
      supabase.from("districts").select("*").order("name"),
      supabase.from("congregations").select("*").order("name"),
      // Everybody comes from people rather than user_roles, because
      // user_roles offered shared mailboxes with no person behind them —
      // educationdesk@, mission@ — and left out anybody with a record who has
      // not signed in yet.
      //
      // Being in ministry comes from people.ministry_status (migration 154),
      // not from user_roles.is_pastor. The two were both claiming to answer "is
      // this person a pastor" and had already diverged — standing knew about
      // one, the flag about none — so the directory saw no pastors at all.
      supabase.from("people")
        .select("id,full_name,email,user_email,ordination,ministry_status,congregation_id")
        .eq("status", "ACTIVE").order("full_name"),
      // Why each person cannot be Dean of each district, from the same rule
      // the register uses. One call rather than one per person per district.
      supabase.rpc("dean_candidates"),
    ]);
    const ds = (d ?? []) as District[];
    const cs = (c ?? []) as Congregation[];
    setDistricts(ds);
    setCongregations(cs);
    setPeople((p ?? []) as Person[]);
    setBaseline(Object.fromEntries([
      ...ds.map(x => [x.id, districtSig(x)] as const),
      ...cs.map(x => [x.id, congregationSig(x)] as const),
    ]));
    setDeanBlocks(Object.fromEntries(
      ((ur ?? []) as { district_id: string; person_id: string; reason: string | null }[])
        .filter(r => r.reason)
        .map(r => [`${r.district_id}|${r.person_id}`, r.reason as string])));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("can_manage_directory");
      setCanEdit(data === true);
    })();
  }, [supabase]);

  // Deans and head pastors must be pastors; anyone can be listed if none are
  // flagged yet, so the page is still usable before people are set up.
  // Somebody with no address at all cannot be reached by a leave request, so
  // they are not offered — picking them would look like it worked.
  const reachable = people.filter(p => loginOf(p));
  const pastors = reachable.filter(p => p.ministry_status);
  const pastorOptions = pastors.length > 0 ? pastors : reachable;

  const nameFor = (email: string | null | undefined) => {
    if (!email) return null;
    const p = people.find(x => loginOf(x) === email);
    return p ? withTitle(p.full_name, p.ordination) : email;
  };

  const dirty = (id: string, sig: string) => isNew(id) || baseline[id] !== sig;

  const patchDistrict = (id: string, p: Partial<District>) =>
    setDistricts(ds => ds.map(x => x.id === id ? { ...x, ...p } : x));
  const patchCongregation = (id: string, p: Partial<Congregation>) =>
    setCongregations(cs => cs.map(x => x.id === id ? { ...x, ...p } : x));

  async function saveDistrict(d: District) {
    setSaving(true);
    const payload = { name: d.name.trim(), dean_email: d.dean_email || null, updated_at: new Date().toISOString() };
    const { error } = isNew(d.id)
      ? await supabase.from("districts").insert(payload)
      : await supabase.from("districts").update(payload).eq("id", d.id);
    setSaving(false);
    if (error) { showToast(error.message, false); return; }
    showToast("District saved");
    load();
  }

  async function deleteDistrict(id: string) {
    if (isNew(id)) { setDistricts(ds => ds.filter(x => x.id !== id)); return; }
    const used = congregations.filter(c => c.district_id === id).length;
    if (used > 0 && !confirm(`${used} congregation(s) are in this district. They'll be left without one. Delete anyway?`)) return;
    const { error } = await supabase.from("districts").delete().eq("id", id);
    if (error) { showToast(error.message, false); return; }
    showToast("District removed");
    load();
  }

  async function saveCongregation(c: Congregation) {
    setSaving(true);
    const payload = {
      name: c.name.trim(),
      district_id: c.district_id || null,
      head_pastor_email: c.head_pastor_email || null,
      ros_number: c.ros_number?.trim() || null,
      council_president_name: c.council_president_name?.trim() || null,
      council_president_email: c.council_president_email?.trim().toLowerCase() || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = isNew(c.id)
      ? await supabase.from("congregations").insert(payload)
      : await supabase.from("congregations").update(payload).eq("id", c.id);
    setSaving(false);
    if (error) { showToast(error.message, false); return; }
    showToast("Congregation saved");
    load();
  }

  async function deleteCongregation(id: string) {
    if (isNew(id)) { setCongregations(cs => cs.filter(x => x.id !== id)); return; }
    const { error } = await supabase.from("congregations").delete().eq("id", id);
    if (error) { showToast(error.message, false); return; }
    showToast("Congregation removed");
    load();
  }

  /** Who has to approve leave for this congregation, and who is still missing. */
  function routingOf(c: Congregation) {
    const district = districts.find(d => d.id === c.district_id);
    const approvers = [
      c.head_pastor_email ? `${nameFor(c.head_pastor_email)} (head pastor)` : null,
      c.council_president_email
        ? `${c.council_president_name || c.council_president_email} (Council Chairman/Rep, by email)`
        : null,
      district?.dean_email ? `${nameFor(district.dean_email)} (Dean)` : null,
    ].filter(Boolean) as string[];
    const missing = [
      c.head_pastor_email ? null : "head pastor",
      c.council_president_email ? null : "Council Chairman/Rep",
      district?.dean_email ? null : "Dean",
    ].filter(Boolean) as string[];
    return { approvers, missing };
  }

  function toggleRouting(id: string) {
    setOpenRouting(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (loading) return <div className="p-8 text-center text-sm text-stone-400">Loading…</div>;

  return (
    <div className="cloudlight-page max-w-7xl space-y-6">
      {toast.msg && (
        <div className={`fixed top-4 right-4 z-50 rounded-xl px-4 py-3 text-sm text-white shadow-lg ${toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.msg}
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#4f7fc3]">Administration</p>
        <h1 className="text-xl font-bold text-stone-800">Church Directory</h1>
        <p className="text-sm text-stone-400">
          Districts and their Deans, congregations and their Council Chairman/Rep — leave approvals for pastors are worked out from this.
        </p>
      </div>

      {/* ── Districts ─────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-stone-700">
            <MapPin size={16} className="text-[#4a6da7]" /> Districts
            <span className="text-[12px] font-normal text-stone-400">
              {districts.length} · {districts.filter(d => d.dean_email).length} with a Dean
            </span>
          </h2>
          <Button size="sm" onClick={() => setDistricts(ds => [...ds, { id: `new-${Date.now()}`, name: "", dean_email: null }])}>
            <Plus size={13} /> Add District
          </Button>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead className="bg-stone-50">
                <tr className="divide-x divide-stone-100">
                  <th className={`${th} w-[34%]`}>District</th>
                  <th className={th}>Dean</th>
                  <th className={`${th} w-24 text-center`}>Churches</th>
                  <th className={`${th} w-24`}></th>
                </tr>
              </thead>
              <tbody>
                {districts.length === 0 && (
                  <tr className="border-t border-stone-100">
                    <td colSpan={4} className="px-3 py-6 text-center text-sm text-stone-400">
                      No districts yet. Add one, then assign congregations to it below.
                    </td>
                  </tr>
                )}
                {districts.map(d => {
                  const chosen = pastorOptions.find(p => loginOf(p) === d.dean_email);
                  const why = chosen ? deanBlocks[`${d.id}|${chosen.id}`] : null;
                  const count = congregations.filter(c => c.district_id === d.id).length;
                  const changed = dirty(d.id, districtSig(d));
                  return (
                    <tr key={d.id} className={`${rowCls} ${isNew(d.id) ? "bg-[#fffdf5]" : ""}`}>
                      <td className={td}>
                        <input className={`${cell} font-semibold`} value={d.name} placeholder="e.g. Central District"
                          onChange={e => patchDistrict(d.id, { name: e.target.value })} />
                      </td>
                      <td className={td}>
                        {/* The same rule the register applies when appointing to
                            the Dean's post, so setting one here cannot get past
                            a check the other door enforces. Everyone stays
                            listed with the reason beside them rather than being
                            hidden — see the election form for why. */}
                        <select className={cell} value={d.dean_email ?? ""}
                          onChange={e => patchDistrict(d.id, { dean_email: e.target.value || null })}>
                          <option value="">— none —</option>
                          {pastorOptions.map(p => {
                            const block = deanBlocks[`${d.id}|${p.id}`];
                            return (
                              <option key={p.id} value={loginOf(p)}>
                                {withTitle(p.full_name, p.ordination)}{block ? `  ·  ${block}` : ""}
                              </option>
                            );
                          })}
                        </select>
                        {why && (
                          <p className="mt-0.5 flex items-start gap-1 px-1.5 text-[11px] text-amber-700">
                            <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                            <span>Not normally Dean here — {why}.</span>
                          </p>
                        )}
                      </td>
                      <td className={`${td} text-center text-[13px] ${count ? "text-stone-600" : "text-stone-300"}`}>
                        {count}
                      </td>
                      <td className={`${td} whitespace-nowrap text-right`}>
                        {changed && (
                          <button className={saveBtn} disabled={saving || !d.name.trim()}
                            onClick={() => saveDistrict(d)}>
                            <Save size={11} /> Save
                          </button>
                        )}
                        <button className={`${iconBtn} ml-1 hover:!text-red-600`} onClick={() => deleteDistrict(d.id)}
                          aria-label={`Delete ${d.name || "district"}`}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {/* ── Congregations ─────────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-stone-700">
            <Church size={16} className="text-[#4a6da7]" /> Congregations
            <span className="text-[12px] font-normal text-stone-400">
              {congregations.length} · {congregations.filter(c => routingOf(c).missing.length === 0).length} fully routed
            </span>
          </h2>
          <Button size="sm" onClick={() => setCongregations(cs => [...cs, { id: `new-${Date.now()}`, name: "", district_id: null, head_pastor_email: null, ros_number: null, council_president_name: null, council_president_email: null }])}>
            <Plus size={13} /> Add Congregation
          </Button>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse">
              <thead className="bg-stone-50">
                <tr className="divide-x divide-stone-100">
                  <th className={`${th} w-[20%]`}>Congregation</th>
                  <th className={`${th} w-[14%]`}>District</th>
                  <th className={`${th} w-[15%]`}>ROS number</th>
                  <th className={`${th} w-[17%]`}>Head pastor</th>
                  <th className={`${th} w-[17%]`}>Council Chairman / Rep</th>
                  <th className={`${th} w-[17%]`}>Leave routing</th>
                  <th className={`${th} w-28`}></th>
                </tr>
              </thead>
              <tbody>
                {congregations.length === 0 && (
                  <tr className="border-t border-stone-100">
                    <td colSpan={7} className="px-3 py-6 text-center text-sm text-stone-400">
                      No congregations yet.
                    </td>
                  </tr>
                )}
                {congregations.map(c => {
                  const fresh = isNew(c.id);
                  const changed = dirty(c.id, congregationSig(c));
                  const { approvers, missing } = routingOf(c);
                  const open = openRouting.has(c.id);
                  return (
                    <Fragment key={c.id}>
                      <tr className={`${rowCls} ${fresh ? "bg-[#fffdf5]" : ""}`}>
                        <td className={td}>
                          <input className={`${cell} font-semibold`} value={c.name} placeholder="e.g. Bangsar Lutheran Church"
                            onChange={e => patchCongregation(c.id, { name: e.target.value })} />
                        </td>
                        <td className={td}>
                          <select className={cell} value={c.district_id ?? ""}
                            onChange={e => patchCongregation(c.id, { district_id: e.target.value || null })}>
                            <option value="">— none —</option>
                            {districts.filter(d => !isNew(d.id)).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                        </td>
                        <td className={td}>
                          <input className={cell} value={c.ros_number ?? ""} placeholder="PPM-001-10-01011990"
                            onChange={e => patchCongregation(c.id, { ros_number: e.target.value })} />
                        </td>
                        <td className={td}>
                          <select className={cell} value={c.head_pastor_email ?? ""}
                            onChange={e => patchCongregation(c.id, { head_pastor_email: e.target.value || null })}>
                            <option value="">— none —</option>
                            {pastorOptions.map(p => (
                              <option key={p.id} value={loginOf(p)}>{withTitle(p.full_name, p.ordination)}</option>
                            ))}
                          </select>
                        </td>

                        {/* The Chairman is shown here and edited in the council,
                            not typed here as well. Two fields writing the same
                            value is how they come to disagree — the council list
                            is the place, and a trigger writes the answer back to
                            the field leave routing reads. See migration 145. */}
                        <td className={`${td} px-3`}>
                          {c.council_president_name || c.council_president_email ? (
                            <>
                              <span className="block truncate text-[13px] font-medium text-stone-700">
                                {c.council_president_name || c.council_president_email}
                              </span>
                              {c.council_president_email && c.council_president_name && (
                                <span className="block truncate text-[11px] italic text-stone-400">
                                  {c.council_president_email}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-[12px] italic text-stone-400">
                              {fresh ? "save first" : "not named"}
                            </span>
                          )}
                        </td>

                        {/* The consequence of the row, at a glance. What used to
                            be a paragraph under every card is a chip that opens
                            it — the sentence matters when something is wrong,
                            and the rest of the time it is the same sentence
                            repeated down the page. */}
                        <td className={`${td} px-3`}>
                          <button onClick={() => toggleRouting(c.id)}
                            aria-expanded={open}
                            className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 !text-[11px] !font-semibold transition-colors ${
                              missing.length === 0 ? "bg-green-50 text-green-700 hover:bg-green-100"
                                : missing.length === 3 ? "bg-stone-100 text-stone-500 hover:bg-stone-200"
                                : "bg-amber-50 text-amber-800 hover:bg-amber-100"}`}>
                            <ChevronRight size={11} className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
                            {missing.length === 0 ? <><Check size={11} className="shrink-0" /> All three set</>
                              : missing.length === 3 ? "Falls to Bishop"
                              : <span className="truncate">Needs {missing.join(", ")}</span>}
                          </button>
                        </td>

                        <td className={`${td} whitespace-nowrap text-right`}>
                          <button className={iconBtn} disabled={fresh} onClick={() => setCouncilFor(c)}
                            title={fresh ? "Save the congregation first" : "Council members"}
                            aria-label={`Council members for ${c.name || "congregation"}`}>
                            <Users size={14} />
                          </button>
                          <button className={iconBtn} disabled={fresh} onClick={() => setDocsFor(c)}
                            title={fresh ? "Save the congregation first" : "Documents"}
                            aria-label={`Documents for ${c.name || "congregation"}`}>
                            <FolderOpen size={14} />
                          </button>
                          <button className={`${iconBtn} hover:!text-red-600`} onClick={() => deleteCongregation(c.id)}
                            aria-label={`Delete ${c.name || "congregation"}`}>
                            <Trash2 size={14} />
                          </button>
                          {changed && (
                            <button className={`${saveBtn} ml-1`} disabled={saving || !c.name.trim()}
                              onClick={() => saveCongregation(c)}>
                              <Save size={11} /> Save
                            </button>
                          )}
                        </td>
                      </tr>

                      {open && (
                        <tr className="border-t border-stone-100 bg-[#f4f9ff]">
                          <td colSpan={7} className="px-4 py-2 text-xs text-stone-600">
                            {approvers.length === 0 ? (
                              <>Nothing is set here, so leave for pastors falls back to the <strong>Bishop</strong>.</>
                            ) : (
                              <>
                                Leave for pastors here needs <strong>{approvers.join(", ")}</strong>
                                {approvers.length > 1 ? " — all must approve, in any order." : "."}
                                {missing.length > 0 && (
                                  <span className="text-amber-700"> No {missing.join(" or ")} set yet.</span>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <div className="rounded-2xl border border-[#dbe9fb] bg-[#f4f9ff] p-4 text-xs text-stone-500">
        <strong>How leave routing uses this</strong> — following note 6 on the church&apos;s leave
        form. A pastor&apos;s application goes to their congregation&apos;s <strong>head
        pastor</strong>, its <strong>Council Chairman/Rep</strong> and their district
        <strong> Dean</strong>; all three must approve, in any order. A <strong>Dean&apos;s</strong> own leave goes to the <strong>Bishop</strong>. If
        neither a Council Chairman nor a Dean can be worked out, it falls back to the Bishop so an
        application is never left with nobody able to act. The Council Chairman is not LCM staff, so
        they sign through a one-time link emailed when the pastor applies. Anyone with a specific
        assignment in Leave Approvers overrides all of this.
      </div>

      {councilFor && (
        <CouncilModal
          congregationId={councilFor.id} congregationName={councilFor.name}
          canEdit={canEdit}
          onClose={() => setCouncilFor(null)}
          // The chairman the trigger just wrote back to the congregation.
          onSaved={load}
        />
      )}

      {docsFor && (
        <CongregationDocsModal
          congregationId={docsFor.id} congregationName={docsFor.name}
          canEdit={canEdit}
          onClose={() => setDocsFor(null)}
        />
      )}
    </div>
  );
}
