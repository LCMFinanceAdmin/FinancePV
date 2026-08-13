import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

export function getUserClient(jwt: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } }
  );
}

// Tolerates duplicate user_roles rows for the same email — .single() errors
// and silently returns null in that case, which surfaces as a misleading 403.
export async function getProfileByEmail(
  db: ReturnType<typeof getServiceClient>,
  email: string,
  columns = "role,full_name",
) {
  const { data } = await db.from("user_roles").select(columns).eq("email", email).limit(1);
  const profile = data?.[0];
  if (!profile) return null;

  // PIN hashes and reusable signatures intentionally live outside the broadly
  // readable directory profile. This helper runs only in service-role actions.
  // The lockout columns arrive with migration 111. A function deploy and a
  // migration are two separate acts and will not land in the same instant, so
  // this asks for them and falls back to the columns that have always been
  // there if they are not present yet. Without that, the gap between deploying
  // and migrating is a gap in which no signatory can approve anything — the
  // failed select returns no credentials at all, and every PIN reads as unset.
  let { data: credentials, error: credError } = await db
    .from("user_security_credentials")
    .select("pin_hash,has_pin,saved_signatures,pin_failed_attempts,pin_last_failed_at,pin_locked_until")
    .eq("email", email)
    .maybeSingle();

  // Only retry when the *query* failed — which, before migration 111 landed,
  // meant the lockout columns were not there yet. Most people have no
  // credentials row at all (no PIN, no saved signature), and retrying for them
  // would be a second round trip on every action for nothing.
  if (credError) {
    const fallback = await db
      .from("user_security_credentials")
      .select("pin_hash,has_pin,saved_signatures")
      .eq("email", email)
      .maybeSingle();
    credentials = fallback.data;
  }

  return {
    ...profile,
    pin_hash: credentials?.pin_hash ?? null,
    has_pin: credentials?.has_pin ?? false,
    saved_signature: null,
    saved_signatures: credentials?.saved_signatures ?? {},
    pin_failed_attempts: credentials?.pin_failed_attempts ?? 0,
    pin_last_failed_at: credentials?.pin_last_failed_at ?? null,
    pin_locked_until: credentials?.pin_locked_until ?? null,
  };
}

export function getLOATier(amount: number, paymentType = "GENERAL") {
  if (paymentType === "ASSET_PURCHASE" && amount > 100000) {
    return { required: 2, roles: ["BISHOP", "SECRETARY", "TREASURER"] };
  }
  if (amount <= 30000) return { required: 1, roles: ["TREASURER"] };
  return { required: 2, roles: ["BISHOP", "SECRETARY", "TREASURER"] };
}

const OFFICER_ROLES = ["BISHOP", "TREASURER", "SECRETARY"];

/**
 * Who must sign, given the amount and who is being paid.
 *
 * Normally the amount decides: the Treasurer alone up to RM 30,000, any two
 * officers above it. But nobody signs their own payment, so when the person
 * being paid holds one of the three offices, that office is taken out and the
 * other two must both sign — whatever the amount.
 *
 * That is not a new rule so much as the existing one applied honestly: two
 * independent officers. It just happens that below RM 30,000 the Treasurer is
 * normally both of them, and when the money is going to the Treasurer he is
 * neither.
 */
export function signatoryPlan(amount: number, paymentType = "GENERAL", excludeRole?: string | null) {
  const base = getLOATier(amount, paymentType);
  if (!excludeRole || !OFFICER_ROLES.includes(excludeRole)) return base;
  return { required: 2, roles: OFFICER_ROLES.filter((r) => r !== excludeRole) };
}

export function isSignatoryApprovalFinal(
  approvals: { role: string; action: string }[],
  amount: number,
  paymentType = "GENERAL",
  excludeRole?: string | null,
) {
  const plan = signatoryPlan(amount, paymentType, excludeRole);
  const officerApprovals = approvals.filter(
    (a) => plan.roles.includes(a.role) && a.action === "APPROVED"
  );
  if (plan.required === 1) return officerApprovals.some((a) => a.role === "TREASURER");
  // Two *different* officers, not two signatures — one person signing twice is
  // not a second approval.
  return new Set(officerApprovals.map((approval) => approval.role)).size >= 2;
}

