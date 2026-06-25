"use client";
import { useState, useEffect } from "react";
import { Plus, Trash2, CheckCircle2, AlertCircle, FileText, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FACILITIES, TIER_LABELS, FACILITY_TYPE_LABELS, getRate, formatRate, applyRateOverrides, type PricingTier, type FacilityDef, type FacilityType, type RateOverride } from "@/lib/facilities";
import type { BookingItem } from "@/lib/types";

interface BookedRange { facility_id: string; start_date: string; end_date: string }
interface BlockedRange { facility_id: string | null; start_date: string; end_date: string }

function fmt(n: number) { return "RM " + n.toLocaleString("en-MY", { minimumFractionDigits: 2 }); }

// Does [aS,aE] overlap [bS,bE]? (all yyyy-mm-dd strings)
function overlaps(aS: string, aE: string, bS: string, bE: string) {
  return aS <= bE && bS <= aE;
}

const TIER_ORDER: PricingTier[] = ["PUBLIC", "MEMBER", "CONGREGATION", "HQ"];
const TYPE_ORDER: FacilityType[] = ["AUDITORIUM", "CHAPEL", "HALL", "CLASSROOM", "GUEST_ROOM", "GARDEN"];

export default function PublicBookingPage() {
  const supabase = createClient();
  const [bookerType, setBookerType] = useState<PricingTier>("PUBLIC");
  const [bookerName, setBookerName] = useState("");
  const [bookerEmail, setBookerEmail] = useState("");
  const [bookerPhone, setBookerPhone] = useState("");
  const [bookerOrg, setBookerOrg] = useState("");
  const [eventName, setEventName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [purpose, setPurpose] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [booked, setBooked] = useState<BookedRange[]>([]);
  const [blocked, setBlocked] = useState<BlockedRange[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [menuDates, setMenuDates] = useState<Record<string, string>>({}); // per-facility availability check

  const [facilities, setFacilities] = useState<FacilityDef[]>(FACILITIES);

  function defaultItem(tier: PricingTier): BookingItem {
    const def = facilities[0];
    const rate = getRate(def, tier);
    return { facility_id: def.id, facility_name: def.name, rate_label: def.rateLabel, sessions: 1, rate_per_session: rate, is_concurrent: false, subtotal: rate };
  }
  const [items, setItems] = useState<BookingItem[]>([defaultItem("PUBLIC")]);

  useEffect(() => {
    (async () => {
      const [{ data: ranges }, { data: rates }, { data: blocks }] = await Promise.all([
        supabase.rpc("public_booked_ranges"),
        supabase.from("facility_rates").select("*"),
        supabase.rpc("public_blocked_ranges"),
      ]);
      setBooked((ranges as BookedRange[]) ?? []);
      setFacilities(applyRateOverrides((rates as RateOverride[]) ?? []));
      setBlocked((blocks as BlockedRange[]) ?? []);
    })();
  }, [supabase]);

  // recalc rates when tier or rates change
  useEffect(() => {
    setItems(prev => prev.map(it => {
      const def = facilities.find(f => f.id === it.facility_id);
      if (!def) return it;
      const rate = getRate(def, bookerType, it.is_concurrent);
      return { ...it, rate_per_session: rate, subtotal: rate * it.sessions };
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookerType, facilities]);

  const total = items.reduce((s, i) => s + i.subtotal, 0);
  const rangeEnd = endDate || startDate;

  // A facility is unavailable if it clashes with a booking, or with a block
  // (a block with no facility blocks the whole venue).
  function unavailable(facilityId: string): boolean {
    if (!startDate) return false;
    if (booked.some(b => b.facility_id === facilityId && overlaps(startDate, rangeEnd, b.start_date, b.end_date))) return true;
    if (blocked.some(b => (b.facility_id === null || b.facility_id === facilityId) && overlaps(startDate, rangeEnd, b.start_date, b.end_date))) return true;
    return false;
  }
  const conflicts = startDate ? items.filter(it => unavailable(it.facility_id)) : [];

  // Availability of a single facility on a single day, for the menu's date check.
  function freeOn(facilityId: string, day: string): boolean {
    if (!day) return true;
    if (booked.some(b => b.facility_id === facilityId && overlaps(day, day, b.start_date, b.end_date))) return false;
    if (blocked.some(b => (b.facility_id === null || b.facility_id === facilityId) && overlaps(day, day, b.start_date, b.end_date))) return false;
    return true;
  }

  function setItem(idx: number, patch: Partial<BookingItem>) {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const next = { ...it, ...patch };
      const def = facilities.find(f => f.id === next.facility_id);
      const rate = def ? getRate(def, bookerType, next.is_concurrent) : next.rate_per_session;
      next.rate_per_session = rate; next.subtotal = rate * next.sessions;
      return next;
    }));
  }

  async function submit() {
    if (!bookerName.trim()) { setError("Your name is required."); return; }
    if (!bookerEmail.trim() && !bookerPhone.trim()) { setError("Please leave a phone number or email so we can reach you."); return; }
    if (!startDate) { setError("Select a date."); return; }
    if (conflicts.length > 0) { setError("Some facilities are unavailable on the selected dates. Please adjust."); return; }
    setError(""); setSaving(true);
    try {
      const attachments: string[] = [];
      for (const f of files) {
        const path = `${Date.now()}-${f.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("booking-forms").upload(path, f);
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
        const { data: { publicUrl } } = supabase.storage.from("booking-forms").getPublicUrl(path);
        attachments.push(publicUrl);
      }
      const { data: bkNo } = await supabase.rpc("next_booking_no");
      const { error: e } = await supabase.from("facility_bookings").insert({
        booking_no: bkNo,
        booker_name: bookerName.trim(), booker_email: bookerEmail.trim(),
        booker_phone: bookerPhone.trim(), booker_org: bookerOrg.trim(), booker_type: bookerType,
        event_name: eventName.trim(), start_date: startDate, start_time: startTime,
        end_date: endDate || null, end_time: endTime,
        booking_items: items, total_amount: total, purpose: purpose.trim(),
        notes: "", internal_notes: "", attachments, status: "ENQUIRY", created_by: "public-form",
      });
      if (e) throw new Error(e.message);
      setDone(bkNo as string);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Submission failed. Please try again.");
    } finally { setSaving(false); }
  }

  const input = "w-full border border-stone-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7]";
  const label = "block text-xs font-semibold text-stone-600 mb-1";

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-stone-50">
        <div className="bg-white border border-stone-200 rounded-2xl p-8 max-w-md text-center">
          <CheckCircle2 size={44} className="text-green-600 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-stone-800">Enquiry submitted</h1>
          <p className="text-sm text-stone-500 mt-2">Your booking reference is <span className="font-mono font-semibold">{done}</span>. Our team will review and contact you to confirm availability and payment.</p>
          <button onClick={() => location.reload()} className="mt-5 text-sm text-[#4a6da7] hover:underline">Submit another enquiry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/lcm-logo.svg" width={44} height={44} alt="LCM" />
          <div>
            <h1 className="text-xl font-bold text-stone-800">Facility Booking &amp; Rates</h1>
            <p className="text-sm text-stone-500">Lutheran Church in Malaysia</p>
          </div>
        </div>

        {/* ── Facilities menu / catalogue ── */}
        <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-5">
          <h2 className="text-lg font-bold text-stone-800">Our Facilities &amp; Rates</h2>
          <p className="text-xs text-stone-400 mt-1 mb-4">
            Browse our venues and rooms below. Rates are per session unless stated. Each facility has its own availability — pick a date on a facility to check it, then submit a booking enquiry at the bottom.
          </p>

          {TYPE_ORDER.map(type => {
            const group = facilities.filter(f => f.type === type);
            if (!group.length) return null;
            return (
              <div key={type} className="mb-5 last:mb-0">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#4a6da7] mb-2">{FACILITY_TYPE_LABELS[type]}</h3>
                <div className="space-y-2">
                  {group.map(f => {
                    const fDate = menuDates[f.id] ?? "";
                    const free = freeOn(f.id, fDate);
                    return (
                      <div key={f.id} className="border border-stone-200 rounded-xl p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold text-stone-800 text-sm">{f.name}</div>
                            <div className="text-xs text-stone-400">{f.capacity} · {f.rateLabel}</div>
                          </div>
                          {fDate && (
                            <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${free ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                              {free ? "Available" : "Unavailable"}
                            </span>
                          )}
                        </div>
                        {f.includes.length > 0 && (
                          <div className="text-[11px] text-stone-400 mt-1">Includes: {f.includes.join(", ")}</div>
                        )}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-2">
                          {TIER_ORDER.map(t => (
                            <div key={t} className={`rounded-lg px-2 py-1.5 ${t === "PUBLIC" ? "bg-red-50 border border-red-200" : "bg-stone-50 border border-transparent"}`}>
                              <div className="text-[10px] text-stone-500 leading-tight">{TIER_LABELS[t]}</div>
                              <div className={`text-sm font-bold ${t === "PUBLIC" ? "text-red-700" : "text-stone-700"}`}>{formatRate(getRate(f, t))}</div>
                            </div>
                          ))}
                        </div>
                        {f.concurrentRates && (
                          <div className="text-xs text-amber-900 mt-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                            <div className="font-semibold mb-1">Concurrent rate — when booked together with Word Auditorium or Christ Chapel:</div>
                            <ul className="list-disc pl-4 space-y-0.5">
                              {TIER_ORDER.map(t => (
                                <li key={t}>{TIER_LABELS[t]} — {formatRate(getRate(f, t, true))}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {f.notes && !f.concurrentRates && (
                          <div className="text-[11px] text-stone-400 mt-1 italic">{f.notes}</div>
                        )}
                        {/* Per-facility availability check */}
                        <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-stone-100">
                          <label className="text-xs font-semibold text-stone-500 whitespace-nowrap">Check availability:</label>
                          <input type="date" value={fDate}
                            onChange={e => setMenuDates(prev => ({ ...prev, [f.id]: e.target.value }))}
                            className="border border-stone-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7]" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-6">
          {/* Applicant */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3">Your Details</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={label}>Category</label>
                <div className="flex flex-wrap gap-2">
                  {(["PUBLIC", "MEMBER", "CONGREGATION", "HQ"] as PricingTier[]).map(t => (
                    <button key={t} type="button" onClick={() => setBookerType(t)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${bookerType === t ? "bg-[#4a6da7] text-white border-transparent" : "border-stone-200 text-stone-500 hover:border-stone-300"}`}>
                      {TIER_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="col-span-2"><label className={label}>Full Name *</label><input className={input} value={bookerName} onChange={e => setBookerName(e.target.value)} /></div>
              <div><label className={label}>Phone</label><input type="tel" className={input} value={bookerPhone} onChange={e => setBookerPhone(e.target.value)} placeholder="e.g. 012-345 6789" /></div>
              <div><label className={label}>Email</label><input type="email" className={input} value={bookerEmail} onChange={e => setBookerEmail(e.target.value)} /></div>
              <div className="col-span-2 -mt-1"><p className="text-[11px] text-stone-400">Leave a phone number <span className="font-medium">or</span> an email — at least one so we can confirm availability with you.</p></div>
              <div className="col-span-2"><label className={label}>Church / Organisation</label><input className={input} value={bookerOrg} onChange={e => setBookerOrg(e.target.value)} /></div>
            </div>
          </section>

          {/* Event */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3">Event</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className={label}>Event Name</label><input className={input} value={eventName} onChange={e => setEventName(e.target.value)} /></div>
              <div><label className={label}>Start Date *</label><input type="date" className={input} value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
              <div><label className={label}>Start Time</label><input type="time" className={input} value={startTime} onChange={e => setStartTime(e.target.value)} /></div>
              <div><label className={label}>End Date</label><input type="date" className={input} value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
              <div><label className={label}>End Time</label><input type="time" className={input} value={endTime} onChange={e => setEndTime(e.target.value)} /></div>
              <div className="col-span-2"><label className={label}>Purpose / Description</label><textarea rows={2} className={`${input} resize-none`} value={purpose} onChange={e => setPurpose(e.target.value)} /></div>
            </div>
          </section>

          {/* Facilities */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-stone-400">Facilities</h2>
              <button type="button" onClick={() => setItems(p => [...p, defaultItem(bookerType)])} className="flex items-center gap-1 text-xs text-[#4a6da7] font-medium hover:underline"><Plus size={13} /> Add Facility</button>
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => {
                const clash = unavailable(it.facility_id);
                return (
                  <div key={idx}>
                    <div className="flex flex-wrap items-center gap-2">
                      <select className="flex-1 min-w-[180px] border border-stone-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-[#4a6da7]" value={it.facility_id}
                        onChange={e => { const def = facilities.find(f => f.id === e.target.value)!; setItem(idx, { facility_id: def.id, facility_name: def.name, rate_label: def.rateLabel, is_concurrent: false }); }}>
                        {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                      <input type="number" min={1} className="w-16 border border-stone-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-[#4a6da7]" value={it.sessions}
                        onChange={e => setItem(idx, { sessions: Math.max(1, parseInt(e.target.value) || 1) })} />
                      <span className="text-xs text-stone-400">{formatRate(it.rate_per_session)}/session</span>
                      <span className="text-sm font-semibold text-stone-800 ml-auto">{fmt(it.subtotal)}</span>
                      {items.length > 1 && <button type="button" onClick={() => setItems(p => p.filter((_, i) => i !== idx))} className="p-1 text-stone-300 hover:text-red-500"><Trash2 size={14} /></button>}
                    </div>
                    {clash && <p className="text-[11px] text-red-600 mt-0.5 flex items-center gap-1"><AlertCircle size={11} /> {it.facility_name} is unavailable on the selected date(s).</p>}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end mt-3 text-sm"><span className="text-stone-400 mr-2">Estimated total</span><span className="text-xl font-bold text-[#4a6da7]">{fmt(total)}</span></div>
          </section>

          {/* Scanned form */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-1">Signed &amp; Stamped Form</h2>
            <p className="text-xs text-stone-400 mb-2">Upload the booking form signed by your pastor-in-charge and bearing your church office stamp (PDF or image).</p>
            <input type="file" multiple accept="image/*,application/pdf" onChange={e => setFiles(Array.from(e.target.files ?? []))}
              className="block w-full text-sm text-stone-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#4a6da7]/10 file:text-[#4a6da7] hover:file:bg-[#4a6da7]/20" />
            {files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-stone-600"><FileText size={12} className="text-stone-400" /> {f.name}
                    <button onClick={() => setFiles(fs => fs.filter((_, idx) => idx !== i))} className="text-stone-300 hover:text-red-500"><XCircle size={12} /></button></li>
                ))}
              </ul>
            )}
          </section>

          {error && <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-xl text-sm"><AlertCircle size={15} /> {error}</div>}

          <button onClick={submit} disabled={saving || conflicts.length > 0}
            className="w-full py-2.5 rounded-xl bg-[#4a6da7] hover:bg-[#3a5a8f] text-white text-sm font-semibold transition-colors disabled:opacity-50">
            {saving ? "Submitting…" : "Submit Booking Enquiry"}
          </button>
          <p className="text-[11px] text-stone-400 text-center">This is an enquiry. Our team will confirm availability, pricing and payment before your booking is finalised.</p>
        </div>
      </div>
    </div>
  );
}
