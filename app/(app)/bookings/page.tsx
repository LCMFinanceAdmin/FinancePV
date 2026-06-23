"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Plus, ChevronDown, ChevronUp, Trash2, CheckCircle,
  FileText, DollarSign, XCircle, AlertCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { UserProfile, FacilityBooking, BookingItem } from "@/lib/types";
import {
  FACILITIES, TIER_LABELS, TIER_COLORS, getRate, formatRate,
  type PricingTier,
} from "@/lib/facilities";
import { ReceiptPdfButton } from "@/components/income/receipt-pdf";

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

function fmt(n: number) {
  return "RM " + n.toLocaleString("en-MY", { minimumFractionDigits: 2 });
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── New booking line-item row ────────────────────────────────────────────────

interface LineRowProps {
  item: BookingItem;
  tier: PricingTier;
  onChange: (item: BookingItem) => void;
  onRemove: () => void;
}

function LineRow({ item, tier, onChange, onRemove }: LineRowProps) {
  const facilityDef = FACILITIES.find(f => f.id === item.facility_id);
  const hasDiscount = !!facilityDef?.concurrentRates;

  function update(patch: Partial<BookingItem>) {
    const next = { ...item, ...patch };
    const rate = facilityDef
      ? getRate(facilityDef, tier, next.is_concurrent)
      : next.rate_per_session;
    next.rate_per_session = rate;
    next.subtotal = rate * next.sessions;
    onChange(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 py-2 border-b border-stone-100 last:border-0">
      {/* Facility selector */}
      <select
        className="flex-1 min-w-[180px] border border-stone-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-[#4a6da7]"
        value={item.facility_id}
        onChange={e => {
          const def = FACILITIES.find(f => f.id === e.target.value);
          if (!def) return;
          const rate = getRate(def, tier, item.is_concurrent);
          onChange({
            ...item,
            facility_id: def.id,
            facility_name: def.name,
            rate_label: def.rateLabel,
            rate_per_session: rate,
            is_concurrent: false,
            subtotal: rate * item.sessions,
          });
        }}
      >
        {FACILITIES.map(f => (
          <option key={f.id} value={f.id}>{f.name}</option>
        ))}
      </select>

      {/* Sessions */}
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={1}
          step={1}
          className="w-16 border border-stone-200 rounded-lg px-2 py-1.5 text-sm text-center outline-none focus:border-[#4a6da7]"
          value={item.sessions}
          onChange={e => update({ sessions: Math.max(1, parseInt(e.target.value) || 1) })}
        />
        <span className="text-xs text-stone-400 whitespace-nowrap">{item.rate_label}</span>
      </div>

      {/* Concurrent checkbox for halls */}
      {hasDiscount && (
        <label className="flex items-center gap-1 text-xs text-stone-600 cursor-pointer">
          <input
            type="checkbox"
            className="accent-[#4a6da7]"
            checked={item.is_concurrent}
            onChange={e => update({ is_concurrent: e.target.checked })}
          />
          Concurrent discount
        </label>
      )}

      {/* Rate + subtotal */}
      <div className="text-sm text-right min-w-[130px]">
        <span className="text-stone-400 text-xs">{formatRate(item.rate_per_session)}/session  </span>
        <span className="font-semibold text-stone-800">{fmt(item.subtotal)}</span>
      </div>

      <button onClick={onRemove} className="p-1 text-stone-300 hover:text-red-500 transition-colors">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// ─── New booking modal ────────────────────────────────────────────────────────

interface NewBookingModalProps {
  user: UserProfile;
  onClose: () => void;
  onSaved: () => void;
}

function NewBookingModal({ user, onClose, onSaved }: NewBookingModalProps) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Booker
  const [bookerType, setBookerType]   = useState<PricingTier>("PUBLIC");
  const [bookerName, setBookerName]   = useState("");
  const [bookerEmail, setBookerEmail] = useState("");
  const [bookerPhone, setBookerPhone] = useState("");
  const [bookerOrg, setBookerOrg]     = useState("");

  // Event
  const [eventName, setEventName]   = useState("");
  const [startDate, setStartDate]   = useState("");
  const [startTime, setStartTime]   = useState("");
  const [endDate, setEndDate]       = useState("");
  const [endTime, setEndTime]       = useState("");
  const [purpose, setPurpose]       = useState("");
  const [notes, setNotes]           = useState("");
  const [internalNotes, setInternal] = useState("");
  const [files, setFiles]           = useState<File[]>([]);

  // Line items
  function defaultItem(tier: PricingTier): BookingItem {
    const def = FACILITIES[0];
    const rate = getRate(def, tier);
    return {
      facility_id: def.id,
      facility_name: def.name,
      rate_label: def.rateLabel,
      sessions: 1,
      rate_per_session: rate,
      is_concurrent: false,
      subtotal: rate,
    };
  }
  const [items, setItems] = useState<BookingItem[]>([defaultItem("PUBLIC")]);

  // Re-calculate all item rates when tier changes
  useEffect(() => {
    setItems(prev => prev.map(it => {
      const def = FACILITIES.find(f => f.id === it.facility_id);
      if (!def) return it;
      const rate = getRate(def, bookerType, it.is_concurrent);
      return { ...it, rate_per_session: rate, subtotal: rate * it.sessions };
    }));
  }, [bookerType]);

  const total = items.reduce((s, i) => s + i.subtotal, 0);

  function addItem() {
    setItems(prev => [...prev, defaultItem(bookerType)]);
  }

  async function save() {
    if (!bookerName.trim()) { setError("Booker name is required."); return; }
    if (!startDate) { setError("Start date is required."); return; }
    if (items.length === 0) { setError("Add at least one facility."); return; }
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
        event_name:    eventName.trim(),
        start_date:    startDate,
        start_time:    startTime,
        end_date:      endDate || null,
        end_time:      endTime,
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
          {/* Booker */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3">Booker Information</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-stone-500 mb-1 block">Payer Category *</label>
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
              </div>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-stone-500 mb-1 block">Event Name</label>
                <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7]" value={eventName} onChange={e => setEventName(e.target.value)} placeholder="e.g. Sunday Service, Wedding Reception" />
              </div>
              <div>
                <label className="text-xs text-stone-500 mb-1 block">Start Date *</label>
                <input type="date" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7]" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-stone-500 mb-1 block">Start Time</label>
                <input type="time" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7]" value={startTime} onChange={e => setStartTime(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-stone-500 mb-1 block">End Date</label>
                <input type="date" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7]" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-stone-500 mb-1 block">End Time</label>
                <input type="time" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7]" value={endTime} onChange={e => setEndTime(e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-stone-500 mb-1 block">Purpose / Description</label>
                <textarea rows={2} className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7] resize-none" value={purpose} onChange={e => setPurpose(e.target.value)} />
              </div>
            </div>
          </section>

          {/* Facilities */}
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
                <LineRow
                  key={idx}
                  item={item}
                  tier={bookerType}
                  onChange={updated => setItems(prev => prev.map((it, i) => i === idx ? updated : it))}
                  onRemove={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                />
              ))}
            </div>
            <div className="flex justify-end mt-2 pr-8">
              <div className="text-right">
                <div className="text-xs text-stone-400">Total</div>
                <div className="text-xl font-bold text-[#4a6da7]">{fmt(total)}</div>
              </div>
            </div>
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
            <p className="text-xs text-stone-400 mb-2">Upload the form signed by the applicant&apos;s pastor and bearing the church office stamp (PDF or image).</p>
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
            disabled={saving}
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

