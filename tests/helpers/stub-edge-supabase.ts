// Stands in for supabase/functions/_shared/supabase.ts, which reaches the
// network through a URL import and reads Deno's environment. Only the helpers
// the functions under test actually call are provided; the rest of that module
// is pure arithmetic and is left alone.
import { pvWorld, pvClient, type Row } from "./pv-world.ts";

export function getServiceClient() { return pvClient(); }
export function getUserClient(_jwt: string) { return pvClient(); }

export async function getProfileByEmail(_db: unknown, email: string, _cols?: string) {
  const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
  return (pvWorld.tables.user_roles ?? []).find((r: Row) => norm(r.email) === norm(email)) ?? null;
}

// ── Plumbing ────────────────────────────────────────────────────────────
//
// Voucher numbering and the insert retry are not what these tests are about,
// and the real versions want a reclaim pool and a unique-violation code to
// collide against. Trivial versions here; if numbering itself needs covering
// it wants its own tests against the real thing.
let seq = 0;
export async function nextPvNo() { return `LCM-TEST-${String(++seq).padStart(3, "0")}`; }
export const nextBamPvNo = nextPvNo;
export const nextLscPvNo = nextPvNo;
export const nextHlePvNo = nextPvNo;
export const nextLgbPvNo = nextPvNo;

export async function insertPvWithNumber(_db: unknown, pvRow: Row) {
  const id = `pv-${++seq}`;
  (pvWorld.tables.pvs ??= []).push({ id, ...pvRow });
  return { id, pvNo: String(pvRow.pv_no) };
}

// The number of signatures a voucher needs, by amount. Taken from the app's
// copy rather than restated here — the edge function and the app each hold
// one, and a third would be a third thing to keep in step.
export { getLOATier } from "@/lib/utils";
