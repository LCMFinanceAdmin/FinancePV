"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfWeek(d: Date): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - s.getDay());
  return s;
}

interface AvailabilityCalendarProps {
  // Facility-scoped: returns true if the given yyyy-mm-dd is booked or blocked.
  unavailable: (ymd: string) => boolean;
  selected?: string;
  onPick?: (ymd: string) => void;
  // Days before this are not selectable (defaults to today).
  minDate?: string;
}

export function AvailabilityCalendar({ unavailable, selected, onPick, minDate }: AvailabilityCalendarProps) {
  const [cursor, setCursor] = useState(() => (selected ? new Date(selected) : new Date()));
  const today = ymd(new Date());
  const floor = minDate ?? today;

  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const cells: Date[] = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d;
  });

  function shiftMonth(delta: number) {
    const d = new Date(cursor); d.setMonth(d.getMonth() + delta); setCursor(d);
  }

  return (
    <div className="border border-stone-200 rounded-xl p-2.5 bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => shiftMonth(-1)} className="p-1 rounded-lg border border-stone-200 hover:bg-stone-50"><ChevronLeft size={14} /></button>
        <span className="text-xs font-semibold text-stone-700">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</span>
        <button type="button" onClick={() => shiftMonth(1)} className="p-1 rounded-lg border border-stone-200 hover:bg-stone-50"><ChevronRight size={14} /></button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-[10px] font-semibold text-stone-400 mb-0.5">
        {DOW.map(d => <div key={d} className="text-center py-0.5">{d}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => {
          const ds = ymd(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const isPast = ds < floor;
          const isUnavail = unavailable(ds);
          const isSel = selected === ds;
          const blocked = isPast || isUnavail;
          return (
            <button
              key={i}
              type="button"
              disabled={blocked || !inMonth}
              onClick={() => onPick?.(ds)}
              title={isUnavail ? "Unavailable" : isPast ? "Past date" : "Available"}
              className={[
                "aspect-square rounded-md text-[11px] flex items-center justify-center transition-colors",
                !inMonth ? "text-stone-200 cursor-default" :
                isSel ? "bg-[#4a6da7] text-white font-bold" :
                isPast ? "text-stone-300 cursor-not-allowed line-through" :
                isUnavail ? "bg-red-100 text-red-400 cursor-not-allowed line-through" :
                "bg-green-50 text-green-800 hover:bg-green-200 font-medium cursor-pointer",
              ].join(" ")}
            >
              {inMonth ? d.getDate() : ""}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-2 pt-2 border-t border-stone-100 text-[10px] text-stone-500">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-100 border border-green-300" /> Available</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-100 border border-red-300" /> Unavailable</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#4a6da7]" /> Selected</span>
      </div>
    </div>
  );
}
