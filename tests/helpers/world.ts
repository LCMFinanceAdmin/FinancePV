/**
 * The stand-in world a route handler runs against.
 *
 * One mutable object the test sets up and then reads back: the rows the
 * "database" holds, who is signed in, and what would have been emailed.
 */
export interface Row { [k: string]: unknown }

export const world: {
  leave: Row | null;
  user: { email: string } | null;
  roles: Row[];
  mail: { to: string[]; type: string; subject: string }[];
} = { leave: null, user: null, roles: [], mail: [] };

export function reset() {
  world.leave = null;
  world.user = null;
  world.roles = [];
  world.mail = [];
}
