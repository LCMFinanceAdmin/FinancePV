/**
 * The stand-in world a payment-voucher edge function runs against.
 *
 * Tables are plain arrays. `rpc` answers the one remote call the verification
 * path makes. `mail` and `push` record what would have gone out.
 */
export interface Row { [k: string]: unknown }

export const pvWorld: {
  tables: Record<string, Row[]>;
  user: { email: string } | null;
  /** Ministry + project pairs the signed-in caller may verify on the EXCO's behalf. */
  delegations: { email: string; ministry: string; project?: string | null }[];
  notifications: Row[];
  push: { to: string[]; title: string }[];
} = { tables: {}, user: null, delegations: [], notifications: [], push: [] };

export function resetPv() {
  pvWorld.tables = {};
  pvWorld.user = null;
  pvWorld.delegations = [];
  pvWorld.notifications = [];
  pvWorld.push = [];
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/**
 * Tables that are simply empty when a test does not mention them.
 *
 * Every handler reads a few of these on its way to the thing being tested —
 * saved signatures, the voucher-number pool, the outbox. Requiring each test
 * to declare them would be noise, and the point of throwing on an unknown
 * table is to catch a query nobody expected, not this.
 */
const ALWAYS_PRESENT = [
  "user_security_credentials",
  "pv_number_pool",
  "notifications",
];

/** A query builder over pvWorld.tables, covering only the shapes these functions use. */
let rowCounter = 0;

export function pvQuery(table: string) {
  const eqs: Record<string, unknown> = {};
  /** Array columns: every value must be present in the row's array. */
  const containsAll: [string, unknown[]][] = [];
  const likes: [string, string][] = [];
  const inLists: [string, unknown[]][] = [];
  const isNull: string[] = [];
  let sort: { column: string; ascending: boolean } | null = null;
  let limit: number | null = null;
  let patch: Row | null = null;
  let inserted: Row[] | null = null;

  const rows = (): Row[] => {
    const src = pvWorld.tables[table] ?? (ALWAYS_PRESENT.includes(table) ? [] : undefined);
    if (!src) throw new Error(`the stub knows nothing of the table "${table}"`);
    const out = src.filter(r =>
      Object.entries(eqs).every(([c, v]) => norm(r[c]) === norm(v)) &&
      containsAll.every(([c, vs]) => {
        const held = Array.isArray(r[c]) ? (r[c] as unknown[]) : [];
        return vs.every(v => held.some(h => norm(h) === norm(v)));
      }) &&
      // Only the prefix form the voucher series uses, which is all it needs.
      likes.every(([c, pattern]) => norm(r[c]).startsWith(norm(pattern.replace(/%$/, "")))) &&
      inLists.every(([c, vs]) => vs.some(v => norm(v) === norm(r[c]))) &&
      isNull.every(c => r[c] === null || r[c] === undefined));
    if (sort) {
      const { column, ascending } = sort;
      out.sort((a, b) => (norm(a[column]) < norm(b[column]) ? -1 : norm(a[column]) > norm(b[column]) ? 1 : 0) * (ascending ? 1 : -1));
    }
    return limit === null ? out : out.slice(0, limit);
  };

  /** Apply a pending insert, once, and hand back what was written. */
  const flushInsert = (): Row[] | null => {
    if (!inserted) return null;
    const written = inserted.map(r => ({ id: `row-${++rowCounter}`, ...r }));
    inserted = null;
    if (table === "notifications") pvWorld.notifications.push(...written);
    else (pvWorld.tables[table] ??= []).push(...written);
    return written;
  };

  const q = {
    select: () => q,
    order: (column?: string, opts?: { ascending?: boolean }) => {
      if (column) sort = { column, ascending: opts?.ascending !== false };
      return q;
    },
    eq: (c: string, v: unknown) => { eqs[c] = v; return q; },
    contains: (c: string, vs: unknown[]) => { containsAll.push([c, vs]); return q; },
    in: (c: string, vs: unknown[]) => { inLists.push([c, vs]); return q; },
    like: (c: string, pattern: string) => { likes.push([c, pattern]); return q; },
    is: (c: string, v: unknown) => { if (v === null) isNull.push(c); return q; },
    limit: (n: number) => { limit = n; return q; },
    upsert: (rowsIn: Row | Row[]) => { inserted = Array.isArray(rowsIn) ? rowsIn : [rowsIn]; return q; },
    update: (p: Row) => { patch = p; return q; },
    insert: (rowsIn: Row | Row[]) => { inserted = Array.isArray(rowsIn) ? rowsIn : [rowsIn]; return q; },
    // insert(...).select(...).single() is how a row is written and read back,
    // so a pending insert is applied here rather than waiting for an await on
    // the builder itself.
    single: async () => {
      const wrote = flushInsert();
      if (wrote) return { data: wrote[0] ?? null, error: null };
      const r = rows()[0] ?? null;
      return { data: r, error: r ? null : { message: "no rows" } };
    },
    maybeSingle: async () => {
      const wrote = flushInsert();
      if (wrote) return { data: wrote[0] ?? null, error: null };
      return { data: rows()[0] ?? null, error: null };
    },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
      if (inserted) {
        flushInsert();
        return Promise.resolve({ error: null }).then(res, rej);
      }
      if (patch) {
        for (const r of rows()) Object.assign(r, patch);
        return Promise.resolve({ error: null }).then(res, rej);
      }
      return Promise.resolve({ data: rows(), error: null }).then(res, rej);
    },
  };
  return q;
}

export function pvClient() {
  return {
    from: pvQuery,
    // is_delegated_verifier: has the EXCO handed this budget line to them?
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name !== "is_delegated_verifier") {
        throw new Error(`the stub knows nothing of the function "${name}"`);
      }
      const hit = pvWorld.delegations.some(d =>
        norm(d.email) === norm(args.p_email) &&
        norm(d.ministry) === norm(args.p_ministry) &&
        // No project on the delegation means the whole ministry.
        (!d.project || norm(d.project) === norm(args.p_project)));
      return { data: hit };
    },
    auth: {
      getUser: async () => ({
        data: { user: pvWorld.user },
        error: pvWorld.user ? null : { message: "no session" },
      }),
    },
  };
}
