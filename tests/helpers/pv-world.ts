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

/** A query builder over pvWorld.tables, covering only the shapes these functions use. */
export function pvQuery(table: string) {
  const eqs: Record<string, unknown> = {};
  /** Array columns: every value must be present in the row's array. */
  const containsAll: [string, unknown[]][] = [];
  let patch: Row | null = null;
  let inserted: Row[] | null = null;

  const rows = (): Row[] => {
    const src = pvWorld.tables[table];
    if (!src) throw new Error(`the stub knows nothing of the table "${table}"`);
    return src.filter(r =>
      Object.entries(eqs).every(([c, v]) => norm(r[c]) === norm(v)) &&
      containsAll.every(([c, vs]) => {
        const held = Array.isArray(r[c]) ? (r[c] as unknown[]) : [];
        return vs.every(v => held.some(h => norm(h) === norm(v)));
      }));
  };

  const q = {
    select: () => q,
    order: () => q,
    eq: (c: string, v: unknown) => { eqs[c] = v; return q; },
    contains: (c: string, vs: unknown[]) => { containsAll.push([c, vs]); return q; },
    update: (p: Row) => { patch = p; return q; },
    insert: (rowsIn: Row | Row[]) => { inserted = Array.isArray(rowsIn) ? rowsIn : [rowsIn]; return q; },
    single: async () => ({ data: rows()[0] ?? null, error: rows()[0] ? null : { message: "no rows" } }),
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
      if (inserted) {
        if (table === "notifications") pvWorld.notifications.push(...inserted);
        else (pvWorld.tables[table] ??= []).push(...inserted);
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
