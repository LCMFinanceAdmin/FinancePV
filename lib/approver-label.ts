import { roleLabel } from "@/lib/utils";

// "Jeffrey Koit (General Manager)".
//
// A name on its own doesn't tell you why that person is being asked to
// approve, and on a signed leave form the office matters more than the person
// — it's the post that carries the authority, and the form has to still read
// correctly years later when someone else holds it.
//
// The position is captured onto the application at submission. Applications
// made before that carry none, so we fall back to whatever role the person
// holds now: slightly less accurate for historic rows, but far better than a
// bare name.

export interface LabelledApprover {
  email: string;
  name?: string;
  position?: string;
  external?: boolean;
}

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

/**
 * Does the name already say the post — "Bishop Samuel Lau (Bishop)"?
 *
 * Titles are part of how people are addressed here, so the directory holds
 * plenty of names that carry their office, and repeating it in brackets reads
 * as a stutter. Whole words only: a Dean must not be swallowed by a Deanna.
 */
function nameCarriesPost(name: string, post: string): boolean {
  const n = norm(name);
  const p = norm(post);
  if (!p) return false;
  // A character with a case is a letter; spaces and punctuation are not.
  const isLetter = (c?: string) => !!c && c.toLowerCase() !== c.toUpperCase();
  for (let i = n.indexOf(p); i >= 0; i = n.indexOf(p, i + 1)) {
    if (!isLetter(n[i - 1]) && !isLetter(n[i + p.length])) return true;
  }
  return false;
}

export function describeApprover(
  a: LabelledApprover,
  roleByEmail: Record<string, string> = {},
): string {
  const who = a.name?.trim() || a.email;
  const post =
    a.position
    || (a.external ? "Church Council President" : "")
    || (roleByEmail[norm(a.email)] ? roleLabel(roleByEmail[norm(a.email)]) : "");
  return post && !nameCarriesPost(who, post) ? `${who} (${post})` : who;
}

/**
 * One chain slot, as a phrase.
 *
 * A slot of one is that person. A slot several people share is settled by any
 * one of them — the General Manager's September 2026 rule for pastors — so it
 * reads as a choice. "The Bishop and the Dean and the Pastor in Charge"
 * describes three signatures where the rule asks for one, and it is the
 * wording most likely to make the person reading it leave the application for
 * somebody else.
 */
export function describeSlot(
  slot: LabelledApprover[],
  roleByEmail: Record<string, string> = {},
): string {
  return slot.map(a => describeApprover(a, roleByEmail)).join(" or ");
}

/** Slots as a phrase: alternatives joined with "or", separate slots with "and". */
export function describeSlots(
  slots: LabelledApprover[][],
  roleByEmail: Record<string, string> = {},
): string {
  return slots.map(s => describeSlot(s, roleByEmail)).join(" and ");
}

/** Join a list of approvers into "A (Role) and B (Role)". */
export function describeApprovers(
  list: LabelledApprover[],
  roleByEmail: Record<string, string> = {},
  joiner = " and ",
): string {
  return list.map(a => describeApprover(a, roleByEmail)).join(joiner);
}