// ─── Booking card ─────────────────────────────────────────────────────────────

interface CardProps {
  booking: FacilityBooking;
  user: UserProfile;
  onRefresh: () => void;
}

function BookingCard({ booking, user, onRefresh }: CardProps) {
  const supabase = createClient();
  const [expanded, setExpanded] = useState(false);
  const [showPay, setShowPay]   = useState(false);
  const [acting, setActing]     = useState(false);

  const canAct = user.isFinanceAdmin || user.isBuildingManager;

  async function transition(newStatus: FacilityBooking["status"]) {
    setActing(true);
    await supabase.from("facility_bookings").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", booking.id);
    onRefresh();
    setActing(false);
  }

  const facilities = booking.booking_items.map(it =>
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
            </div>
            <div className="font-semibold text-stone-800 mt-0.5 truncate">
              {booking.event_name || booking.booker_name}
            </div>
            <div className="text-xs text-stone-500 mt-0.5 truncate">
              {facilities} · {fmtDate(booking.start_date)}
              {booking.end_date && booking.end_date !== booking.start_date ? " — " + fmtDate(booking.end_date) : ""}
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
            </div>

            {/* Facility line items */}
            <div>
              <div className="text-xs text-stone-400 mb-1.5">Facilities</div>
              <div className="rounded-xl border border-stone-100 overflow-hidden">
                {booking.booking_items.map((it, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 text-sm border-b border-stone-50 last:border-0">
                    <div className="flex-1">{it.facility_name}{it.is_concurrent ? <span className="ml-1 text-xs text-stone-400">(concurrent)</span> : null}</div>
                    <div className="text-stone-500 text-xs">{it.sessions} × {it.rate_label}</div>
                    <div className="text-stone-400 text-xs">{fmt(it.rate_per_session)}</div>
                    <div className="font-medium w-20 text-right">{fmt(it.subtotal)}</div>
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
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[#4a6da7] hover:underline border border-stone-200 rounded-lg px-2 py-1">
                      <FileText size={12} /> Form {i + 1}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            {canAct && (
              <div className="flex flex-wrap gap-2 pt-1">
                {booking.status === "ENQUIRY" && (
                  <>
                    <button onClick={() => transition("CONFIRMED")} disabled={acting} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors disabled:opacity-50">
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
                  <button onClick={() => setShowPay(true)} disabled={acting} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors disabled:opacity-50">
                    <DollarSign size={13} /> Mark as Paid
                  </button>
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
    </>
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
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-800">Facility Bookings</h1>
          <p className="text-sm text-stone-500 mt-0.5">Manage venue bookings and facility rentals</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#4a6da7] hover:bg-[#3a5a8f] text-white text-sm font-medium transition-colors shrink-0"
          >
            <Plus size={16} /> New Booking
          </button>
        )}
      </div>

      {/* Status tabs */}
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
      {loading ? (
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
            <BookingCard key={b.id} booking={b} user={user!} onRefresh={loadBookings} />
          ))}
        </div>
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
              {FACILITIES.map(f => (
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
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); loadBookings(); }}
        />
      )}
    </div>
  );
}
