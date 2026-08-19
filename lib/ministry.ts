// Ordination and ministry status — the two facts that used to be one column.
//
// Ordination is what somebody is, and does not lapse. Status is what they are
// doing now, and does. Keeping them apart is what lets a retired Reverend stay
// a Reverend: before migration 154 the record said only RETIRED, and the title
// survived nowhere but a hand-typed preferred name.
//
// Both lists live here rather than in each page, because the label a Dean
// picker shows and the label the profile shows are the same label, and two
// copies is one place for them to disagree.

export type Ordination = "PASTOR" | "REVEREND";
export type MinistryStatus = "ACTIVE" | "RETIRED_CONTRACT" | "RETIRED";

export const ORDINATIONS: { key: Ordination; label: string; title: string }[] = [
  { key: "PASTOR", label: "Pastor (unordained)", title: "Pastor" },
  { key: "REVEREND", label: "Rev. (ordained)", title: "Rev." },
];

export const MINISTRY_STATUSES: { key: MinistryStatus; label: string }[] = [
  { key: "ACTIVE", label: "Serving" },
  { key: "RETIRED_CONTRACT", label: "Retired, still working on contract" },
  { key: "RETIRED", label: "Retired, not working" },
];

/** The title somebody carries — "Rev." or "Pastor" — regardless of retirement. */
export function ministryTitle(ordination: string | null | undefined): string | null {
  return ORDINATIONS.find(o => o.key === ordination)?.title ?? null;
}

export function isRetired(status: string | null | undefined): boolean {
  return status === "RETIRED" || status === "RETIRED_CONTRACT";
}

/**
 * How the pair reads on a profile: "Rev.", "Rev. — retired, still on contract",
 * "Retired" when the title was never recorded.
 *
 * Title first, because it is the part that identifies somebody. Retirement is a
 * qualifier on it, which is exactly the relationship the single column could
 * not express.
 */
export function standingLabel(
  ordination: string | null | undefined,
  status: string | null | undefined,
): string | null {
  const title = ministryTitle(ordination);
  if (!status) return title;

  const qualifier =
    status === "RETIRED_CONTRACT" ? "retired, still on contract"
      : status === "RETIRED" ? "retired"
      : null;

  if (!title) return qualifier ? qualifier[0].toUpperCase() + qualifier.slice(1) : "In ministry";
  return qualifier ? `${title} — ${qualifier}` : title;
}

/**
 * A name with its title, for lists and pickers: "Rev. Tan Hee Ming".
 *
 * Falls back to the bare name rather than inventing a title, since an unrecorded
 * ordination is a real state and guessing one is how a Pastor gets addressed as
 * a Reverend in a letter.
 */
export function withTitle(name: string, ordination: string | null | undefined): string {
  const title = ministryTitle(ordination);
  return title && !name.startsWith(title) ? `${title} ${name}` : name;
}
