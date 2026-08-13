"use client";
// "Who may verify for me."
//
// A ministry's vouchers stop dead when its EXCO member is away, and the ways
// round that were all bad — lend out a password, or move the portfolio. So the
// holder can name someone instead: a person, or a committee where any current
// member may act.
//
// Scope is the part that matters. A building project has its own committee and
// its own budget line, and they should be able to clear that line without
// seeing the rest of the ministry's spending. Naming budget lines is therefore
// the narrower, and usually the right, choice — "everything" is offered but is
// not the default.
//
// Nothing here transfers the portfolio. The holder keeps their own right to
// verify and can stop a delegation at any time.

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { fieldClass, labelClass } from "@/lib/field-styles";
import { loadBudgetProjects } from "@/lib/budget-utils";
import { formatDate } from "@/lib/utils";
import { UserPlus, Users, User, AlertTriangle, X } from "lucide-react";

interface Person { id: string; full_name: string; user_email: string | null }
interface Office { id: string; name: string; kind: string }

interface Delegation {
  id: string;
  ministry: string;
  person_id: string | null;
  office_id: string | null;
  projects: string[];
  granted_by: string | null;
  note: string | null;
  ends_on: string | null;
}

export function VerifierPanel({ ministries, myEmail }: {
  /** The portfolios this person holds — only these can be delegated. */
  ministries: string[];
  myEmail: string;
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<Delegation[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    if (!ministries.length) { setLoading(false); return; }
    setLoading(true);
    const [{ data: d }, { data: p }, { data: o }] = await Promise.all([
      supabase.from("ministry_verifiers").select("*")
        .in("ministry", ministries).eq("active", true)
        .order("created_at", { ascending: false }),
      supabase.from("people").select("id,full_name,user_email")
        .eq("status", "ACTIVE").order("full_name"),
      // Committees seat several people, so any current member can cover — a
      // single-holder post would just be a person by another name.
      supabase.from("offices").select("id,name,kind")
        .in("kind", ["COMMITTEE", "PROJECT"]).eq("active", true).order("name"),
    ]);
    setRows((d ?? []) as Delegation[]);
    setPeople((p ?? []) as Person[]);
    setOffices((o ?? []) as Office[]);
    setLoading(false);
  }, [supabase, ministries]);

  useEffect(() => { load(); }, [load]);

  async function stop(row: Delegation) {
    const who = row.person_id
      ? people.find(p => p.id === row.person_id)?.full_name
      : offices.find(o => o.id === row.office_id)?.name;
    if (!confirm(`Stop ${who ?? "this delegation"} from verifying for ${row.ministry}?`)) return;
    const { error } = await supabase.from("ministry_verifiers")
      .update({ active: false, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (error) { setMsg(error.message); return; }
    setMsg("");
    await load();
  }

  if (!ministries.length) return null;

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-stone-800">Who may verify for me</h2>
            <p className="text-xs text-stone-500">
              Name someone to verify {ministries.length === 1 ? ministries[0] : "your ministries"}&rsquo;
              spending when you cannot. You keep your own right to verify, and can stop this at any time.
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <UserPlus size={13} /> Add
          </Button>
        </div>

        {msg && <p className="text-xs font-medium text-red-600" role="alert">{msg}</p>}

        {loading ? (
          <p className="text-xs text-stone-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border-2 border-dashed border-stone-300 px-3 py-4 text-center text-xs text-stone-500">
            Nobody else can verify for you. Your ministry&rsquo;s vouchers wait for you alone.
          </p>
        ) : (
          <ul className="divide-y divide-stone-200 border-2 border-stone-800 rounded-lg">
            {rows.map(r => {
              const person = r.person_id ? people.find(p => p.id === r.person_id) : null;
              const office = r.office_id ? offices.find(o => o.id === r.office_id) : null;
              // A delegate with no sign-in address cannot actually act. Better
              // said here than discovered when a voucher sits unverified.
              const cannotSignIn = !!person && !person.user_email;
              return (
                <li key={r.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-stone-800">
                      {office ? <Users size={13} className="text-stone-400" /> : <User size={13} className="text-stone-400" />}
                      {person?.full_name ?? office?.name ?? "Unknown"}
                      {office && <span className="text-[11px] font-medium text-stone-400">(any current member)</span>}
                    </div>
                    <div className="text-xs text-stone-500">
                      {r.ministry} ·{" "}
                      {r.projects.length === 0
                        ? "everything the ministry spends"
                        : r.projects.join(", ")}
                      {r.ends_on && ` · until ${formatDate(r.ends_on)}`}
                    </div>
                    {r.note && <div className="text-[11px] text-stone-400">{r.note}</div>}
                    {cannotSignIn && (
                      <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-red-600">
                        <AlertTriangle size={11} />
                        No sign-in address — they cannot act until one is set in the People Directory
                      </div>
                    )}
                  </div>
                  <button onClick={() => stop(r)}
                    className="shrink-0 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-red-600"
                    aria-label={`Stop ${person?.full_name ?? office?.name} verifying`}>
                    <X size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>

      {adding && (
        <AddDelegate
          ministries={ministries} people={people} offices={offices} myEmail={myEmail}
          onClose={() => setAdding(false)}
          onSaved={async () => { setAdding(false); await load(); }}
        />
      )}
    </Card>
  );
}

function AddDelegate({ ministries, people, offices, myEmail, onClose, onSaved }: {
  ministries: string[];
  people: Person[];
  offices: Office[];
  myEmail: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [ministry, setMinistry] = useState(ministries[0]);
  const [kind, setKind] = useState<"PERSON" | "COMMITTEE">("PERSON");
  const [personId, setPersonId] = useState("");
  const [officeId, setOfficeId] = useState("");
  const [projects, setProjects] = useState<string[]>([]);
  const [available, setAvailable] = useState<string[]>([]);
  const [wholeMinistry, setWholeMinistry] = useState(false);
  const [endsOn, setEndsOn] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // The budget lines this ministry actually has. Without them "certain items of
  // the budget" would mean typing names that have to match exactly.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await loadBudgetProjects(supabase, ministry);
      if (!cancelled) { setAvailable(list); setProjects([]); }
    })();
    return () => { cancelled = true; };
  }, [supabase, ministry]);

  const chosen = kind === "PERSON" ? personId : officeId;
  const chosenPerson = people.find(p => p.id === personId);

  async function save() {
    if (!chosen) { setErr("Choose who verifies"); return; }
    if (!wholeMinistry && projects.length === 0) {
      setErr("Pick the budget lines they cover, or give them the whole ministry");
      return;
    }
    setErr(""); setSaving(true);
    const { error } = await supabase.from("ministry_verifiers").insert({
      ministry,
      person_id: kind === "PERSON" ? personId : null,
      office_id: kind === "COMMITTEE" ? officeId : null,
      projects: wholeMinistry ? [] : projects,
      granted_by: myEmail,
      note: note.trim() || null,
      ends_on: endsOn || null,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  }

  return (
    <Modal
      title="Ask someone to verify for you"
      description="They will be able to verify and reject this ministry's payment requests and vouchers, in your place. Your own right to verify is unaffected."
      onClose={onClose}
      footer={<>
        <Button className="flex-1" loading={saving} onClick={save}>
          <UserPlus size={13} /> Add
        </Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </>}
    >
      {ministries.length > 1 && (
        <div>
          <label className={labelClass}>Ministry</label>
          <select className={fieldClass} value={ministry} onChange={e => setMinistry(e.target.value)}>
            {ministries.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      )}

      <div>
        <label className={labelClass}>Who verifies</label>
        <div className="mb-2 flex gap-1 rounded-lg bg-stone-100 p-1">
          {(["PERSON", "COMMITTEE"] as const).map(k => (
            <button key={k} type="button" onClick={() => setKind(k)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                kind === k ? "bg-white text-stone-800 shadow-sm" : "text-stone-500 hover:text-stone-700"
              }`}>
              {k === "PERSON" ? "A person" : "A committee"}
            </button>
          ))}
        </div>
        {kind === "PERSON" ? (
          <>
            <select className={fieldClass} value={personId} onChange={e => setPersonId(e.target.value)}>
              <option value="">Choose a person…</option>
              {people.map(p => (
                <option key={p.id} value={p.id}>
                  {p.full_name}{p.user_email ? "" : " — no sign-in address"}
                </option>
              ))}
            </select>
            {chosenPerson && !chosenPerson.user_email && (
              <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-red-600">
                <AlertTriangle size={11} />
                {chosenPerson.full_name} has no sign-in address, so they cannot act yet.
                Set one on their profile in the People Directory.
              </p>
            )}
          </>
        ) : (
          <>
            <select className={fieldClass} value={officeId} onChange={e => setOfficeId(e.target.value)}>
              <option value="">Choose a committee…</option>
              {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-stone-500">
              Any member serving a current term may verify. Members who leave the committee
              stop being able to, without you having to change anything here.
            </p>
          </>
        )}
      </div>

      <div>
        <label className={labelClass}>What they may verify</label>
        {available.length === 0 ? (
          <p className="rounded-lg border-2 border-stone-300 bg-stone-50 px-3 py-2 text-xs text-stone-600">
            {ministry} has no budget lines recorded, so this can only cover the whole ministry.
          </p>
        ) : (
          <div className="space-y-1.5 rounded-lg border-2 border-stone-800 p-2.5">
            {available.map(proj => (
              <label key={proj} className={`flex items-center gap-2 text-sm ${
                wholeMinistry ? "text-stone-400" : "text-stone-700"}`}>
                <input type="checkbox" className="h-4 w-4 accent-[#2f5b9c]"
                  disabled={wholeMinistry}
                  checked={projects.includes(proj)}
                  onChange={e => setProjects(prev =>
                    e.target.checked ? [...prev, proj] : prev.filter(p => p !== proj))} />
                {proj}
              </label>
            ))}
          </div>
        )}
        <label className="mt-2 flex items-center gap-2 text-sm font-medium text-stone-700">
          <input type="checkbox" className="h-4 w-4 accent-[#2f5b9c]"
            checked={wholeMinistry || available.length === 0}
            disabled={available.length === 0}
            onChange={e => setWholeMinistry(e.target.checked)} />
          Everything {ministry} spends
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Until</label>
          <input type="date" className={fieldClass} value={endsOn}
            onChange={e => setEndsOn(e.target.value)} />
          <p className="mt-1 text-[11px] text-stone-500">
            Leave blank to keep it open. A date ends it by itself.
          </p>
        </div>
        <div>
          <label className={labelClass}>Why</label>
          <input className={fieldClass} value={note} onChange={e => setNote(e.target.value)}
            placeholder="e.g. while I am on sabbatical" />
        </div>
      </div>

      {err && <p className="text-xs font-medium text-red-600" role="alert">{err}</p>}
    </Modal>
  );
}
