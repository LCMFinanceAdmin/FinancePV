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
