"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Ban, Plus } from "lucide-react";
import type { FacilityBooking, FacilityBlock } from "@/lib/types";

const BLOCK_LABEL: Record<string, string> = {
  REHEARSAL: "Rehearsal", EVENT_HOLD: "Event hold", MAINTENANCE: "Maintenance", OTHER: "Blocked",
};

function blocksOn(blocks: FacilityBlock[], day: Date): FacilityBlock[] {
  const t = day.getTime();
  return blocks.filter(b => {
    const start = parseYmd(b.start_date).getTime();
    const end = parseYmd(b.end_date).getTime();
    return t >= start && t <= end;
  });
}

type CalMode = "year" | "month" | "week";

const STATUS_DOT: Record<FacilityBooking["status"], string> = {
  ENQUIRY: "bg-amber-400",
  CONFIRMED: "bg-blue-500",
  INVOICED: "bg-purple-500",
  PAID: "bg-green-500",
  CANCELLED: "bg-stone-300",
};
const STATUS_CHIP: Record<FacilityBooking["status"], string> = {
  ENQUIRY: "bg-amber-100 text-amber-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  INVOICED: "bg-purple-100 text-purple-700",
  PAID: "bg-green-100 text-green-700",
  CANCELLED: "bg-stone-100 text-stone-400",
};
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseYmd(s: string): Date {
  const [y, m, d] = s.split("T")[0].split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

// Bookings active on a given day (start_date..end_date inclusive; CANCELLED excluded).
function bookingsOn(bookings: FacilityBooking[], day: Date): FacilityBooking[] {
  const t = day.getTime();
  return bookings.filter(b => {
    if (b.status === "CANCELLED" || !b.start_date) return false;
    const start = parseYmd(b.start_date).getTime();
    const end = (b.end_date ? parseYmd(b.end_date) : parseYmd(b.start_date)).getTime();
    return t >= start && t <= end;
  });
}

interface CalendarProps {
  bookings: FacilityBooking[];
  blocks?: FacilityBlock[];
  canBlock?: boolean;
  onSelect?: (b: FacilityBooking) => void;
  onDayClick?: (ymd: string) => void;     // create a block for this day
  onBlockClick?: (block: FacilityBlock) => void;
}

export function BookingCalendar({ bookings, blocks = [], canBlock = false, onSelect, onDayClick, onBlockClick }: CalendarProps) {
  const [mode, setMode] = useState<CalMode>("month");
  const [cursor, setCursor] = useState(new Date());

  function shift(delta: number) {
    const d = new Date(cursor);
    if (mode === "year") d.setFullYear(d.getFullYear() + delta);
    else if (mode === "month") d.setMonth(d.getMonth() + delta);
    else d.setDate(d.getDate() + delta * 7);
    setCursor(d);
  }

  const title = mode === "year" ? String(cursor.getFullYear())
    : mode === "month" ? `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
    : weekTitle(cursor);

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={() => shift(-1)} className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50"><ChevronLeft size={15} /></button>
          <span className="text-sm font-semibold text-stone-800 w-44 text-center">{title}</span>
          <button onClick={() => shift(1)} className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50"><ChevronRight size={15} /></button>
          <button onClick={() => setCursor(new Date())} className="ml-1 text-xs px-2 py-1 rounded-lg border border-stone-200 hover:bg-stone-50">Today</button>
        </div>
        <div className="flex items-center gap-2">
          {canBlock && (
            <button onClick={() => onDayClick?.(ymd(new Date()))}
              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border border-stone-300 text-stone-600 hover:bg-stone-50">
              <Plus size={13} /> Block dates
            </button>
          )}
          <div className="inline-flex rounded-lg border border-stone-200 overflow-hidden text-xs font-semibold">
            {(["week", "month", "year"] as CalMode[]).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1 capitalize transition-colors ${mode === m ? "bg-[#4a6da7] text-white" : "bg-white text-stone-600 hover:bg-stone-50"}`}>{m}</button>
            ))}
          </div>
        </div>
      </div>

      {mode === "month" && <MonthGrid cursor={cursor} bookings={bookings} blocks={blocks} canBlock={canBlock} onSelect={onSelect} onDayClick={onDayClick} onBlockClick={onBlockClick} />}
      {mode === "week" && <WeekGrid cursor={cursor} bookings={bookings} blocks={blocks} canBlock={canBlock} onSelect={onSelect} onDayClick={onDayClick} onBlockClick={onBlockClick} />}
      {mode === "year" && <YearGrid cursor={cursor} bookings={bookings} blocks={blocks} onJump={(d) => { setCursor(d); setMode("month"); }} />}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-stone-100">
        {(Object.keys(STATUS_DOT) as FacilityBooking["status"][]).filter(s => s !== "CANCELLED").map(s => (
          <span key={s} className="flex items-center gap-1.5 text-[11px] text-stone-500">
            <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[s]}`} /> {s.charAt(0) + s.slice(1).toLowerCase()}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[11px] text-stone-500">
          <span className="w-2.5 h-2.5 rounded-full bg-stone-400" /> Blocked
        </span>
        {canBlock && <span className="text-[11px] text-stone-400">· click a day to block it</span>}
      </div>
    </div>
  );
}

function weekTitle(cursor: Date): string {
  const start = startOfWeek(cursor);
  const end = new Date(start); end.setDate(start.getDate() + 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const fmt = (d: Date, withMonth: boolean) => `${d.getDate()}${withMonth ? " " + MONTHS[d.getMonth()].slice(0, 3) : ""}`;
  return `${fmt(start, true)} – ${fmt(end, !sameMonth)} ${end.getFullYear()}`;
}
function startOfWeek(d: Date): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - s.getDay());
  return s;
}

interface GridProps {
  cursor: Date; bookings: FacilityBooking[]; blocks: FacilityBlock[]; canBlock?: boolean;
  onSelect?: (b: FacilityBooking) => void; onDayClick?: (ymd: string) => void; onBlockClick?: (b: FacilityBlock) => void;
}

function MonthGrid({ cursor, bookings, blocks, canBlock, onSelect, onDayClick, onBlockClick }: GridProps) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const today = ymd(new Date());
  const cells: Date[] = Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d; });
  return (
    <div>
      <div className="grid grid-cols-7 text-[11px] font-semibold text-stone-400 mb-1">{DOW.map(d => <div key={d} className="px-1 py-1 text-center">{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const dayBookings = bookingsOn(bookings, d);
          const dayBlocks = blocksOn(blocks, d);
          return (
            <div key={i} onClick={canBlock && inMonth ? () => onDayClick?.(ymd(d)) : undefined}
              className={`min-h-[78px] rounded-lg border p-1 ${inMonth ? "border-stone-200" : "border-stone-100 bg-stone-50/50"} ${canBlock && inMonth ? "cursor-pointer hover:bg-stone-50" : ""}`}>
              <div className={`text-[11px] mb-0.5 ${ymd(d) === today ? "font-bold text-[#4a6da7]" : inMonth ? "text-stone-500" : "text-stone-300"}`}>{d.getDate()}</div>
              <div className="space-y-0.5">
                {dayBlocks.map(b => (
                  <button key={b.id} onClick={e => { e.stopPropagation(); onBlockClick?.(b); }}
                    className="w-full text-left text-[10px] leading-tight px-1 py-0.5 rounded truncate bg-stone-200 text-stone-600 hover:bg-stone-300 flex items-center gap-0.5"
                    title={`Blocked — ${BLOCK_LABEL[b.reason]}${b.notes ? ": " + b.notes : ""}`}>
                    <Ban size={8} className="shrink-0" /> {BLOCK_LABEL[b.reason]}
                  </button>
                ))}
                {dayBookings.slice(0, 3).map(b => (
                  <button key={b.id} onClick={e => { e.stopPropagation(); onSelect?.(b); }}
                    className={`w-full text-left text-[10px] leading-tight px-1 py-0.5 rounded truncate ${STATUS_CHIP[b.status]} hover:opacity-80`}
                    title={`${b.event_name || b.booker_name} — ${b.booking_items.map(it => it.facility_name).join(", ")}`}>
                    {b.event_name || b.booker_name}
                  </button>
                ))}
                {dayBookings.length > 3 && <div className="text-[9px] text-stone-400 px-1">+{dayBookings.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekGrid({ cursor, bookings, blocks, canBlock, onSelect, onDayClick, onBlockClick }: GridProps) {
  const start = startOfWeek(cursor);
  const today = ymd(new Date());
  const days: Date[] = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  return (
    <div className="grid grid-cols-7 gap-1">
      {days.map((d, i) => {
        const dayBookings = bookingsOn(bookings, d);
        const dayBlocks = blocksOn(blocks, d);
        return (
          <div key={i} onClick={canBlock ? () => onDayClick?.(ymd(d)) : undefined}
            className={`min-h-[180px] rounded-lg border border-stone-200 p-1.5 ${canBlock ? "cursor-pointer hover:bg-stone-50" : ""}`}>
            <div className={`text-[11px] mb-1 ${ymd(d) === today ? "font-bold text-[#4a6da7]" : "text-stone-500"}`}>{DOW[d.getDay()]} {d.getDate()}</div>
            <div className="space-y-1">
              {dayBlocks.map(b => (
                <button key={b.id} onClick={e => { e.stopPropagation(); onBlockClick?.(b); }}
                  className="w-full text-left text-[10px] leading-tight px-1.5 py-1 rounded bg-stone-200 text-stone-600 hover:bg-stone-300 flex items-center gap-1">
                  <Ban size={9} className="shrink-0" /> <span className="truncate">{BLOCK_LABEL[b.reason]}{b.notes ? ` — ${b.notes}` : ""}</span>
                </button>
              ))}
              {dayBookings.map(b => (
                <button key={b.id} onClick={e => { e.stopPropagation(); onSelect?.(b); }}
                  className={`w-full text-left text-[10px] leading-tight px-1.5 py-1 rounded ${STATUS_CHIP[b.status]} hover:opacity-80`}>
                  <div className="font-medium truncate">{b.event_name || b.booker_name}</div>
                  <div className="truncate opacity-80">{b.booking_items.map(it => it.facility_name).join(", ")}</div>
                  {b.start_time && <div className="opacity-70">{b.start_time}{b.end_time ? `–${b.end_time}` : ""}</div>}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function YearGrid({ cursor, bookings, blocks, onJump }: { cursor: Date; bookings: FacilityBooking[]; blocks: FacilityBlock[]; onJump: (d: Date) => void }) {
  const year = cursor.getFullYear();
  const today = ymd(new Date());
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {MONTHS.map((mName, m) => {
        const first = new Date(year, m, 1);
        const gridStart = startOfWeek(first);
        const cells: Date[] = Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d; });
        return (
          <button key={m} onClick={() => onJump(new Date(year, m, 1))}
            className="text-left rounded-xl border border-stone-200 p-2 hover:border-[#4a6da7]/40 hover:shadow-sm transition-all">
            <div className="text-xs font-semibold text-stone-700 mb-1">{mName}</div>
            <div className="grid grid-cols-7 gap-[1px]">
              {cells.map((d, i) => {
                const inMonth = d.getMonth() === m;
                const hasBooking = inMonth && bookingsOn(bookings, d).length > 0;
                const hasBlock = inMonth && blocksOn(blocks, d).length > 0;
                return (
                  <div key={i} className={`aspect-square flex items-center justify-center text-[8px] rounded-sm ${
                    !inMonth ? "text-stone-200" : hasBooking ? "bg-[#4a6da7] text-white font-bold" : hasBlock ? "bg-stone-300 text-stone-700 font-bold" : ymd(d) === today ? "ring-1 ring-[#4a6da7] text-[#4a6da7]" : "text-stone-400"
                  }`}>{inMonth ? d.getDate() : ""}</div>
                );
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}
