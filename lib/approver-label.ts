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
  name: string;
  position?: string;
  external?: boolean;
}

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

export function describeApprover(
  a: LabelledApprover,
  roleByEmail: Record<string, string> = {},
): string {
  const post =
    a.position
    || (a.external ? "Church Council President" : "")
    || (roleByEmail[norm(a.email)] ? roleLabel(roleByEmail[norm(a.email)]) : "");
  return post ? `${a.name} (${post})` : a.name;
}

/** Join a list of approvers into "A (Role) and B (Role)". */
export function describeApprovers(
  list: LabelledApprover[],
  roleByEmail: Record<string, string> = {},
  joiner = " and ",
): string {
  return list.map(a => describeApprover(a, roleByEmail)).join(joiner);
}
