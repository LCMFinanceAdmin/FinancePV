// Suggesting the next office reference, and noticing when one looks wrong.
//
// The church files under its own sequence, which this system does not own and
// should not invent. So nothing here imposes a format: the suggestion is read
// off whatever was last entered, and everything is advisory. Finance types
// what the books say, and is told if that looks unlike what came before.
//
// A suggestion that cannot be refused is just an allocation with extra steps.

/** The trailing run of digits, which is the part that counts up. */
const TAIL = /^(.*?)(\d+)(\D*)$/;

/**
 * The next reference after `previous`, in the same shape.
 *
 * "PV/2026/0417" gives "PV/2026/0418"; "LCM-2026-004" gives "LCM-2026-005";
 * "009" gives "010", because the width of the number is part of the format and
 * dropping a leading zero would break a sort somebody relies on.
 *
 * Empty when there is nothing to go on — no previous reference, or one with no
 * number in it. Guessing from nothing is how a sequence gets a number nobody
 * meant.
 */
export function nextOfficeRef(previous: string | null | undefined): string {
  const prev = (previous ?? "").trim();
  if (!prev) return "";
  const m = TAIL.exec(prev);
  if (!m) return "";
  const [, head, digits, tail] = m;
  const next = String(Number(digits) + 1);
  // Keep the original width unless the number has outgrown it.
  return head + next.padStart(digits.length, "0") + tail;
}

/** The numeric part, for comparing two references in the same series. */
export function refSequence(ref: string | null | undefined): number | null {
  const m = TAIL.exec((ref ?? "").trim());
  return m ? Number(m[2]) : null;
}

/** The part before the number — two references only compare within one series. */
export function refSeries(ref: string | null | undefined): string {
  const m = TAIL.exec((ref ?? "").trim());
  return m ? m[1].toLowerCase() : (ref ?? "").trim().toLowerCase();
}

export interface RefNote {
  tone: "none" | "warn" | "info";
  message: string;
}

/**
 * What is worth saying about a reference somebody has typed.
 *
 * Never a refusal. A duplicate is worth stopping to look at, a jump in the
 * sequence is worth mentioning, and anything else passes without comment —
 * including a reference in a shape nobody has used before, because starting a
 * new series is a thing Finance is allowed to do.
 */
export function checkOfficeRef(
  entered: string | null | undefined,
  others: { ref: string; pv_no: string }[],
  previous?: string | null,
): RefNote {
  const value = (entered ?? "").trim();
  if (!value) return { tone: "none", message: "" };

  const clash = others.find(o => o.ref.trim().toLowerCase() === value.toLowerCase());
  if (clash) {
    return { tone: "warn", message: `${clash.pv_no} already uses this reference.` };
  }

  const expected = nextOfficeRef(previous);
  if (expected && expected.toLowerCase() !== value.toLowerCase()
      && refSeries(expected) === refSeries(value)) {
    const a = refSequence(value), b = refSequence(expected);
    if (a !== null && b !== null && a !== b) {
      return {
        tone: "info",
        message: a > b
          ? `${expected} was expected next — ${a - b} number${a - b === 1 ? "" : "s"} skipped.`
          : `${expected} was expected next — this one goes backwards.`,
      };
    }
  }
  return { tone: "none", message: "" };
}
