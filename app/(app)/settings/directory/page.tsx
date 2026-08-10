"use client";
// Church Directory — districts and the Dean leading each, congregations and
// their Council Chairman/Rep.
//
// This is what leave routing is derived from. Following note 6 on the church's
// leave form, a pastor's application goes to their congregation's Council
// Chairman/Rep and their district Dean. Both change hands regularly, so this
// has to be editable here rather than hardcoded.

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Plus, Trash2, Save, Church, MapPin } from "lucide-react";

interface District { id: string; name: string; dean_email: string | null; }
interface Congregation {
  id: string; name: string; district_id: string | null; head_pastor_email: string | null;
  council_president_name: string | null; council_president_email: string | null;
}
interface Person { email: string; full_name: string; is_pastor: boolean; }

const inp = "border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7] bg-white w-full";

export default function ChurchDirectoryPage() {
  const supabase = createClient();
  const [districts, setDistricts] = useState<District[]>([]);
  const [congregations, setCongregations] = useState<Congregation[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ msg: "", ok: true });

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast({ msg: "", ok: true }), 3000);
  }

  const load = useCallback(async () => {
    const [{ data: d }, { data: c }, { data: p }] = await Promise.all([
      supabase.from("districts").select("*").order("name"),
      supabase.from("congregations").select("*").order("name"),
      supabase.from("user_roles").select("email,full_name,is_pastor").order("full_name"),
    ]);
    setDistricts((d ?? []) as District[]);
    setCongregations((c ?? []) as Congregation[]);
    setPeople((p ?? []) as Person[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Deans and head pastors must be pastors; anyone can be listed if none are
  // flagged yet, so the page is still usable before people are set up.
  const pastors = people.filter(p => p.is_pastor);
  const pastorOptions = pastors.length > 0 ? pastors : people;

  async function saveDistrict(d: District) {
    setSaving(true);
    const payload = { name: d.name.trim(), dean_email: d.dean_email || null, updated_at: new Date().toISOString() };
    const { error } = d.id.startsWith("new-")
      ? await supabase.from("districts").insert(payload)
      : await supabase.from("districts").update(payload).eq("id", d.id);
    setSaving(false);
    if (error) { showToast(error.message, false); return; }
    showToast("District saved");
    load();
  }

  async function deleteDistrict(id: string) {
    if (id.startsWith("new-")) { setDistricts(ds => ds.filter(x => x.id !== id)); return; }
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
      council_president_name: c.council_president_name?.trim() || null,
      council_president_email: c.council_president_email?.trim().toLowerCase() || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = c.id.startsWith("new-")
      ? await supabase.from("congregations").insert(payload)
      : await supabase.from("congregations").update(payload).eq("id", c.id);
    setSaving(false);
    if (error) { showToast(error.message, false); return; }
    showToast("Congregation saved");
    load();
  }

  async function deleteCongregation(id: string) {
    if (id.startsWith("new-")) { setCongregations(cs => cs.filter(x => x.id !== id)); return; }
    const { error } = await supabase.from("congregations").delete().eq("id", id);
    if (error) { showToast(error.message, false); return; }
    showToast("Congregation removed");
    load();
  }

  if (loading) return <div className="p-8 text-center text-sm text-stone-400">Loading…</div>;

  return (
    <div className="cloudlight-page max-w-5xl space-y-6">
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
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-stone-700">
            <MapPin size={16} className="text-[#4a6da7]" /> Districts
          </h2>
          <Button size="sm" onClick={() => setDistricts(ds => [...ds, { id: `new-${Date.now()}`, name: "", dean_email: null }])}>
            <Plus size={13} /> Add District
          </Button>
        </div>

        {districts.length === 0 && (
          <p className="px-1 text-sm text-stone-400">No districts yet. Add one, then assign congregations to it below.</p>
        )}

        {districts.map(d => (
          <Card key={d.id}>
            <CardBody className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-stone-400">District name</label>
                  <input className={inp} value={d.name} placeholder="e.g. Central District"
                    onChange={e => setDistricts(ds => ds.map(x => x.id === d.id ? { ...x, name: e.target.value } : x))} />
                </div>
                <div>
                  <label className="text-xs text-stone-400">Dean</label>
                  <select className={inp} value={d.dean_email ?? ""}
                    onChange={e => setDistricts(ds => ds.map(x => x.id === d.id ? { ...x, dean_email: e.target.value || null } : x))}>
                    <option value="">— none —</option>
                    {pastorOptions.map(p => <option key={p.email} value={p.email}>{p.full_name || p.email}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2 border-t border-stone-100 pt-2">
                <Button size="sm" variant="secondary" loading={saving} onClick={() => saveDistrict(d)} disabled={!d.name.trim()}>
                  <Save size={13} /> Save
                </Button>
                <span className="text-xs text-stone-400">
                  {congregations.filter(c => c.district_id === d.id).length} congregation(s)
                </span>
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => deleteDistrict(d.id)}>
                  <Trash2 size={13} className="text-red-400" />
                </Button>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* ── Congregations ─────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-stone-700">
            <Church size={16} className="text-[#4a6da7]" /> Congregations
          </h2>
          <Button size="sm" onClick={() => setCongregations(cs => [...cs, { id: `new-${Date.now()}`, name: "", district_id: null, head_pastor_email: null, council_president_name: null, council_president_email: null }])}>
            <Plus size={13} /> Add Congregation
          </Button>
        </div>

        {congregations.map(c => {
          const district = districts.find(d => d.id === c.district_id);
          const deanName = people.find(p => p.email === district?.dean_email)?.full_name;
          return (
            <Card key={c.id}>
              <CardBody className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="text-xs text-stone-400">Congregation name</label>
                    <input className={inp} value={c.name} placeholder="e.g. Bangsar Lutheran Church"
                      onChange={e => setCongregations(cs => cs.map(x => x.id === c.id ? { ...x, name: e.target.value } : x))} />
                  </div>
                  <div>
                    <label className="text-xs text-stone-400">District</label>
                    <select className={inp} value={c.district_id ?? ""}
                      onChange={e => setCongregations(cs => cs.map(x => x.id === c.id ? { ...x, district_id: e.target.value || null } : x))}>
                      <option value="">— none —</option>
                      {districts.filter(d => !d.id.startsWith("new-")).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-stone-400">Head pastor</label>
                    <select className={inp} value={c.head_pastor_email ?? ""}
                      onChange={e => setCongregations(cs => cs.map(x => x.id === c.id ? { ...x, head_pastor_email: e.target.value || null } : x))}>
                      <option value="">— none —</option>
                      {pastorOptions.map(p => <option key={p.email} value={p.email}>{p.full_name || p.email}</option>)}
                    </select>
                  </div>
                </div>

                {/* The Council Chairman/Rep holds a church council office, not
                    an LCM post, so they have no login here — they are named on
                    the congregation and approve by emailed link. */}
                <div className="grid gap-3 border-t border-stone-100 pt-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs text-stone-400">Council Chairman / Rep</label>
                    <input className={inp} value={c.council_president_name ?? ""} placeholder="Full name"
                      onChange={e => setCongregations(cs => cs.map(x => x.id === c.id ? { ...x, council_president_name: e.target.value } : x))} />
                  </div>
                  <div>
                    <label className="text-xs text-stone-400">Council Chairman&apos;s email</label>
                    <input className={inp} type="email" value={c.council_president_email ?? ""} placeholder="chairman@example.com"
                      onChange={e => setCongregations(cs => cs.map(x => x.id === c.id ? { ...x, council_president_email: e.target.value } : x))} />
                    <p className="mt-1 text-[11px] text-stone-400">
                      Any address — the Council Chairman is not LCM staff and has no login here.
                      They approve through a one-time emailed link.
                    </p>
                  </div>
                </div>

                {/* The consequence of the settings above, stated plainly. */}
                <p className="rounded-lg bg-[#f4f9ff] px-3 py-2 text-xs text-stone-600">
                  {(() => {
                    // Named plainly so a gap here is obvious before it
                    // misroutes somebody's leave.
                    const parts = [
                      c.head_pastor_email
                        ? `${people.find(p => p.email === c.head_pastor_email)?.full_name || c.head_pastor_email} (head pastor)`
                        : null,
                      c.council_president_email
                        ? `${c.council_president_name || c.council_president_email} (Council Chairman/Rep, by email)`
                        : null,
                      district?.dean_email
                        ? `${deanName || district.dean_email} (Dean)`
                        : null,
                    ].filter(Boolean) as string[];
                    if (parts.length === 0) {
                      return <>Nothing is set here, so leave for pastors falls back to the <strong>Bishop</strong>.</>;
                    }
                    const missing = [
                      c.head_pastor_email ? null : "head pastor",
                      c.council_president_email ? null : "Council Chairman/Rep",
                      district?.dean_email ? null : "Dean",
                    ].filter(Boolean) as string[];
                    return (
                      <>
                        Leave for pastors here needs <strong>{parts.join(", ")}</strong>
                        {parts.length > 1 ? " — all must approve." : "."}
                        {missing.length > 0 && (
                          <span className="text-amber-700"> No {missing.join(" or ")} set yet.</span>
                        )}
                      </>
                    );
                  })()}
                </p>

                <div className="flex items-center gap-2 border-t border-stone-100 pt-2">
                  <Button size="sm" variant="secondary" loading={saving} onClick={() => saveCongregation(c)} disabled={!c.name.trim()}>
                    <Save size={13} /> Save
                  </Button>
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => deleteCongregation(c.id)}>
                    <Trash2 size={13} className="text-red-400" />
                  </Button>
                </div>
              </CardBody>
            </Card>
          );
        })}

        {congregations.length === 0 && (
          <p className="px-1 text-sm text-stone-400">No congregations yet.</p>
        )}
      </div>

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
    </div>
  );
}
