"use client";
// Adding someone, one question at a time.
//
// The form used to ask four things of everybody and then send them to the
// profile to say what actually mattered — so a pastor was created with no
// standing and no congregation, and was therefore ineligible for every post
// until somebody went back and filled it in. The facts that decide what
// somebody can hold belong at the moment they are added, not two screens later.
//
// So it opens small and grows: category first, then only the questions that
// category has an answer to. A vendor is never asked about ordination.

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { fieldClass, labelClass } from "@/lib/field-styles";
import { Users } from "lucide-react";

export interface AddPersonCategory { key: string; one: string }

export function AddPersonModal({ categories, onClose, onCreated }: {
  categories: readonly AddPersonCategory[];
  onClose: () => void;
  onCreated: (id: string, name: string) => void;
}) {
  const supabase = createClient();
  const [fullName, setFullName] = useState("");
  const [category, setCategory] = useState<string>("HQ_STAFF");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Pastors
  const [standing, setStanding] = useState("");
  const [posting, setPosting] = useState("");
  const [congregationId, setCongregationId] = useState("");
  const [isHeadPastor, setIsHeadPastor] = useState(false);
  // HQ staff, and pastors posted to HQ
  const [department, setDepartment] = useState("");
  // Vendors, agents, partners, anyone else
  const [serviceType, setServiceType] = useState("");

  const [congregations, setCongregations] = useState<{ id: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [services, setServices] = useState<{ key: string; label: string }[]>([]);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);
  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: d }, { data: sv }] = await Promise.all([
        supabase.from("congregations").select("id,name").order("name"),
        supabase.from("departments").select("id,name").order("name"),
        supabase.from("service_types").select("key,label").eq("active", true).order("sort_order"),
      ]);
      setCongregations((c ?? []) as { id: string; name: string }[]);
      setDepartments((d ?? []) as { id: string; name: string }[]);
      setServices((sv ?? []) as { key: string; label: string }[]);
    })();
  }, [supabase]);

  const isPastor = category === "PASTOR";
  const isStaff = category === "HQ_STAFF";
  const needsService = ["VENDOR", "AGENT", "PARTNER", "OTHER"].includes(category);
  // A retired pastor who has stopped working is posted nowhere, so the question
  // is not put to them. Everyone else in ministry is somewhere, and where decides
  // what is asked next: a department, or a congregation.
  const asksPosting = isPastor && ["PASTOR", "REVEREND", "RETIRED_WORKING"].includes(standing);
  const postedToHQ = asksPosting && posting === "HQ";
  const postedToCongregation = asksPosting && posting === "CONGREGATION";
  const canBeHeadPastor = postedToCongregation && standing === "REVEREND" && !!congregationId;
  // Both HQ staff and a pastor posted to HQ sit in a department.
  const asksDepartment = isStaff || postedToHQ;

  /** What this person will be able to stand for, while it can still be corrected. */
  const qualifies = (() => {
    if (!isPastor || !standing) return null;
    if (standing === "REVEREND") {
      if (isHeadPastor && congregationId) {
        return "As an ordained head pastor they can stand for Bishop, Secretary, an EXCO portfolio, and Dean of their district.";
      }
      if (postedToHQ) {
        return "As a Reverend they can stand for Bishop, Secretary and an EXCO portfolio. Dean is a district post, so it is not open to somebody posted to HQ.";
      }
      return congregationId
        ? "As a Reverend they can stand for Bishop, Secretary and an EXCO portfolio — and for Dean of the district their congregation is in."
        : "As a Reverend they can stand for Bishop, Secretary and an EXCO portfolio. A congregation is needed before they can be Dean.";
    }
    if (standing === "PASTOR") {
      return "Not yet ordained, so not eligible for Bishop, Secretary or Dean. An EXCO portfolio is open to them.";
    }
    return "Retired, so not eligible for Bishop, Secretary, Dean or an EXCO portfolio.";
  })();

  async function save() {
    if (!fullName.trim()) { setErr("A name is required"); return; }
    if (isPastor && !standing) { setErr("Choose their standing — it decides what they can hold"); return; }
    setErr(""); setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const addr = email.trim().toLowerCase() || null;

      // A typed department or service that is not on the list yet joins it, so
      // the next person picks it rather than retyping a near-miss.
      if (asksDepartment && department.trim()
          && !departments.some(d => d.name.toLowerCase() === department.trim().toLowerCase())) {
        await supabase.from("departments").insert({ name: department.trim() });
      }
      if (needsService && serviceType.trim()
          && !services.some(x => x.label.toLowerCase() === serviceType.trim().toLowerCase())) {
        await supabase.from("service_types").insert({
          key: serviceType.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 40),
          label: serviceType.trim(),
          created_by: user?.email ?? "",
        });
      }

      const { data, error } = await supabase.from("people").insert({
        full_name: fullName.trim(),
        category,
        status: "ACTIVE",
        email: addr,
        phone: phone.trim() || null,
        pastor_standing: isPastor ? standing : null,
        posting: asksPosting ? (posting || null) : null,
        congregation_id: postedToCongregation && congregationId ? congregationId : null,
        // Anybody LCM records as its own ministry is of LCM, wherever they are
        // posted. Set here because eligibility reads affiliation, and somebody
        // left blank is refused for posts they plainly qualify for.
        affiliation: isPastor ? "LCM_MEMBER" : null,
        hq_department: asksDepartment ? (department.trim() || null) : null,
        vendor_service: needsService ? (serviceType.trim() || null) : null,
        created_by: user?.email ?? "",
      }).select("id").single();
      if (error) throw new Error(error.message);

      // Head pastor lives on the congregation, which is what leave routing and
      // the Dean rule both read. Written here so the two cannot disagree.
      if (canBeHeadPastor && isHeadPastor) {
        if (!addr) throw new Error("A head pastor needs an email — it is how leave reaches them.");
        const { error: hpErr } = await supabase.from("congregations")
          .update({ head_pastor_email: addr }).eq("id", congregationId);
        if (hpErr) throw new Error(hpErr.message);
      }

      onCreated(data.id as string, fullName.trim());
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not add them");
    } finally {
      setSaving(false);
    }
  }

  const departmentField = (
    <div>
      <label className={labelClass}>Department</label>
      <input className={fieldClass} list="dept-options" value={department}
        onChange={e => setDepartment(e.target.value)}
        placeholder="Pick one, or type a new one" />
      <datalist id="dept-options">
        {departments.map(d => <option key={d.id} value={d.name} />)}
      </datalist>
      <p className="mt-1 text-[11px] text-stone-500">
        A department typed here joins the list and is offered wherever it is asked for.
      </p>
    </div>
  );

  return (
    <Modal title="Add a person"
      description="Only what this kind of person has an answer to — the rest is on their profile."
      onClose={onClose}
      footer={<>
        <Button className="flex-1" loading={saving} onClick={save}>
          <Users size={14} /> Add and open profile
        </Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </>}>

      <div>
        <label className={labelClass}>Full name *</label>
        <input ref={nameRef} className={fieldClass} value={fullName}
          onChange={e => setFullName(e.target.value)} placeholder="e.g. Andrew Tay" />
      </div>

      <div>
        <label className={labelClass}>Category</label>
        <select className={fieldClass} value={category}
          onChange={e => {
            setCategory(e.target.value);
            // Answers to questions this category will not ask must not carry
            // over — they would be saved unseen.
            setStanding(""); setPosting(""); setCongregationId(""); setIsHeadPastor(false);
            setDepartment(""); setServiceType("");
          }}>
          {categories.map(c => <option key={c.key} value={c.key}>{c.one}</option>)}
        </select>
      </div>

      {/* ── Pastors ──────────────────────────────────────────────────── */}
      {isPastor && (
        <div className="space-y-2 rounded-xl border-2 border-[#dbe9fb] bg-[#f8fbff] p-3">
          <div>
            <label className={labelClass}>Standing *</label>
            <select className={fieldClass} value={standing}
              onChange={e => {
                setStanding(e.target.value);
                setPosting(""); setCongregationId(""); setIsHeadPastor(false); setDepartment("");
              }}>
              <option value="">— choose —</option>
              <option value="PASTOR">Pastor (unordained)</option>
              <option value="REVEREND">Rev. (ordained)</option>
              <option value="RETIRED_WORKING">Retired pastor (still working on contract)</option>
              <option value="RETIRED">Retired pastor (not working)</option>
            </select>
          </div>

          {asksPosting && (
            <div>
              <label className={labelClass}>Posted at</label>
              <select className={fieldClass} value={posting}
                onChange={e => {
                  setPosting(e.target.value);
                  setCongregationId(""); setIsHeadPastor(false); setDepartment("");
                }}>
                <option value="">— choose —</option>
                <option value="CONGREGATION">An LCM congregation</option>
                <option value="HQ">HQ</option>
              </select>
              <p className="mt-1 text-[11px] text-stone-500">
                Not every pastor serves a church. Somebody ordained can be based at HQ running
                a desk, and asking them which congregation would only get a wrong answer.
              </p>
            </div>
          )}

          {postedToCongregation && (
            <div>
              <label className={labelClass}>Which congregation</label>
              <select className={fieldClass} value={congregationId}
                onChange={e => { setCongregationId(e.target.value); if (!e.target.value) setIsHeadPastor(false); }}>
                <option value="">— not recorded —</option>
                {congregations.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {congregations.length === 0 && (
                <p className="mt-1 text-[11px] text-amber-700">
                  No congregations yet — add them in the Church Directory first.
                </p>
              )}
            </div>
          )}

          {postedToHQ && departmentField}

          {canBeHeadPastor && (
            <label className="flex items-start gap-2 text-[13px] text-stone-700">
              <input type="checkbox" className="mt-0.5 h-3.5 w-3.5 accent-[#2f5b9c]"
                checked={isHeadPastor} onChange={e => setIsHeadPastor(e.target.checked)} />
              <span>
                Head pastor of this congregation
                <span className="block text-[11px] text-stone-500">
                  Recorded on the congregation, where leave routing and the Dean rule both read it.
                  Needs their email.
                </span>
              </span>
            </label>
          )}

          {qualifies && (
            <p className="rounded-lg bg-white px-2.5 py-2 text-[12px] text-stone-600">{qualifies}</p>
          )}
        </div>
      )}

      {/* ── HQ staff ─────────────────────────────────────────────────── */}
      {isStaff && departmentField}

      {/* ── Vendors, agents, partners, anyone else ───────────────────── */}
      {needsService && (
        <div>
          <label className={labelClass}>
            {category === "VENDOR" ? "What they supply"
              : category === "AGENT" ? "What they do for LCM"
              : category === "PARTNER" ? "Their part" : "Type"}
          </label>
          <input className={fieldClass} list="service-options" value={serviceType}
            onChange={e => setServiceType(e.target.value)}
            placeholder="e.g. Fire protection system, company secretarial" />
          <datalist id="service-options">
            {services.map(x => <option key={x.key} value={x.label} />)}
          </datalist>
          <p className="mt-1 text-[11px] text-stone-500">
            Anything typed here joins the list, so the next one picks the same words.
          </p>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Email</label>
          <input className={fieldClass} type="email" value={email}
            onChange={e => setEmail(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Phone</label>
          <input className={fieldClass} value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
      </div>

      {err && <p className="text-xs font-medium text-red-600" role="alert">{err}</p>}
    </Modal>
  );
}
