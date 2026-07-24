import type { BookingEventType } from "./types";

export type PricingTier = "PUBLIC" | "MEMBER" | "CONGREGATION" | "HQ";

export const TIER_LABELS: Record<PricingTier, string> = {
  PUBLIC:       "Public / External",
  MEMBER:       "LCM Member",
  CONGREGATION: "LCM Congregation",
  HQ:           "LCM HQ & District",
};

export const TIER_COLORS: Record<PricingTier, string> = {
  PUBLIC:       "bg-red-100 text-red-700",
  MEMBER:       "bg-amber-100 text-amber-700",
  CONGREGATION: "bg-blue-100 text-blue-700",
  HQ:           "bg-green-100 text-green-700",
};

export type FacilityType = "AUDITORIUM" | "CHAPEL" | "HALL" | "CLASSROOM" | "GUEST_ROOM" | "GARDEN";

export interface FacilityDef {
  id: string;
  name: string;
  type: FacilityType;
  capacity: string;
  rateLabel: string;
  rates: Record<PricingTier, number>;          // 0 = FOC
  concurrentRates?: Record<PricingTier, number>; // halls only — discounted when booked alongside Aud/Chapel
  includes: string[];
  notes?: string;
}

export const FACILITIES: FacilityDef[] = [
  {
    id: "word-auditorium",
    name: "Word Auditorium",
    type: "AUDITORIUM",
    capacity: "800 pax",
    rateLabel: "4-hour session",
    rates: { PUBLIC: 6800, MEMBER: 4080, CONGREGATION: 4080, HQ: 2080 },
    includes: ["PA System", "PA Personnel", "LCD Projector", "Grand Piano", "Drums", "Keyboard"],
  },
  {
    id: "christ-chapel",
    name: "Christ Chapel (CCLC)",
    type: "CHAPEL",
    capacity: "180 pax",
    rateLabel: "4-hour session",
    rates: { PUBLIC: 1850, MEMBER: 1240, CONGREGATION: 1040, HQ: 940 },
    includes: ["PA System", "PA Personnel", "LCD Projector", "Drums", "Keyboard"],
  },
  {
    id: "faith-hall-1",
    name: "Faith Hall 1",
    type: "HALL",
    capacity: "20 round tables, 150 chairs",
    rateLabel: "4-hour session",
    rates: { PUBLIC: 650, MEMBER: 300, CONGREGATION: 200, HQ: 200 },
    concurrentRates: { PUBLIC: 450, MEMBER: 300, CONGREGATION: 200, HQ: 200 },
    includes: ["20 Round Tables", "150 Chairs"],
    notes: "Discounted rate when booked concurrently with Word Auditorium or Christ Chapel",
  },
  {
    id: "faith-hall-2",
    name: "Faith Hall 2",
    type: "HALL",
    capacity: "20 round tables, 150 chairs",
    rateLabel: "4-hour session",
    rates: { PUBLIC: 650, MEMBER: 300, CONGREGATION: 200, HQ: 200 },
    concurrentRates: { PUBLIC: 450, MEMBER: 300, CONGREGATION: 200, HQ: 200 },
    includes: ["20 Round Tables", "150 Chairs"],
    notes: "Discounted rate when booked concurrently with Word Auditorium or Christ Chapel",
  },
  {
    id: "semenyih-room",
    name: "Semenyih Room",
    type: "CLASSROOM",
    capacity: "40 pax (with tables) / 60–80 pax (without tables)",
    rateLabel: "4-hour session",
    rates: { PUBLIC: 200, MEMBER: 150, CONGREGATION: 100, HQ: 100 },
    includes: [],
  },
  {
    id: "balakong-room",
    name: "Balakong Room",
    type: "CLASSROOM",
    capacity: "40 pax (with tables) / 60–80 pax (without tables)",
    rateLabel: "4-hour session",
    rates: { PUBLIC: 200, MEMBER: 150, CONGREGATION: 100, HQ: 100 },
    includes: [],
  },
  {
    id: "menglembu-room",
    name: "Menglembu Room",
    type: "CLASSROOM",
    capacity: "20–24 pax (with tables) / 30–40 pax (without tables)",
    rateLabel: "4-hour session",
    rates: { PUBLIC: 150, MEMBER: 100, CONGREGATION: 80, HQ: 80 },
    includes: [],
  },
  {
    id: "guest-room-501",
    name: "Guest Room No. 501",
    type: "GUEST_ROOM",
    capacity: "2 persons (2× Single Bed)",
    rateLabel: "per night",
    rates: { PUBLIC: 100, MEMBER: 80, CONGREGATION: 80, HQ: 50 },
    includes: [],
  },
  {
    id: "guest-room-502",
    name: "Guest Room No. 502",
    type: "GUEST_ROOM",
    capacity: "2 persons (1× Double Bed)",
    rateLabel: "per night",
    rates: { PUBLIC: 100, MEMBER: 80, CONGREGATION: 80, HQ: 50 },
    includes: [],
  },
  {
    id: "guest-room-503",
    name: "Guest Room No. 503",
    type: "GUEST_ROOM",
    capacity: "2 persons (2× Single Bed)",
    rateLabel: "per night",
    rates: { PUBLIC: 100, MEMBER: 80, CONGREGATION: 80, HQ: 50 },
    includes: [],
  },
  {
    id: "grace-garden-day",
    name: "Grace Garden (Day)",
    type: "GARDEN",
    capacity: "50–60 pax",
    rateLabel: "per day",
    rates: { PUBLIC: 400, MEMBER: 300, CONGREGATION: 200, HQ: 0 },
    includes: [],
    notes: "LCM HQ & District: FOC",
  },
  {
    id: "grace-garden-night",
    name: "Grace Garden (Night, after 6 pm)",
    type: "GARDEN",
    capacity: "50–60 pax",
    rateLabel: "per night",
    rates: { PUBLIC: 500, MEMBER: 400, CONGREGATION: 300, HQ: 0 },
    includes: [],
    notes: "Night usage after 6 pm. LCM HQ & District: FOC",
  },
];