/**
 * The office held by whoever this voucher pays, if any.
 *
 * Read from the applicant first and the submitter second: a voucher raised by
 * Finance on the Treasurer's behalf still pays the Treasurer, and it is the
 * payee whose signature would be self-approval.
 */
export async function beneficiaryRole(
  db: ReturnType<typeof getServiceClient>,
  pv: { applicant_email?: string | null; submitted_by_email?: string | null },
): Promise<string | null> {
  const emails = [pv.applicant_email, pv.submitted_by_email]
    .map((e) => (e ?? "").trim().toLowerCase())
    .filter(Boolean);
  if (!emails.length) return null;
  const { data } = await db.from("user_roles").select("email,role").in("email", emails);
  for (const e of emails) {
    const hit = (data ?? []).find((r: { email: string; role: string }) => r.email.toLowerCase() === e);
    if (hit && OFFICER_ROLES.includes(hit.role)) return hit.role;
  }
  return null;
}

/** Whether this caller is the person the voucher pays. */
export function isBeneficiary(
  email: string,
  pv: { applicant_email?: string | null; submitted_by_email?: string | null },
): boolean {
  const me = email.trim().toLowerCase();
  return [pv.applicant_email, pv.submitted_by_email]
    .some((e) => (e ?? "").trim().toLowerCase() === me);
}


/**
 * Take a number released by a deleted cancelled voucher, if there is one.
 *
 * Reusing a freed number keeps the series unbroken, which is what an auditor
 * expects to see. Marking it reissued in the same step is what stops it being
 * handed to two vouchers — the check-then-use is deliberately narrow.
 */
/**
 * Take a cancelled voucher's number back out of the pool, if one is waiting.
 *
 * `seriesPrefix` is year-qualified — "LCM-2026-", not "LCM". That matters: the
 * pool's own `prefix` column holds only the base, so filtering on it alone
 * would hand a number left over from a closed year to the first voucher
 * submitted in the next one. With the pool ordered oldest-first, that is not
 * an unlucky edge case but the guaranteed outcome every 1 January. A number
 * from a closed year now simply expires unused, which is the right trade: a
 * gap in last year's sequence is a normal thing that reconciles, and a 2026
 * number on a 2027 voucher is not.
 */
