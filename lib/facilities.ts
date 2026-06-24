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
