"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Plus, ChevronDown, ChevronUp, Trash2, CheckCircle,
  FileText, DollarSign, XCircle, AlertCircle, Share2, Percent, CalendarDays, Clock, RotateCcw, Send,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { UserProfile, FacilityBooking, BookingItem, FacilityBlock, FacilityBlockReason, BookingEventType } from "@/lib/types";
import {
  FACILITIES, TIER_LABELS, TIER_COLORS, getRate, formatRate, applyRateOverrides, fmtHour, fmtCurrency as fmt, fmtDate,
  EVENT_TYPES, CONCURRENT_TRIGGERS, CONCURRENT_HALLS, dateRangesOverlap as rangesOverlap,
  type PricingTier, type FacilityDef, type RateOverride,
} from "@/lib/facilities";
import { ReceiptPdfButton } from "@/components/income/receipt-pdf";
import { BookingCalendar } from "@/components/bookings/booking-calendar";
import { FacilityLineRow } from "@/components/bookings/facility-line-row";
import { SignaturePad } from "@/components/ui/signature-pad";
import { AttachmentPreview } from "@/components/attachment-preview";

// ─── helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<FacilityBooking["status"], string> = {
  ENQUIRY:   "Enquiry",
  CONFIRMED: "Confirmed",
  INVOICED:  "Invoiced",
  PAID:      "Paid",
  CANCELLED: "Cancelled",
};

const STATUS_COLORS: Record<FacilityBooking["status"], string> = {
  ENQUIRY:   "bg-amber-100 text-amber-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  INVOICED:  "bg-purple-100 text-purple-700",
  PAID:      "bg-green-100 text-green-700",
  CANCELLED: "bg-stone-100 text-stone-500",
};

const METHODS = ["Cash", "Bank Transfer", "Cheque", "Online Transfer", "Other"];

// ─── New booking modal ────────────────────────────────────────────────────────

interface NewBookingModalProps {
  user: UserProfile;
  facilities: FacilityDef[];
  bookings: FacilityBooking[];
  blocks: FacilityBlock[];
  onClose: () => void;
  onSaved: () => void;
}

function ymdOnly(s: string | null | undefined) { return s ? s.split("T")[0] : ""; }