async function takeReclaimedNo(db: ReturnType<typeof getServiceClient>, seriesPrefix: string): Promise<string | null> {
  const { data: free } = await db
    .from("pv_number_pool")
    .select("id,pv_no")
    .eq("prefix", seriesPrefix.split("-")[0])
    .like("pv_no", `${seriesPrefix}%`)
    .is("reissued_at", null)
    .order("pv_no", { ascending: true })
    .limit(1);

  const row = free?.[0];
  if (!row) return null;

  // Only claim it if it is still unclaimed at the moment of writing.
  const { data: claimed } = await db
    .from("pv_number_pool")
    .update({ reissued_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("reissued_at", null)
    .select("pv_no");

  return claimed?.[0]?.pv_no ?? null;
}

export async function nextPrNo(db: ReturnType<typeof getServiceClient>): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PR-${year}-`;
  const { data } = await db
    .from("purchase_requests")
    .select("request_no")
    .like("request_no", `${prefix}%`)
    .order("request_no", { ascending: false })
    .limit(1);
  const lastSeq = data?.[0]?.request_no
    ? parseInt(data[0].request_no.replace(prefix, ""), 10)
    : 0;
  const seq = String(lastSeq + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}

export async function nextPvNo(db: ReturnType<typeof getServiceClient>): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `LCM-${year}-`;
  const reclaimed = await takeReclaimedNo(db, prefix);
  if (reclaimed) return reclaimed;
  const { data } = await db
    .from("pvs")
    .select("pv_no")
    .like("pv_no", `${prefix}%`)
    .order("pv_no", { ascending: false })
    .limit(1);
  const lastSeq = data?.[0]?.pv_no
    ? parseInt(data[0].pv_no.replace(prefix, ""), 10)
    : 0;
  const seq = String(lastSeq + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}

export async function nextBamPvNo(db: ReturnType<typeof getServiceClient>): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `BAM-${year}-`;
  const reclaimed = await takeReclaimedNo(db, prefix);
  if (reclaimed) return reclaimed;
  const { data } = await db
    .from("pvs")
    .select("pv_no")
    .like("pv_no", `${prefix}%`)
    .order("pv_no", { ascending: false })
    .limit(1);
  const lastSeq = data?.[0]?.pv_no
    ? parseInt(data[0].pv_no.replace(prefix, ""), 10)
    : 0;
  const seq = String(lastSeq + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}

export async function nextLscPvNo(db: ReturnType<typeof getServiceClient>): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `LSC-${year}-`;
  const reclaimed = await takeReclaimedNo(db, prefix);
  if (reclaimed) return reclaimed;
  const { data } = await db
    .from("pvs")
    .select("pv_no")
    .like("pv_no", `${prefix}%`)
    .order("pv_no", { ascending: false })
    .limit(1);
  const lastSeq = data?.[0]?.pv_no
    ? parseInt(data[0].pv_no.replace(prefix, ""), 10)
    : 0;
  return `${prefix}${String(lastSeq + 1).padStart(3, "0")}`;
}

/** Lutheran Garden Berhad — its own series, paid from Hong Leong. */
export async function nextLgbPvNo(db: ReturnType<typeof getServiceClient>): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `LGB-${year}-`;
  const reclaimed = await takeReclaimedNo(db, prefix);
  if (reclaimed) return reclaimed;
  const { data } = await db
    .from("pvs")
    .select("pv_no")
    .like("pv_no", `${prefix}%`)
    .order("pv_no", { ascending: false })
    .limit(1);
  const lastSeq = data?.[0]?.pv_no
    ? parseInt(data[0].pv_no.replace(prefix, ""), 10)
    : 0;
  return `${prefix}${String(lastSeq + 1).padStart(3, "0")}`;
}

export async function nextHlePvNo(db: ReturnType<typeof getServiceClient>): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `HLE-${year}-`;
  const reclaimed = await takeReclaimedNo(db, prefix);
  if (reclaimed) return reclaimed;
  const { data } = await db
    .from("pvs")
    .select("pv_no")
    .like("pv_no", `${prefix}%`)
    .order("pv_no", { ascending: false })
    .limit(1);
  const lastSeq = data?.[0]?.pv_no
    ? parseInt(data[0].pv_no.replace(prefix, ""), 10)
    : 0;
  return `${prefix}${String(lastSeq + 1).padStart(3, "0")}`;
}


/**
 * Insert a voucher, re-drawing its number if that one was just taken.
 *
 * pvs.pv_no is the primary key, so two submissions racing cannot both land —
 * which is the good news, since it means a race can never produce two vouchers
 * sharing a number. The bad news was the loser's experience: the number is
 * read and written in separate statements, so the second insert failed on the
 * unique violation and the submitter saw a raw database error with nothing to
 * do about it but try again by hand.
 *
 * Retrying is safe precisely because the key rejects the duplicate: we are not
 * papering over a lost update, we are asking for the next free number now that
 * we know the one we held is gone.
 */
export async function insertPvWithNumber(
  db: ReturnType<typeof getServiceClient>,
  pvRow: Record<string, unknown>,
  nextNo: (db: ReturnType<typeof getServiceClient>) => Promise<string>,
): Promise<{ id: string | null; pvNo: string }> {
  // Three attempts: enough for a genuine collision, few enough that a real
  // fault surfaces as itself rather than as a timeout.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await db.from("pvs").insert(pvRow).select("id").single();
    if (!error) return { id: data?.id ?? null, pvNo: String(pvRow.pv_no) };

    const collided = error.code === "23505"
      && /pv_no|pvs_pkey/i.test(`${error.message} ${error.details ?? ""}`);
    if (!collided) throw new Error(error.message);

    pvRow.pv_no = await nextNo(db);
  }
  throw new Error(
    "Could not allocate a voucher number — three attempts were taken by other submissions. Please try again.",
  );
}
