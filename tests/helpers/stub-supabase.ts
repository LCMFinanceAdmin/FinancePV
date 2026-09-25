// A Supabase client over the plain objects in `world`.
//
// Only the query shapes the leave routes actually use: select/eq/in/single/
// maybeSingle for reads, update+eq for writes, and auth.getUser. Anything else
// throws rather than quietly returning nothing, so a route that grows a new
// call is caught here instead of passing against a silence.
import { world, type Row } from "./world.ts";

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

function query(table: string) {
  const eqs: Record<string, unknown> = {};
  let inClause: [string, unknown[]] | null = null;
  let patch: Row | null = null;

  const rows = (): Row[] => {
    const source =
      table === "leave_applications" ? (world.leave ? [world.leave] : [])
      : table === "user_roles" ? world.roles
      : (() => { throw new Error(`the stub knows nothing of the table "${table}"`); })();
    return source.filter(r =>
      (!inClause || inClause[1].some(v => norm(v) === norm(r[inClause![0]]))) &&
      Object.entries(eqs).every(([c, v]) => norm(r[c]) === norm(v)));
  };

  const q = {
    select: () => q,
    order: () => q,
    eq: (c: string, v: unknown) => { eqs[c] = v; return q; },
    in: (c: string, vs: unknown[]) => { inClause = [c, vs]; return q; },
    update: (p: Row) => { patch = p; return q; },
    single: async () => {
      const r = rows()[0] ?? null;
      return { data: r, error: r ? null : { message: "no rows" } };
    },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    // Awaiting the builder itself: either apply the pending write or list.
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
      if (patch) {
        for (const r of rows()) Object.assign(r, patch);
        return Promise.resolve({ error: null }).then(res, rej);
      }
      return Promise.resolve({ data: rows(), error: null }).then(res, rej);
    },
  };
  return q;
}

export async function createClient() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: world.user },
        error: world.user ? null : { message: "no session" },
      }),
    },
    from: query,
  };
}