function NewBookingModal({ user, facilities, bookings, blocks, onClose, onSaved }: NewBookingModalProps) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Booker
  const [bookerType, setBookerType]   = useState<PricingTier>("PUBLIC");
  const [bookerName, setBookerName]   = useState("");
  const [bookerEmail, setBookerEmail] = useState("");
  const [bookerPhone, setBookerPhone] = useState("");
  const [bookerOrg, setBookerOrg]     = useState("");

  // Event (dates AND times now live per-facility on the line items)
  const [eventType, setEventType]   = useState<BookingEventType | "">("");
  const [eventName, setEventName]   = useState("");
  const [purpose, setPurpose]       = useState("");
  const [notes, setNotes]           = useState("");
  const [internalNotes, setInternal] = useState("");
  const [files, setFiles]           = useState<File[]>([]);

  // Line items — each facility carries its OWN session dates.
  function defaultItem(tier: PricingTier): BookingItem {
    const def = facilities[0];
    const rate = getRate(def, tier);
    return {
      facility_id: def.id,
      facility_name: def.name,
      rate_label: def.rateLabel,
      sessions: 0,
      dates: [],
      rate_per_session: rate,
      is_concurrent: false,
      subtotal: 0,
    };
  }
  const [items, setItems] = useState<BookingItem[]>([defaultItem("PUBLIC")]);

  // Re-calculate all item rates when tier changes (subtotal = rate × #dates)
  useEffect(() => {
    setItems(prev => prev.map(it => {
      const def = facilities.find(f => f.id === it.facility_id);
      if (!def) return it;
      const rate = getRate(def, bookerType, it.is_concurrent);
      const n = (it.dates ?? []).length;
      return { ...it, rate_per_session: rate, sessions: n, subtotal: rate * n };
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookerType]);

  const total = items.reduce((s, i) => s + i.subtotal, 0);

  function addItem() {
    setItems(prev => [...prev, defaultItem(bookerType)]);
  }

  // ── Availability: respect existing bookings + maintenance/rehearsal blocks ──
  // A single day is unavailable for a specific facility if it clashes with a
  // booking for that facility or a block (facility-specific or venue-wide).
  function isDayUnavailable(facilityId: string, day: string): boolean {
    const booked = bookings.some(b => {
      if (b.status === "CANCELLED") return false;
      const it = (b.booking_items ?? []).find(bi => bi.facility_id === facilityId);
      if (!it) return false;
      // Newer bookings carry per-facility dates; older ones only a start/end range.
      if (it.dates && it.dates.length > 0) return it.dates.map(ymdOnly).includes(day);
      return !!b.start_date && rangesOverlap(day, day, ymdOnly(b.start_date), ymdOnly(b.end_date || b.start_date));
    });
    if (booked) return true;
    return blocks.some(b =>
      (b.facility_id === null || b.facility_id === facilityId) &&
      rangesOverlap(day, day, ymdOnly(b.start_date), ymdOnly(b.end_date))
    );
  }

  // Items still missing a date, and items whose chosen dates clash.
  const itemsMissingDates = items.filter(it => (it.dates ?? []).length === 0);
  const conflicts = items.flatMap(it =>
    (it.dates ?? [])
      .filter(d => isDayUnavailable(it.facility_id, d))
      .map(d => ({ name: it.facility_name, reason: `${fmtDate(d)} is booked or blocked` }))
  );

  // All booked dates across every facility (for the booking's overall range).
  const allDates = Array.from(new Set(items.flatMap(it => it.dates ?? []))).sort();
  // Overall time span — earliest start hour to latest end hour across every
  // facility's chosen time blocks (each date/time now lives on the line item).
  const allHourBlocks = items.flatMap(it => Object.values(it.times ?? {}));
  const hh = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;
  const overallStartTime = allHourBlocks.length ? hh(Math.min(...allHourBlocks.map(t => t.start))) : "";
  const overallEndTime = allHourBlocks.length ? hh(Math.max(...allHourBlocks.map(t => t.end))) : "";

  // ── Concurrent-hall prompt for Auditorium / Chapel bookings ──
  const hasTriggerFacility = items.some(it => CONCURRENT_TRIGGERS.includes(it.facility_id));
  const concurrentSuggestions = hasTriggerFacility
    ? CONCURRENT_HALLS.filter(hid => !items.some(it => it.facility_id === hid))
    : [];
  function addConcurrentHall(hallId: string) {
    const def = facilities.find(f => f.id === hallId);
    if (!def) return;
    const rate = getRate(def, bookerType, true);
    // Default the hall to the same date(s)/time(s) as the Auditorium/Chapel
    // already on the booking, so it doesn't sit empty at RM0 — still fully
    // editable afterward if the hall is needed for longer or extra dates.
    const triggerItems = items.filter(it => CONCURRENT_TRIGGERS.includes(it.facility_id));
    const dates = Array.from(new Set(triggerItems.flatMap(it => it.dates ?? []))).sort();
    const times: Record<string, { start: number; end: number }> = {};
    triggerItems.forEach(it => Object.entries(it.times ?? {}).forEach(([d, t]) => { times[d] = t; }));
    setItems(prev => [...prev, {
      facility_id: def.id, facility_name: def.name, rate_label: def.rateLabel,
      sessions: dates.length, dates, times, rate_per_session: rate, is_concurrent: true, subtotal: rate * dates.length,
    }]);
  }

  async function save() {
    if (!bookerName.trim()) { setError("Booker name is required."); return; }
    if (!eventType) { setError("Select the type of event."); return; }
    if (items.length === 0) { setError("Add at least one facility."); return; }
    if (itemsMissingDates.length > 0) { setError(`Select at least one date for ${itemsMissingDates[0].facility_name}.`); return; }
    if (conflicts.length > 0) { setError(`Cannot book — ${conflicts[0].name}: ${conflicts[0].reason}. Pick another date or remove the facility.`); return; }
    // Note: a missing endorsement letter for weddings is flagged, not blocked —
    // the booking can proceed and the form uploaded before the event.
    setError("");
    setSaving(true);
    try {
      // Upload any scanned forms first.
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
        booking_no:    bkNo,
        booker_name:   bookerName.trim(),
        booker_email:  bookerEmail.trim(),
        booker_phone:  bookerPhone.trim(),
        booker_org:    bookerOrg.trim(),
        booker_type:   bookerType,
        event_type:    eventType,
        event_name:    eventName.trim(),
        start_date:    allDates[0],
        start_time:    overallStartTime,
        end_date:      allDates.length > 1 ? allDates[allDates.length - 1] : null,
        end_time:      overallEndTime,
        booking_items: items,
        total_amount:  total,
        purpose:       purpose.trim(),
        notes:         notes.trim(),
        internal_notes: internalNotes.trim(),
        attachments,
        status:        "ENQUIRY",
        created_by:    user.email,
      });
      if (e) throw e;
      onSaved();
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed to save booking.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          <h2 className="font-bold text-stone-800 text-lg">New Facility Booking</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 p-1"><XCircle size={20} /></button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Payer Category — drives pricing, so it comes first */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3">Payer Category</h3>
            <div className="flex flex-wrap gap-2">
              {(["PUBLIC", "MEMBER", "CONGREGATION", "HQ"] as PricingTier[]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setBookerType(t)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    bookerType === t
                      ? TIER_COLORS[t] + " border-transparent"
                      : "border-stone-200 text-stone-500 hover:border-stone-300"
                  }`}
                >
                  {TIER_LABELS[t]}
                </button>
              ))}
            </div>
          </section>

          {/* Facilities — chosen right after the payer category */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400">Facilities & Rates</h3>
              <button
                type="button"
                onClick={addItem}
                className="flex items-center gap-1 text-xs text-[#4a6da7] hover:text-[#3a5a8f] font-medium"
              >
                <Plus size={13} /> Add Facility
              </button>
            </div>
            <div className="rounded-xl border border-stone-200 px-3 py-1">
              {items.map((item, idx) => (
                <FacilityLineRow
                  key={idx}
                  item={item}
                  tier={bookerType}
                  facilities={facilities}
                  isDayUnavailable={isDayUnavailable}
                  onChange={updated => setItems(prev => prev.map((it, i) => i === idx ? updated : it))}
                  onRemove={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                />
              ))}
            </div>

            {/* Prompt to add the Faith Halls concurrently with the Auditorium / Chapel */}
            {concurrentSuggestions.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <span className="text-xs text-amber-800">
                  Booking the Auditorium or Chapel — add a Faith Hall at the discounted concurrent rate?
                </span>
                {concurrentSuggestions.map(hid => {
                  const def = facilities.find(f => f.id === hid);
                  if (!def) return null;
                  return (
                    <button key={hid} type="button" onClick={() => addConcurrentHall(hid)}
                      className="flex items-center gap-1 text-xs font-medium text-amber-900 border border-amber-300 bg-white hover:bg-amber-100 px-2.5 py-1 rounded-full transition-colors">
                      <Plus size={12} /> {def.name} ({formatRate(getRate(def, bookerType, true))})
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end mt-2 pr-8">
              <div className="text-right">
                <div className="text-xs text-stone-400">Total</div>
                <div className="text-xl font-bold text-[#4a6da7]">{fmt(total)}</div>
              </div>
            </div>
          </section>

          {/* Booker contact details */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3">Booker Information</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-stone-500 mb-1 block">Full Name *</label>
                <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7]" value={bookerName} onChange={e => setBookerName(e.target.value)} placeholder="Contact person name" />
              </div>
              <div>
                <label className="text-xs text-stone-500 mb-1 block">Organisation</label>
                <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7]" value={bookerOrg} onChange={e => setBookerOrg(e.target.value)} placeholder="Church / Company name" />
              </div>
              <div>
                <label className="text-xs text-stone-500 mb-1 block">Email</label>
                <input type="email" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7]" value={bookerEmail} onChange={e => setBookerEmail(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-stone-500 mb-1 block">Phone</label>
                <input type="tel" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7]" value={bookerPhone} onChange={e => setBookerPhone(e.target.value)} />
              </div>
            </div>
          </section>

          {/* Event */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3">Event Details</h3>
            <p className="text-xs text-stone-400 mb-3">Dates and times are picked per facility above — each venue can run on its own dates and hour block.</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-stone-500 mb-1 block">Type of Event *</label>
                <div className="flex flex-wrap gap-2">
                  {EVENT_TYPES.map(t => (
                    <button key={t.value} type="button" onClick={() => setEventType(t.value)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        eventType === t.value ? "bg-[#4a6da7] text-white border-transparent" : "border-stone-200 text-stone-500 hover:border-stone-300"
                      }`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-stone-500 mb-1 block">Event Name</label>
                <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7]" value={eventName} onChange={e => setEventName(e.target.value)} placeholder="e.g. Sunday Service, Wedding Reception" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-stone-500 mb-1 block">Purpose / Description</label>
                <textarea rows={2} className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7] resize-none" value={purpose} onChange={e => setPurpose(e.target.value)} />
              </div>
            </div>
            {conflicts.length > 0 && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-red-700">
                  <AlertCircle size={14} /> Some selected dates are unavailable
                </div>
                {conflicts.map((c, i) => (
                  <div key={i} className="text-xs text-red-700 pl-5">{c.name}: {c.reason}</div>
                ))}
                <div className="text-[11px] text-red-500 pl-5">Remove those dates to continue.</div>
              </div>
            )}
          </section>

          {/* Notes */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3">Notes</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-stone-500 mb-1 block">Notes (visible on receipt)</label>
                <textarea rows={2} className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7] resize-none" value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-stone-500 mb-1 block">Internal Notes (not on receipt)</label>
                <textarea rows={2} className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7] resize-none" value={internalNotes} onChange={e => setInternal(e.target.value)} />
              </div>
            </div>
          </section>

          {/* Signed/stamped form */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-1">Scanned Booking Form</h3>
            <p className="text-xs text-stone-400 mb-2">Optional — upload a signed/stamped copy if one applies (PDF or image).</p>
            {eventType === "WEDDING" && files.length === 0 && (
              <div className="mb-2.5 flex items-start gap-2 p-3 bg-orange-50 border border-orange-300 rounded-xl text-sm text-orange-800">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Endorsement letter pending.</span> Weddings require the endorsement letter signed by the pastor-in-charge and chopped by the church administration. You can still save this booking now and upload it before the event.
                </div>
              </div>
            )}
            <input type="file" multiple accept="image/*,application/pdf"
              onChange={e => setFiles(Array.from(e.target.files ?? []))}
              className="block w-full text-sm text-stone-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#4a6da7]/10 file:text-[#4a6da7] hover:file:bg-[#4a6da7]/20" />
            {files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-stone-600">
                    <FileText size={12} className="text-stone-400" /> {f.name}
                    <button onClick={() => setFiles(fs => fs.filter((_, idx) => idx !== i))} className="text-stone-300 hover:text-red-500"><XCircle size={12} /></button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-xl text-sm">
              <AlertCircle size={15} /> {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-stone-100 bg-stone-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-stone-600 hover:bg-stone-200 transition-colors">Cancel</button>
          <button
            onClick={save}
            disabled={saving || conflicts.length > 0 || itemsMissingDates.length > 0}
            title={conflicts.length > 0 ? "Some selected dates are unavailable" : itemsMissingDates.length > 0 ? "Select date(s) for every facility" : undefined}
            className="px-5 py-2 rounded-xl bg-[#4a6da7] hover:bg-[#3a5a8f] text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save as Enquiry"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Pay modal ────────────────────────────────────────────────────────────────

interface PayModalProps {
  booking: FacilityBooking;
  onClose: () => void;
  onPaid: () => void;
}

function PayModal({ booking, onClose, onPaid }: PayModalProps) {
  const supabase = createClient();
  const [method, setMethod]   = useState("Bank Transfer");
  const [ref, setRef]         = useState("");
  const [date, setDate]       = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  async function markPaid() {
    if (!method) { setError("Select a payment method."); return; }
    setError("");
    setSaving(true);
    try {
      const { data: recNo } = await supabase.rpc("next_receipt_no");
      const { error: e } = await supabase.from("facility_bookings").update({
        status:         "PAID",
        payment_method: method,
        payment_ref:    ref.trim(),
        payment_date:   date,
        receipt_no:     recNo,
        updated_at:     new Date().toISOString(),
      }).eq("id", booking.id);
      if (e) throw e;
      onPaid();
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          <h2 className="font-bold text-stone-800">Mark as Paid</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><XCircle size={20} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="p-3 bg-stone-50 rounded-xl text-sm">
            <div className="font-medium">{booking.event_name || booking.booker_name}</div>
            <div className="text-stone-500">{booking.booking_no} · {fmt(booking.total_amount)}</div>
          </div>
          <div>
            <label className="text-xs text-stone-500 mb-1 block">Payment Method *</label>
            <select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7]" value={method} onChange={e => setMethod(e.target.value)}>
              {METHODS.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-stone-500 mb-1 block">Reference / Cheque No.</label>
            <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7]" value={ref} onChange={e => setRef(e.target.value)} placeholder="Transaction / cheque number" />
          </div>
          <div>
            <label className="text-xs text-stone-500 mb-1 block">Payment Date *</label>
            <input type="date" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7]" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-stone-100 bg-stone-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-stone-600 hover:bg-stone-200 transition-colors">Cancel</button>
          <button
            onClick={markPaid}
            disabled={saving}
            className="px-5 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Confirm Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm booking modal — dual e-signature before confirming ───────────────

interface ConfirmModalProps {
  booking: FacilityBooking;
  onClose: () => void;
  onConfirmed: () => void;
}

function ConfirmBookingModal({ booking, onClose, onConfirmed }: ConfirmModalProps) {
  const supabase = createClient();
  const [local, setLocal] = useState(booking);
  const [bookerSigDraft, setBookerSigDraft] = useState(booking.booker_signature ?? "");
  const [bemSigDraft, setBemSigDraft] = useState(booking.bem_signature ?? "");
  const [savingSig, setSavingSig] = useState<"booker" | "bem" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  async function saveSignature(which: "booker" | "bem") {
    const dataUrl = which === "booker" ? bookerSigDraft : bemSigDraft;
    if (!dataUrl) { setError("Draw a signature first."); return; }
    setError("");
    setSavingSig(which);
    try {
      let updatePatch: Record<string, unknown>;
      if (which === "booker") {
        updatePatch = { booker_signature: dataUrl, booker_signed_at: new Date().toISOString() };
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        updatePatch = { bem_signature: dataUrl, bem_signed_by: user?.email ?? "", bem_signed_at: new Date().toISOString() };
      }
      const { data: row, error: e } = await supabase.from("facility_bookings").update(updatePatch).eq("id", booking.id).select("*").single();
      if (e) throw new Error(e.message);
      setLocal(row as FacilityBooking);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save signature.");
    } finally {
      setSavingSig(null);
    }
  }

  async function confirmBooking() {
    setConfirming(true);
    try {
      const { error: e } = await supabase.from("facility_bookings")
        .update({ status: "CONFIRMED", updated_at: new Date().toISOString() }).eq("id", booking.id);
      if (e) throw new Error(e.message);
      onConfirmed();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to confirm.");
    } finally {
      setConfirming(false);
    }
  }

  const bothSigned = !!local.booker_signature && !!local.bem_signature;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 px-4 py-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          <h2 className="font-bold text-stone-800">Confirm Booking</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><XCircle size={20} /></button>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div className="p-3 bg-stone-50 rounded-xl text-sm">
            <div className="font-medium">{booking.event_name || booking.booker_name}</div>
            <div className="text-stone-500">{booking.booking_no} · {fmt(booking.total_amount)}</div>
          </div>
          <p className="text-xs text-stone-500">
            Both the bookee and the Building/Event Manager must sign before this booking is confirmed and the invoice can be generated.
          </p>

          <div className="grid sm:grid-cols-2 gap-5">
            <div>
              <div className="text-xs font-semibold text-stone-600 mb-1.5">Bookee&apos;s Signature {local.booker_signature && <span className="text-green-600">✓ signed</span>}</div>
              <SignaturePad value={bookerSigDraft} onChange={setBookerSigDraft} />
              <Button2 onClick={() => saveSignature("booker")} loading={savingSig === "booker"} disabled={!bookerSigDraft || bookerSigDraft === local.booker_signature}>
                Save Bookee Signature
              </Button2>
            </div>
            <div>
              <div className="text-xs font-semibold text-stone-600 mb-1.5">Verified by BEM {local.bem_signature && <span className="text-green-600">✓ signed</span>}</div>
              <SignaturePad value={bemSigDraft} onChange={setBemSigDraft} />
              <Button2 onClick={() => saveSignature("bem")} loading={savingSig === "bem"} disabled={!bemSigDraft || bemSigDraft === local.bem_signature}>
                Save BEM Signature
              </Button2>
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-stone-100 bg-stone-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-stone-600 hover:bg-stone-200 transition-colors">Cancel</button>
          <button
            onClick={confirmBooking}
            disabled={!bothSigned || confirming}
            title={!bothSigned ? "Both signatures are required" : undefined}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {confirming ? "Confirming…" : "Confirm Booking"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Button2({ children, onClick, loading, disabled }: { children: React.ReactNode; onClick: () => void; loading?: boolean; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={loading || disabled}
      className="mt-2 w-full py-1.5 rounded-lg border border-stone-300 text-stone-700 text-xs font-medium hover:bg-stone-50 transition-colors disabled:opacity-50">
      {loading ? "Saving…" : children}
    </button>
  );
}

// ─── Booking card ─────────────────────────────────────────────────────────────

interface CardProps {
  booking: FacilityBooking;
  user: UserProfile;
  facilities: FacilityDef[];
  onRefresh: () => void;
}

function BookingCard({ booking, user, facilities, onRefresh }: CardProps) {
  const supabase = createClient();
  const [expanded, setExpanded] = useState(false);
  const [showPay, setShowPay]   = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [acting, setActing]     = useState(false);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [reclassifying, setReclassifying] = useState(false);

  const canAct = user.isFinanceAdmin || user.isBuildingManager;

  // BEM reclassifies a booking's payer category (e.g. for public submissions where
  // the applicant didn't know how to categorise) — re-prices all facility lines.
  async function reclassify(newType: PricingTier) {
    if (newType === booking.booker_type) return;
    setReclassifying(true);
    const items = booking.booking_items.map(it => {
      const def = facilities.find(f => f.id === it.facility_id);
      const rate = def ? getRate(def, newType, it.is_concurrent) : it.rate_per_session;
      return { ...it, rate_per_session: rate, subtotal: rate * it.sessions };
    });
    const total = items.reduce((s, it) => s + it.subtotal, 0);
    await supabase.from("facility_bookings")
      .update({ booker_type: newType, booking_items: items, total_amount: total, updated_at: new Date().toISOString() })
      .eq("id", booking.id);
    setReclassifying(false);
    onRefresh();
  }

  // Build the booking / invoice summary shared by email and WhatsApp.
  function bookingMessage(): string {
    const b = booking;
    return [
      `Dear ${b.booker_name || "Customer"},`,
      "",
      `Thank you for your booking with the Lutheran Church in Malaysia. Here are the details:`,
      "",
      `Booking Ref: ${b.booking_no}`,
      `Event: ${b.event_name || "—"}`,
      `Date: ${fmtDate(b.start_date)}${b.start_time ? " " + b.start_time : ""}${b.end_date && b.end_date !== b.start_date ? " to " + fmtDate(b.end_date) : ""}${b.end_time ? " " + b.end_time : ""}`,
      `Category: ${TIER_LABELS[b.booker_type]}`,
      "",
      "Facilities:",
      ...b.booking_items.map(it => `  - ${it.facility_name}${it.is_concurrent ? " (concurrent)" : ""}${it.dates && it.dates.length ? ` [${it.dates.map(d => `${fmtDate(d)}${it.times?.[d] ? ` ${fmtHour(it.times[d].start)}-${fmtHour(it.times[d].end)}` : ""}`).join(", ")}]` : ""}: ${it.sessions} x ${formatRate(it.rate_per_session)} = ${fmt(it.subtotal)}`),
      "",
      `Total: ${fmt(b.total_amount)}`,
      `Status: ${STATUS_LABELS[b.status]}`,
      ...(b.status === "PAID" ? [`Receipt No: ${b.receipt_no}`, `Paid on: ${fmtDate(b.payment_date)} (${b.payment_method})`] : []),
      "",
      "Kindly reply if you have any questions.",
      "",
      "Warm regards,",
      "LCM Building & Events",
    ].join("\n");
  }

  // Once an invoice has actually been shared with the bookee, record when —
  // so the BEM knows the customer already holds a copy before changing anything.
  async function markInvoiceSent(via: "EMAIL" | "WHATSAPP") {
    if (booking.status !== "INVOICED") return;
    await supabase.from("facility_bookings")
      .update({ invoice_sent_at: new Date().toISOString(), invoice_sent_via: via })
      .eq("id", booking.id);
    onRefresh();
  }

  // Forward via the BEM's own email client (prefilled draft — nothing auto-sent).
  function emailCustomer() {
    const subject = `LCM Facility Booking ${booking.booking_no} — ${booking.event_name || "Booking"}`;
    window.location.href = `mailto:${encodeURIComponent(booking.booker_email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bookingMessage())}`;
    markInvoiceSent("EMAIL");
  }

  // Share via WhatsApp. Normalise a Malaysian phone (leading 0 -> 60 country code).
  function whatsappCustomer() {
    const digits = (booking.booker_phone || "").replace(/\D/g, "").replace(/^0/, "60");
    const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
    window.open(`${base}?text=${encodeURIComponent(bookingMessage())}`, "_blank");
    markInvoiceSent("WHATSAPP");
  }

  async function transition(newStatus: FacilityBooking["status"]) {
    setActing(true);
    await supabase.from("facility_bookings").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", booking.id);
    onRefresh();
    setActing(false);
  }

  // Void the current invoice — reverts to Confirmed so the BEM can adjust the
  // payer category, facilities, or dates/times, then re-generate a fresh one.
  async function voidInvoice() {
    const warn = booking.invoice_sent_at
      ? "This invoice was already shared with the bookee. Void it and revert to Confirmed so you can make adjustments? You'll need to send a revised invoice afterward."
      : "Void this invoice and revert to Confirmed so you can make adjustments?";
    if (!confirm(warn)) return;
    setActing(true);
    await supabase.from("facility_bookings").update({
      status: "CONFIRMED",
      invoice_voided_at: new Date().toISOString(),
      invoice_voided_by: user.email,
      invoice_sent_at: null,
      invoice_sent_via: null,
      updated_at: new Date().toISOString(),
    }).eq("id", booking.id);
    onRefresh();
    setActing(false);
  }

  const allBookingDates = Array.from(new Set(booking.booking_items.flatMap(it => it.dates ?? []))).sort();
  const dateTimeSummary = allBookingDates.length === 0
    ? fmtDate(booking.start_date)
    : allBookingDates.length === 1
      ? fmtDate(allBookingDates[0])
      : `${fmtDate(allBookingDates[0])} – ${fmtDate(allBookingDates[allBookingDates.length - 1])} (${allBookingDates.length} dates)`;

  const facilityNames = booking.booking_items.map(it =>
    it.facility_name + (it.is_concurrent ? " (concurrent)" : "")
  ).join(", ");

  return (
    <>
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
        {/* Card header */}
        <div
          className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-stone-50 transition-colors"
          onClick={() => setExpanded(e => !e)}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-stone-400 font-mono">{booking.booking_no}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[booking.status]}`}>
                {STATUS_LABELS[booking.status]}
              </span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${TIER_COLORS[booking.booker_type]}`}>
                {TIER_LABELS[booking.booker_type]}
              </span>
              {booking.event_type === "WEDDING" && (booking.attachments ?? []).length === 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700">
                  Endorsement letter pending
                </span>
              )}
            </div>
            <div className="font-semibold text-stone-800 mt-0.5 truncate">
              {booking.event_name || booking.booker_name}
            </div>
            <div className="text-xs text-stone-500 mt-0.5 truncate">{facilityNames}</div>
            <div className="flex items-center gap-1.5 mt-1 text-sm font-semibold text-[#4a6da7]">
              <CalendarDays size={14} className="shrink-0" />
              <span>{dateTimeSummary}</span>
              {booking.start_time && (
                <span className="flex items-center gap-1 text-stone-500 font-medium">
                  <Clock size={12} className="shrink-0" /> {fmtHour(parseInt(booking.start_time, 10))}{booking.end_time ? `–${fmtHour(parseInt(booking.end_time, 10))}` : ""}
                </span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-bold text-stone-800">{fmt(booking.total_amount)}</div>
            <div className="text-stone-400 mt-1">{expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</div>
          </div>
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="border-t border-stone-100 px-4 py-3 space-y-3">
            {/* Booker */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div><span className="text-stone-400 text-xs">Booker</span><div className="font-medium">{booking.booker_name}</div></div>
              {booking.booker_org && <div><span className="text-stone-400 text-xs">Organisation</span><div>{booking.booker_org}</div></div>}
              {booking.booker_email && <div><span className="text-stone-400 text-xs">Email</span><div>{booking.booker_email}</div></div>}
              {booking.booker_phone && <div><span className="text-stone-400 text-xs">Phone</span><div>{booking.booker_phone}</div></div>}
              {booking.purpose && <div className="col-span-2"><span className="text-stone-400 text-xs">Purpose</span><div>{booking.purpose}</div></div>}
              <div className="col-span-2">
                <span className="text-stone-400 text-xs">Payer Category</span>
                {canAct && ["ENQUIRY", "CONFIRMED"].includes(booking.status) ? (
                  <div className="flex items-center gap-2 mt-0.5">
                    <select value={booking.booker_type} disabled={reclassifying}
                      onChange={e => reclassify(e.target.value as PricingTier)}
                      className="border border-stone-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-[#4a6da7]">
                      {(["PUBLIC", "MEMBER", "CONGREGATION", "HQ"] as PricingTier[]).map(t => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}
                    </select>
                    <span className="text-[11px] text-stone-400">{reclassifying ? "Updating rates…" : "Changing this re-prices the booking"}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="font-medium">{TIER_LABELS[booking.booker_type]}</div>
                    {booking.status === "INVOICED" && (
                      <span className="text-[11px] text-stone-400">Locked — void the invoice to adjust</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Invoice status */}
            {booking.status === "INVOICED" && (
              <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl bg-purple-50 border border-purple-100 text-purple-800">
                <Send size={13} className="shrink-0" />
                {booking.invoice_sent_at
                  ? <span>Invoice sent {fmtDate(booking.invoice_sent_at)} {new Date(booking.invoice_sent_at).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })} via {booking.invoice_sent_via === "WHATSAPP" ? "WhatsApp" : "Email"}</span>
                  : <span>Not yet shared with the bookee</span>}
              </div>
            )}

            {/* Facility line items — date & time emphasised */}
            <div>
              <div className="text-xs text-stone-400 mb-1.5">Facilities</div>
              <div className="rounded-xl border border-stone-100 overflow-hidden">
                {booking.booking_items.map((it, i) => (
                  <div key={i} className="px-3 py-2.5 border-b border-stone-50 last:border-0">
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-stone-800">
                          {it.facility_name}{it.is_concurrent ? <span className="ml-1 text-xs font-normal text-amber-600">(concurrent)</span> : null}
                        </div>
                      </div>
                      <div className="text-stone-500 text-xs whitespace-nowrap">{it.sessions} × {it.rate_label}</div>
                      <div className="text-stone-400 text-xs">{fmt(it.rate_per_session)}</div>
                      <div className="font-semibold text-stone-800 w-20 text-right">{fmt(it.subtotal)}</div>
                    </div>
                    {it.dates && it.dates.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {it.dates.map(d => (
                          <span key={d} className="inline-flex items-center gap-1 text-[11px] font-medium bg-[#4a6da7]/10 text-[#4a6da7] rounded-full px-2 py-1">
                            <CalendarDays size={11} /> {fmtDate(d)}
                            {it.times?.[d] && (
                              <span className="flex items-center gap-0.5 text-stone-600">
                                <Clock size={11} /> {fmtHour(it.times[d].start)}–{fmtHour(it.times[d].end)}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <div className="flex items-center gap-2 px-3 py-2 text-sm bg-stone-50 font-bold">
                  <div className="flex-1">Total</div>
                  <div className="w-20 text-right">{fmt(booking.total_amount)}</div>
                </div>
              </div>
            </div>

            {/* Payment info (if paid) */}
            {booking.status === "PAID" && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div><span className="text-stone-400 text-xs">Receipt No.</span><div className="font-medium">{booking.receipt_no}</div></div>
                <div><span className="text-stone-400 text-xs">Payment Date</span><div>{fmtDate(booking.payment_date)}</div></div>
                <div><span className="text-stone-400 text-xs">Method</span><div>{booking.payment_method}</div></div>
                {booking.payment_ref && <div><span className="text-stone-400 text-xs">Reference</span><div>{booking.payment_ref}</div></div>}
              </div>
            )}

            {booking.notes && (
              <div className="text-sm"><span className="text-stone-400 text-xs">Notes</span><div className="text-stone-600">{booking.notes}</div></div>
            )}

            {/* Scanned form attachments */}
            {booking.attachments?.length > 0 && (
              <div className="text-sm">
                <span className="text-stone-400 text-xs">Scanned Form (signed &amp; stamped)</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {booking.attachments.map((url, i) => (
                    <button key={i} onClick={() => setPreviewIdx(i)}
                      className="inline-flex items-center gap-1 text-xs text-[#4a6da7] hover:underline border border-stone-200 rounded-lg px-2 py-1">
                      <FileText size={12} /> Preview Form {i + 1}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            {canAct && (
              <div className="flex flex-wrap gap-2 pt-1">
                {booking.booker_email && (
                  <button onClick={emailCustomer}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-300 text-stone-600 text-xs font-medium hover:bg-stone-50 transition-colors"
                    title="Forward booking & invoice details by email">
                    <Share2 size={13} /> Email
                  </button>
                )}
                {booking.booker_phone && (
                  <button onClick={whatsappCustomer}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-green-300 text-green-700 text-xs font-medium hover:bg-green-50 transition-colors"
                    title="Forward booking & invoice details via WhatsApp">
                    <Share2 size={13} /> WhatsApp
                  </button>
                )}
                {booking.status === "ENQUIRY" && (
                  <>
                    <button onClick={() => setShowConfirm(true)} disabled={acting} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors disabled:opacity-50">
                      <CheckCircle size={13} /> Confirm
                    </button>
                    <button onClick={() => transition("CANCELLED")} disabled={acting} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-medium transition-colors disabled:opacity-50">
                      <XCircle size={13} /> Cancel
                    </button>
                  </>
                )}
                {booking.status === "CONFIRMED" && (
                  <>
                    <button onClick={() => transition("INVOICED")} disabled={acting} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition-colors disabled:opacity-50">
                      <FileText size={13} /> Generate Invoice
                    </button>
                    <button onClick={() => transition("CANCELLED")} disabled={acting} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-medium transition-colors disabled:opacity-50">
                      <XCircle size={13} /> Cancel
                    </button>
                  </>
                )}
                {booking.status === "INVOICED" && (
                  <>
                    <button onClick={() => setShowPay(true)} disabled={acting} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors disabled:opacity-50">
                      <DollarSign size={13} /> Mark as Paid
                    </button>
                    <button onClick={voidInvoice} disabled={acting} title="Revert to Confirmed so you can adjust the payer category, facilities, or dates/times"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 text-xs font-medium hover:bg-amber-50 transition-colors disabled:opacity-50">
                      <RotateCcw size={13} /> Void Invoice
                    </button>
                  </>
                )}
                {booking.status === "PAID" && (
                  <ReceiptPdfButton source={{ kind: "booking", data: booking }} />
                )}
              </div>
            )}
            {!canAct && booking.status === "PAID" && (
              <ReceiptPdfButton source={{ kind: "booking", data: booking }} />
            )}
          </div>
        )}
      </div>

      {showPay && (
        <PayModal
          booking={booking}
          onClose={() => setShowPay(false)}
          onPaid={() => { setShowPay(false); onRefresh(); }}
        />
      )}

      {showConfirm && (
        <ConfirmBookingModal
          booking={booking}
          onClose={() => setShowConfirm(false)}
          onConfirmed={() => { setShowConfirm(false); onRefresh(); }}
        />
      )}

      {previewIdx !== null && (
        <AttachmentPreview urls={booking.attachments} startIndex={previewIdx} onClose={() => setPreviewIdx(null)} />
      )}
    </>
  );
}

// ─── Block-dates modal ────────────────────────────────────────────────────────

const BLOCK_REASONS: { value: FacilityBlockReason; label: string }[] = [
  { value: "MAINTENANCE", label: "Maintenance / Renovation" },
  { value: "REHEARSAL", label: "Rehearsal (pre-event)" },
  { value: "EVENT_HOLD", label: "Event hold (pre/post event)" },
  { value: "OTHER", label: "Other" },
];

function BlockModal({ user, facilities, defaultDate, onClose, onSaved }: {
  user: UserProfile; facilities: FacilityDef[]; defaultDate: string; onClose: () => void; onSaved: () => void;
}) {
  const supabase = createClient();
  const [facilityId, setFacilityId] = useState("");        // "" = all facilities
  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultDate);
  const [reason, setReason] = useState<FacilityBlockReason>("MAINTENANCE");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!startDate) { setError("Select a start date."); return; }
    if (endDate && endDate < startDate) { setError("End date is before start date."); return; }
    setError(""); setSaving(true);
    const { error: e } = await supabase.from("facility_blocks").insert({
      facility_id: facilityId || null,
      start_date: startDate, end_date: endDate || startDate,
      reason, notes: notes.trim(), created_by: user.email,
    });
    setSaving(false);
    if (e) { setError(e.message); return; }
    onSaved();
  }

  const input = "w-full border border-stone-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7]";
  const label = "block text-xs font-semibold text-stone-600 mb-1";

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <h2 className="text-base font-bold text-stone-800">Block Dates</h2>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-600"><XCircle size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label className={label}>Facility</label>
            <select className={input} value={facilityId} onChange={e => setFacilityId(e.target.value)}>
              <option value="">All facilities (whole venue)</option>
              {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Start date</label><input type="date" className={input} value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
            <div><label className={label}>End date</label><input type="date" className={input} value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
          </div>
          <div>
            <label className={label}>Reason</label>
            <select className={input} value={reason} onChange={e => setReason(e.target.value as FacilityBlockReason)}>
              {BLOCK_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div><label className={label}>Notes</label><input className={input} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Aircon servicing" /></div>
          <p className="text-[11px] text-stone-400">Blocked dates appear on the calendar and make the facility unavailable on the public booking form.</p>
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-stone-200">
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 bg-[#4a6da7] text-white rounded-xl text-sm font-semibold hover:bg-[#3a5a8f] disabled:opacity-50">{saving ? "Saving…" : "Block Dates"}</button>
          <button onClick={onClose} className="px-5 py-2.5 border border-stone-200 text-stone-600 rounded-xl text-sm font-medium hover:bg-stone-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BookingsPage() {
  const supabase = createClient();
  const [user, setUser]         = useState<UserProfile | null>(null);
  const [bookings, setBookings] = useState<FacilityBooking[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<FacilityBooking["status"] | "ALL">("ALL");
  const [showNew, setShowNew]   = useState(false);
  const [view, setView]         = useState<"list" | "calendar">("list");
  const [copied, setCopied]     = useState(false);
  const [facilities, setFacilities] = useState<FacilityDef[]>(FACILITIES);
  const [blocks, setBlocks] = useState<FacilityBlock[]>([]);
  const [blockDate, setBlockDate] = useState<string | null>(null); // open BlockModal prefilled

  const loadBlocks = useCallback(async () => {
    const { data } = await supabase.from("facility_blocks").select("*").order("start_date");
    setBlocks((data as FacilityBlock[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("facility_rates").select("*");
      setFacilities(applyRateOverrides((data as RateOverride[]) ?? []));
    })();
    loadBlocks();
  }, [supabase, loadBlocks]);

  async function deleteBlock(b: FacilityBlock) {
    const facLabel = b.facility_id ? (facilities.find(f => f.id === b.facility_id)?.name ?? b.facility_id) : "all facilities";
    if (!confirm(`Remove this block (${facLabel}, ${b.start_date}${b.end_date !== b.start_date ? " – " + b.end_date : ""})?`)) return;
    await supabase.from("facility_blocks").delete().eq("id", b.id);
    loadBlocks();
  }

  async function loadUser() {
    const { data: { user: au } } = await supabase.auth.getUser();
    if (!au) return;
    const { data } = await supabase.from("user_roles").select("*").eq("email", au.email).single();
    if (!data) return;
    const role = data.role as UserProfile["role"];
    setUser({
      id: au.id,
      email: au.email ?? "",
      full_name: data.full_name ?? "",
      role,
      ministries: data.ministries ?? [],
      isFinanceAdmin: role === "FINANCE_ADMIN" || (role as string) === "FINANCE_ADMIN_2",
      isSignatory: ["BISHOP", "TREASURER", "SECRETARY"].includes(role),
      signatoryRole: role,
      isMinistryHead: role === "MINISTRY_HEAD",
      isGeneralManager: role === "GENERAL_MANAGER",
      isBuildingManager: role === "BUILDING_MANAGER",
      isTestAdmin: data.is_test_admin ?? false,
    });
  }

  const loadBookings = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("facility_bookings")
      .select("*")
      .order("created_at", { ascending: false });
    setBookings((data as FacilityBooking[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadUser();
    loadBookings();
  }, [loadBookings]);

  const STATUS_TABS: Array<FacilityBooking["status"] | "ALL"> = ["ALL", "ENQUIRY", "CONFIRMED", "INVOICED", "PAID", "CANCELLED"];

  const filtered = tab === "ALL" ? bookings : bookings.filter(b => b.status === tab);

  const counts = STATUS_TABS.reduce((acc, t) => {
    acc[t] = t === "ALL" ? bookings.length : bookings.filter(b => b.status === t).length;
    return acc;
  }, {} as Record<string, number>);

  const canCreate = user && (user.isFinanceAdmin || user.isBuildingManager);

  return (
    <div className={`${view === "calendar" ? "max-w-6xl" : "max-w-3xl"} mx-auto px-4 py-6 space-y-5`}>
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-800">Facility Bookings</h1>
          <p className="text-sm text-stone-500 mt-0.5">Manage venue bookings and facility rentals</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canCreate && (
            <a href="/bookings/rates"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50 transition-colors"
              title="Set facility rates">
              <Percent size={15} /> Rates
            </a>
          )}
          {canCreate && (
            <button
              onClick={() => { navigator.clipboard?.writeText(`${location.origin}/book`); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50 transition-colors"
              title="Copy the public booking form link to share">
              <Share2 size={15} /> {copied ? "Copied!" : "Public link"}
            </button>
          )}
          <div className="inline-flex rounded-xl border border-stone-200 overflow-hidden text-sm font-medium">
            <button onClick={() => setView("list")} className={`px-3 py-2 transition-colors ${view === "list" ? "bg-[#4a6da7] text-white" : "text-stone-600 hover:bg-stone-50"}`}>List</button>
            <button onClick={() => setView("calendar")} className={`px-3 py-2 transition-colors ${view === "calendar" ? "bg-[#4a6da7] text-white" : "text-stone-600 hover:bg-stone-50"}`}>Calendar</button>
          </div>
          {canCreate && (
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#4a6da7] hover:bg-[#3a5a8f] text-white text-sm font-medium transition-colors"
            >
              <Plus size={16} /> New Booking
            </button>
          )}
        </div>
      </div>

      {view === "calendar" && (
        <BookingCalendar bookings={bookings} blocks={blocks} canBlock={!!canCreate}
          onSelect={(b) => { setView("list"); setTab(b.status); }}
          onDayClick={(d) => { if (canCreate) setBlockDate(d); }}
          onBlockClick={(b) => { if (canCreate) deleteBlock(b); }} />
      )}

      {/* Status tabs */}
      {view === "list" && (<>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {STATUS_TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t
                ? "bg-[#4a6da7] text-white"
                : "text-stone-500 hover:bg-stone-100"
            }`}
          >
            {t === "ALL" ? "All" : STATUS_LABELS[t as FacilityBooking["status"]]}
            {counts[t] > 0 && (
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-bold ${
                tab === t ? "bg-white/20 text-white" : "bg-stone-100 text-stone-500"
              }`}>
                {counts[t]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Booking list */}
      {loading || !user ? (
        <div className="text-center py-16 text-stone-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-stone-300 mb-2"><FileText size={40} /></div>
          <p className="text-stone-400 text-sm">
            {tab === "ALL" ? "No bookings yet." : `No ${STATUS_LABELS[tab as FacilityBooking["status"]]} bookings.`}
          </p>
          {canCreate && tab === "ALL" && (
            <button onClick={() => setShowNew(true)} className="mt-3 text-sm text-[#4a6da7] hover:underline">
              Create the first booking
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(b => (
            <BookingCard key={b.id} booking={b} user={user!} facilities={facilities} onRefresh={loadBookings} />
          ))}
        </div>
      )}
      </>
      )}

      {/* Rate reference card */}
      <details className="rounded-2xl border border-stone-200 bg-white">
        <summary className="px-4 py-3 text-sm font-medium text-stone-600 cursor-pointer select-none">
          Facility Rate Reference
        </summary>
        <div className="px-4 pb-4 overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[520px]">
            <thead>
              <tr className="border-b border-stone-100">
                <th className="text-left py-2 pr-3 text-stone-400 font-medium">Facility</th>
                <th className="text-left py-2 pr-3 text-stone-400 font-medium">Unit</th>
                <th className="text-right py-2 pr-3 text-red-500 font-medium">Public</th>
                <th className="text-right py-2 pr-3 text-amber-600 font-medium">Member</th>
                <th className="text-right py-2 pr-3 text-blue-600 font-medium">Congregation</th>
                <th className="text-right py-2 text-green-600 font-medium">HQ</th>
              </tr>
            </thead>
            <tbody>
              {facilities.map(f => (
                <tr key={f.id} className="border-b border-stone-50 hover:bg-stone-50">
                  <td className="py-1.5 pr-3 text-stone-700">{f.name}</td>
                  <td className="py-1.5 pr-3 text-stone-400">{f.rateLabel}</td>
                  <td className="py-1.5 pr-3 text-right">{formatRate(f.rates.PUBLIC)}</td>
                  <td className="py-1.5 pr-3 text-right">{formatRate(f.rates.MEMBER)}</td>
                  <td className="py-1.5 pr-3 text-right">{formatRate(f.rates.CONGREGATION)}</td>
                  <td className="py-1.5 text-right">{formatRate(f.rates.HQ)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {showNew && user && (
        <NewBookingModal
          user={user}
          facilities={facilities}
          bookings={bookings}
          blocks={blocks}
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); loadBookings(); }}
        />
      )}

      {blockDate && user && (
        <BlockModal
          user={user}
          facilities={facilities}
          defaultDate={blockDate}
          onClose={() => setBlockDate(null)}
          onSaved={() => { setBlockDate(null); loadBlocks(); }}
        />
      )}
    </div>
  );
}
