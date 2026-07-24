"use client";
import { useState } from "react";
import { Trash2, XCircle, CalendarDays } from "lucide-react";
import type { BookingItem } from "@/lib/types";
import { getRate, formatRate, fmtCurrency, fmtDate, fmtHour, defaultSessionHours, nightsBetween, dayAfter, type PricingTier, type FacilityDef } from "@/lib/facilities";
import { AvailabilityCalendar } from "./availability-calendar";
import { HourBlockPicker } from "./hour-block-picker";

export interface FacilityLineRowProps {
  item: BookingItem;
  tier: PricingTier;
  facilities: FacilityDef[];
  isDayUnavailable: (facilityId: string, ymd: string) => boolean;
  onChange: (item: BookingItem) => void;
  onRemove: () => void;
  showRemove?: boolean;
}

// One facility line on a booking — facility picker, per-date session calendar,
// and per-date hour-block time picker. Shared by the internal New Booking
// modal and the public booking page so both offer the exact same flow.
export function FacilityLineRow({ item, tier, facilities, isDayUnavailable, onChange, onRemove, showRemove = true }: FacilityLineRowProps) {
  const facilityDef = facilities.find(f => f.id === item.facility_id);
  const hasDiscount = !!facilityDef?.concurrentRates;
  // Guest Rooms are booked overnight — a check-in/check-out date range reads
  // far more naturally than picking individual nights one at a time, and
  // there's no time-of-day to set (the whole night is booked either way).
  const isGuestRoom = facilityDef?.type === "GUEST_ROOM";
  const [showCal, setShowCal] = useState(false);
  const [editingTimeFor, setEditingTimeFor] = useState<string | null>(null);
  const dates = item.dates ?? [];
  const times = item.times ?? {};
  const unit = item.rate_label.toLowerCase().includes("night") ? "night" : "session";

  function recalc(next: BookingItem): BookingItem {
    const rate = facilityDef ? getRate(facilityDef, tier, next.is_concurrent) : next.rate_per_session;
    const sessions = (next.dates ?? []).length;
    return { ...next, rate_per_session: rate, sessions, subtotal: rate * sessions };
  }
  function update(patch: Partial<BookingItem>) { onChange(recalc({ ...item, ...patch })); }
  function toggleDate(d: string) {
    const set = new Set(item.dates ?? []);
    const nextTimes = { ...times };
    if (set.has(d)) { set.delete(d); delete nextTimes[d]; }
    else { set.add(d); nextTimes[d] = defaultSessionHours(item.rate_label); setEditingTimeFor(d); }
    update({ dates: Array.from(set).sort(), times: nextTimes });
  }
  function setTime(d: string, start: number, end: number) {
    update({ times: { ...times, [d]: { start, end } } });
  }

  // Check-in/check-out range for Guest Rooms — no per-night time block.
  // These need their OWN state rather than being derived from item.dates:
  // nightsBetween() only produces a non-empty result once BOTH ends are set,
  // so if check-in/check-out just mirrored item.dates, filling in check-in
  // first (leaving check-out still empty) would compute zero nights and the
  // check-in field would appear to silently reset on the next render.
  const [stayCheckIn, setStayCheckIn] = useState(dates[0] ?? "");
  const [stayCheckOut, setStayCheckOut] = useState(dates.length ? dayAfter(dates[dates.length - 1]) : "");
  function setStay(nextCheckIn: string, nextCheckOut: string) {
    setStayCheckIn(nextCheckIn);
    setStayCheckOut(nextCheckOut);
    update({ dates: nightsBetween(nextCheckIn, nextCheckOut), times: {} });
  }

  return (
    <div className="py-2.5 border-b border-stone-100 last:border-0 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="flex-1 min-w-[180px] border border-stone-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-[#4a6da7]"
          value={item.facility_id}
          onChange={e => {
            const def = facilities.find(f => f.id === e.target.value);
            if (!def) return;
            setStayCheckIn(""); setStayCheckOut("");
            // Compute the rate from the newly-selected facility directly —
            // recalc() closes over the OLD facilityDef (derived from the
            // item prop before this change lands), so calling it here would
            // silently keep pricing the previous facility until some other
            // field triggered a further recalculation.
            const rate = getRate(def, tier, false);
            onChange({
              ...item, facility_id: def.id, facility_name: def.name, rate_label: def.rateLabel,
              is_concurrent: false, dates: [], times: {}, rate_per_session: rate, sessions: 0, subtotal: 0,
            });
          }}
        >
          {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>

        {hasDiscount && (
          <label className="flex items-center gap-1 text-xs text-stone-600 cursor-pointer">
            <input type="checkbox" className="accent-[#4a6da7]" checked={item.is_concurrent} onChange={e => update({ is_concurrent: e.target.checked })} />
            Concurrent discount
          </label>
        )}

        <div className="text-sm text-right ml-auto whitespace-nowrap">
          <span className="text-stone-400 text-xs">{formatRate(item.rate_per_session)}/{unit} × {dates.length}  </span>
          <span className="font-semibold text-stone-800">{fmtCurrency(item.subtotal)}</span>
        </div>
        {showRemove && (
          <button type="button" onClick={onRemove} className="p-1 text-stone-300 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
        )}
      </div>

      {/* Per-facility dates + per-date hour block (or a check-in/check-out
          range for Guest Rooms, which don't need a time-of-day). */}
      {isGuestRoom ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-stone-600">
            Check-in
            <input
              type="date"
              className="border border-stone-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-[#4a6da7]"
              value={stayCheckIn}
              onChange={e => setStay(e.target.value, stayCheckOut && stayCheckOut > e.target.value ? stayCheckOut : "")}
            />
          </label>
          <span className="text-stone-300">→</span>
          <label className="flex items-center gap-1.5 text-xs text-stone-600">
            Check-out
            <input
              type="date"
              className="border border-stone-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-[#4a6da7]"
              value={stayCheckOut}
              min={stayCheckIn || undefined}
              onChange={e => setStay(stayCheckIn, e.target.value)}
            />
          </label>
          {dates.length > 0 && (
            <span className="text-[11px] text-stone-400">({dates.length} night{dates.length > 1 ? "s" : ""})</span>
          )}
          {dates.some(d => isDayUnavailable(item.facility_id, d)) && (
            <span className="text-[11px] text-red-500 w-full">Some nights in this range are already booked or blocked.</span>
          )}
        </div>
      ) : (
        <div>
          <button type="button" onClick={() => setShowCal(s => !s)}
            className="flex items-center gap-1.5 text-xs font-medium text-[#4a6da7] hover:underline">
            <CalendarDays size={13} />
            {dates.length === 0 ? `Select ${unit} date(s) & time` : `${dates.length} ${unit}${dates.length > 1 ? "s" : ""} selected`}
          </button>
          {dates.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {dates.map(d => {
                const t = times[d];
                return (
                  <span key={d} className="inline-flex items-center gap-1 text-[11px] bg-[#4a6da7]/10 text-[#4a6da7] rounded-full pl-2 pr-1 py-0.5">
                    <button type="button" onClick={() => setEditingTimeFor(p => p === d ? null : d)} className="hover:underline">
                      {fmtDate(d)}{t ? ` · ${fmtHour(t.start)}–${fmtHour(t.end)}` : ""}
                    </button>
                    <button type="button" onClick={() => toggleDate(d)} className="hover:text-red-500"><XCircle size={11} /></button>
                  </span>
                );
              })}
            </div>
          )}
          {editingTimeFor && dates.includes(editingTimeFor) && (
            <div className="mt-2 p-2.5 bg-stone-50 border border-stone-200 rounded-xl max-w-[420px]">
              <p className="text-[11px] font-medium text-stone-600 mb-1.5">Time block for {fmtDate(editingTimeFor)}</p>
              <HourBlockPicker
                start={times[editingTimeFor]?.start ?? 9}
                end={times[editingTimeFor]?.end ?? 13}
                onChange={(s, e) => setTime(editingTimeFor, s, e)}
              />
            </div>
          )}
          {showCal && (
            <div className="mt-2 max-w-[300px]">
              <AvailabilityCalendar
                unavailable={(d) => isDayUnavailable(item.facility_id, d)}
                selectedDates={dates}
                onToggle={toggleDate}
              />
              <p className="text-[11px] text-stone-400 mt-1">Click days to add/remove {unit}s for {item.facility_name}. Tap a date chip above to set its time block.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
