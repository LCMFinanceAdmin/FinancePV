"use client";
import { useState } from "react";
import { Trash2, XCircle, CalendarDays } from "lucide-react";
import type { BookingItem } from "@/lib/types";
import { getRate, formatRate, fmtCurrency, fmtDate, fmtHour, defaultSessionHours, type PricingTier, type FacilityDef } from "@/lib/facilities";
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

  return (
    <div className="py-2.5 border-b border-stone-100 last:border-0 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="flex-1 min-w-[180px] border border-stone-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-[#4a6da7]"
          value={item.facility_id}
          onChange={e => {
            const def = facilities.find(f => f.id === e.target.value);
            if (!def) return;
            onChange(recalc({ ...item, facility_id: def.id, facility_name: def.name, rate_label: def.rateLabel, is_concurrent: false }));
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

      {/* Per-facility dates + per-date hour block */}
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
    </div>
  );
}
