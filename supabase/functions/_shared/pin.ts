// Approval PINs.
//
// The PIN is the second factor on a payment of any size, and it is six digits —
// a million possibilities. It was hashed with a single pass of SHA-256 and one
// salt shared by every signatory, which means a leaked pin_hash column could be
// exhausted in well under a second, and one table would cover all three of them
// at once. A second factor should survive exactly the event it exists for.
//
// So: PBKDF2-SHA-256, a random salt per person, and enough iterations that a
// million guesses is no longer free. The cost falls on the attacker trying the
// whole space; a signatory pays it once per approval and will not notice.
//
// Nobody has to re-set their PIN. Hashes carry their format, and an old one is
// verified the old way and then quietly rewritten in the new format the next
// time it is used correctly — see verifyPin().

const LEGACY_SALT = Deno.env.get("PIN_SALT") ?? "lcm-finance-pin-salt";

// OWASP's current floor for PBKDF2-SHA-256. Stored in the hash rather than
// assumed, so this can be raised later without invalidating what is already
// there — an old hash keeps verifying at its own count and is rewritten at the
// new one on next use.
const ITERATIONS = 210_000;

const enc = new TextEncoder();

function toB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

/** Compares without leaking, through timing, how much of the value matched. */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return toB64(new Uint8Array(bits));
}

/** The old scheme, kept only so existing PINs keep working until they upgrade. */
async function legacyHash(pin: string): Promise<string> {
  const data = enc.encode(pin + LEGACY_SALT);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** `pbkdf2$<iterations>$<salt>$<hash>` — self-describing, so it can be changed again. */
export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(pin, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${hash}`;
}

export interface PinCheck {
  ok: boolean;
  /**
   * Set when the PIN was right but stored in the old format. Write it back and
   * the upgrade happens without anyone being asked to do anything — the moment
   * a signatory next approves something, their PIN stops being cheap to crack.
   */
  upgraded?: string;
}

export async function verifyPin(pin: string, stored: string | null): Promise<PinCheck> {
  if (!stored) return { ok: false };

  if (stored.startsWith("pbkdf2$")) {
    const [, iterations, salt, hash] = stored.split("$");
    const candidate = await pbkdf2(pin, fromB64(salt), Number(iterations));
    return { ok: sameSecret(candidate, hash) };
  }

  const ok = sameSecret(await legacyHash(pin), stored);
  return ok ? { ok, upgraded: await hashPin(pin) } : { ok: false };
}
