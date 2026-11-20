// The date of birth inside a Malaysian IC number.
//
// A MyKad number is YYMMDD-PB-###G: six digits of birth date, two of birth
// place, four of serial. The date is already in the number, and typing it a
// second time into the box beside it is a chance to get it wrong — a wrong
// date of birth moves EPF at 60, SOCSO at 60, EIS, and whether somebody is
// past the age EPF closes to them altogether.
//
// The century is not in the number, which is the whole difficulty. Two digits
// cannot tell 1973 from 2073, so the rule is the only one that is ever right
// in practice: read it as this century, and if that puts the birth in the
// future, it was the last one. Somebody born in 1973 reads 73 → 2073 → future
// → 1973. A child born in 2019 reads 19 → 2019 → past → 2019. The rule fails
// only for somebody not yet born, which is not a payroll case.

/** Digits only — people type the dashes or leave them out, and both are the same number. */
export function digitsOf(ic: string): string {
  let out = "";
  for (const ch of ic) if (ch >= "0" && ch <= "9") out += ch;
  return out;
}

/**
 * The birth date an IC number carries, as an ISO date, or null.
 *
 * Null for anything that is not twelve digits opening on a real date. A
 * refusal is the right answer for a half-typed number: filling the box from
 * six digits that happen to parse would put a wrong date in front of somebody
 * and invite them to accept it.
 */
export function dobFromIc(ic: string, today: Date = new Date()): string | null {
  const digits = digitsOf(ic);
  if (digits.length !== 12) return null;

  const yy = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  const dd = Number(digits.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  const thisCentury = Math.floor(today.getFullYear() / 100) * 100;
  let year = thisCentury + yy;
  // A date later than today cannot be a birth date, so it belongs to the
  // century before. Compared on the day, not the year, so somebody born
  // earlier this year is not pushed back a hundred years.
  if (new Date(Date.UTC(year, mm - 1, dd)) > today) year -= 100;

  // Rejects 31 February and friends: the Date rolls them into the next month,
  // and a date that did not survive the round trip was never a date.
  const d = new Date(Date.UTC(year, mm - 1, dd));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return null;

  return d.toISOString().slice(0, 10);
}
