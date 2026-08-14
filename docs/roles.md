# Maintaining roles

Roles live in five layers. Only one of them is editable from inside the app;
the other four are code, and this is the map of them.

The short version: **`app_roles` decides what a role is called. Code decides what
it can do.** Adding a row to `app_roles` creates a name that appears in every
picker and grants nothing.

---

## The five layers

| Layer | Where | Owns |
|---|---|---|
| 1. Display | `app_roles` table | Label, description, order, whether it can be assigned |
| 2. Profile flags | `lib/user-profile.ts` | `isFinanceAdmin`, `isSignatory`, … — the booleans pages read |
| 3. Navigation | `lib/nav.tsx` | Which pages a role can see |
| 4. Server rules | `supabase/functions/**` | What a role may do to a voucher |
| 5. Data rules | RLS policies + `can_*()` functions | What rows a role may read and write |

Layers 2–5 are the real permission system. Layer 1 is a label on top of it.

### 1. Display — editable in the app

`app_roles` (migration `126_app_roles.sql`). Administration → Access & Roles →
**Roles & what they mean**. Renaming is safe: `user_roles.role` stores the key,
never the label.

`is_system = true` marks roles the code knows about. A trigger refuses to delete
those, or any role somebody still holds. To take one out of use, untick
`assignable` — it leaves the pickers while its holders keep working.

`lib/utils.ts` still holds `ROLE_LABELS` as the fallback for the moment before
`app_roles` loads. Keep the two in step when adding a role.

### 2. Profile flags — `lib/user-profile.ts`

```ts
const signatoryRoles = ["BISHOP", "TREASURER", "SECRETARY", "GENERAL_MANAGER"];
isFinanceAdmin: ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(role),
```

`getUserProfile()` turns a role string into the booleans the whole app reads.
Add the flag here and to the `UserProfile` interface in `lib/types.ts`. Most
pages never mention a role name — they check a flag — so this is the layer that
keeps role names out of the page code.

### 3. Navigation — `lib/nav.tsx`

Every item has a `show:` predicate over `UserProfile`:

```ts
show: (u) => u.isFinanceAdmin || u.isMinistryHead || isAdmin(u),
```

Prefer the flags from layer 2 over naming roles here. The helpers at the top of
the file (`isAcct`, `financeNotAcct`, `isAdmin`, `isStaffMember`) exist so a rule
used in several places is written once.

Hiding a nav item is **not** access control — it only hides the link. The page
itself must refuse too, and layer 5 must refuse the data.

### 4. Server rules — `supabase/functions/**`

Each edge function checks the caller's role before acting. The heaviest are
`signatory-action` (48 role references), `admin-action` and `submit-pv` (29
each). Shared helpers live in `supabase/functions/_shared/`:

- `supabase.ts` — `getLOATier` / `signatoryPlan` decide **which offices must
  sign a voucher, by amount**. Change signing authority here.
- `verifiers.ts` — `mayVerifyFor()` decides who can verify a ministry's spending.

**Deploy after editing.** Edge functions do not ship with a Vercel push:

```bash
npx supabase functions deploy <name>
```

### 5. Data rules — RLS

This is the layer that actually stops anything, and it is in better shape than a
raw grep suggests. Of **239 policies, 7 name a role literally** — 59 call a
predicate function instead:

- `can_manage_people()` — the directory, offices, roles
- `can_manage_payroll()` / `can_oversee_payroll()`
- `can_manage_payment_refs()`
- `can_oversee_leave()`
- `is_finance_admin_or_senior()`
- `can_manage_ministry_verifiers()`

Of ~239 role strings in migrations, 97 sit inside these function bodies. **That
is where to change what a role may touch** — edit one function and every policy
calling it follows. Reach for a new policy only when no predicate fits.

A predicate used by a `{public}` policy must stay executable by `anon`, or
anonymous reads raise *permission denied* instead of returning nothing. See
`is_finance_admin_or_senior` and migration `116`.

---

## Adding a role that actually works

1. `app_roles` — insert the row (`is_system = true`).
2. `lib/utils.ts` — add to `ROLE_LABELS`.
3. `lib/user-profile.ts` — add or extend a flag; `lib/types.ts` for the field.
4. `lib/nav.tsx` — which pages it sees.
5. Edge functions — what it may do; deploy them.
6. RLS — extend the right `can_*()` function, or add a policy.
7. Check `getLOATier` / `signatoryPlan` if it signs vouchers.

Skipping 3–6 produces an account that looks privileged and is not.

## Changing what an existing role can do

Usually one edit to a `can_*()` function (layer 5), plus the matching edge
function check (layer 4) if it acts on vouchers. Grep the role name first —
`FINANCE_ADMIN_3` is a reminder of what half-adding looks like: it had a label
and full RLS permissions but was missing from the picker, so it could never be
assigned to anyone.

## Gotchas

- **The key is immutable.** `user_roles.role` and every policy store it. Rename
  the label instead.
- **Elections move roles.** A post with `grants_role` set reassigns it when a
  term is recorded — see `recordElection` in `app/(app)/settings/offices/page.tsx`.
  Setting a role by hand on someone who holds such a post makes the register and
  their access disagree; Access & Roles warns about this.
- **`MINISTRY_HEAD` needs a ministry.** The role alone gives an empty queue —
  `user_roles.ministries` decides which vouchers they verify.
- **Role changes take effect on next page load**, since `getUserProfile()` runs
  per request. No sign-out needed.