export const FACILITY_TYPE_LABELS: Record<FacilityType, string> = {
  AUDITORIUM: "Auditorium",
  CHAPEL:     "Chapel",
  HALL:       "Hall",
  CLASSROOM:  "Classroom",
  GUEST_ROOM: "Guest Room",
  GARDEN:     "Garden",
};

export function getFacility(id: string): FacilityDef | undefined {
  return FACILITIES.find(f => f.id === id);
}

export function getRate(facility: FacilityDef, tier: PricingTier, isConcurrent = false): number {
  if (isConcurrent && facility.concurrentRates) return facility.concurrentRates[tier];
  return facility.rates[tier];
}

export function formatRate(amount: number): string {
  return amount === 0 ? "FOC" : `RM ${amount.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;
}

// Default hour-block (24h, half-open) for a new session date, based on the
// facility's rate label — e.g. "4-hour session" defaults to a 4-hour block
// starting at 9am; "per night" defaults to an evening block.
export function defaultSessionHours(rateLabel: string): { start: number; end: number } {
  const m = rateLabel.match(/(\d+)-hour/);
  if (m) {
    const dur = parseInt(m[1], 10);
    return { start: 9, end: Math.min(22, 9 + dur) };
  }
  if (rateLabel.includes("night")) return { start: 18, end: 23 };
  return { start: 9, end: 18 }; // "per day" and any other fallback
}

export function fmtHour(h: number): string {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${h < 12 || h === 24 ? "am" : "pm"}`;
}

export function fmtCurrency(n: number): string {
  return "RM " + n.toLocaleString("en-MY", { minimumFractionDigits: 2 });
}

export function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" });
}

// Does date range [aS,aE] overlap [bS,bE]? (all yyyy-mm-dd strings)
export function dateRangesOverlap(aS: string, aE: string, bS: string, bE: string): boolean {
  return aS <= bE && bS <= aE;
}

// yyyy-mm-dd from a Date's LOCAL fields — never .toISOString(), which
// converts to UTC first and silently shifts the date by a day in any
// positive-offset timezone (e.g. Malaysia, UTC+8: local midnight becomes
// 4pm the previous day in UTC).
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Every calendar night from check-in (inclusive) to check-out (exclusive) —
// standard hotel-booking semantics. E.g. check-in 2026-08-01, check-out
// 2026-08-03 books 2 nights: 08-01 and 08-02. Used for Guest Room bookings,
// which are billed per night and don't need a time-of-day picked.
export function nightsBetween(checkIn: string, checkOut: string): string[] {
  if (!checkIn || !checkOut || checkOut <= checkIn) return [];
  const nights: string[] = [];
  const cur = new Date(checkIn + "T00:00:00");
  const end = new Date(checkOut + "T00:00:00");
  while (cur < end) {
    nights.push(ymd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return nights;
}

// The night after the given date, as yyyy-mm-dd — used to derive a
// check-out date from the last booked night.
export function dayAfter(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return ymd(d);
}

// Halls offered at a discounted "concurrent" rate alongside the Auditorium/Chapel,
// shared between the internal New Booking form and the public booking page.
export const CONCURRENT_TRIGGERS = ["word-auditorium", "christ-chapel"];
export const CONCURRENT_HALLS = ["faith-hall-1", "faith-hall-2"];

// Event types for facility bookings. Weddings require an endorsement letter
// (signed by the pastor-in-charge, chopped by church administration) —
// the other types don't.
export const EVENT_TYPES: { value: BookingEventType; label: string }[] = [
  { value: "WEDDING",            label: "Wedding" },
  { value: "TRAINING_WORKSHOP",  label: "Training Workshop" },
  { value: "WORSHIP_SERVICE",    label: "Worship Service" },
  { value: "FELLOWSHIP_EVENT",   label: "Fellowship Event" },
  { value: "OTHER",              label: "Other" },
];

// Editable rate overrides (from the facility_rates table), keyed by facility id.
export interface RateOverride {
  facility_id: string;
  rates?: Partial<Record<PricingTier, number>>;
  concurrent_rates?: Partial<Record<PricingTier, number>> | null;
}

// Merge DB rate overrides onto the hardcoded defaults, returning an effective
// facility list. Components keep calling getRate(def, …) unchanged.
export function applyRateOverrides(overrides: RateOverride[]): FacilityDef[] {
  if (!overrides?.length) return FACILITIES;
  const byId = new Map(overrides.map(o => [o.facility_id, o]));
  return FACILITIES.map(f => {
    const o = byId.get(f.id);
    if (!o) return f;
    return {
      ...f,
      rates: { ...f.rates, ...(o.rates ?? {}) },
      concurrentRates: o.concurrent_rates
        ? { ...(f.concurrentRates ?? f.rates), ...o.concurrent_rates }
        : f.concurrentRates,
    };
  });
}
