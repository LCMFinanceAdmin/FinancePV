# AGENTS.md — LCM Finance App

## Source of Truth
**GitHub (`master` branch) is the single source of truth.** All work must be committed and pushed before a session ends. Never leave changes only on disk.

## Agent Roles

| Agent | Role |
|-------|------|
| **Claude Code** | Primary architect and builder. Owns all major decisions on architecture, data model, and feature design. |
| **Codex** | Full secondary builder. May be used when Claude hits usage limits, or when help is needed with design, debugging, Supabase, app structure, or build issues. |

Both agents are authorised to work on:
- App structure, routing, and pages
- UI/UX design and shared components
- Supabase queries, RLS policies, and auth
- Edge functions (see deployment note below)
- SQL migration files when database changes are needed
- Debugging build and runtime errors

---

## Architecture Quick Reference

### Stack
- **Frontend:** Next.js 16.2.4 (App Router, Turbopack), React 19.2.4, TypeScript, Tailwind CSS
- **Backend:** Supabase (PostgreSQL + RLS + Edge Functions written in Deno/TypeScript)
- **Auth:** Supabase Auth (JWT). `proxy.ts` acts as the middleware (NOT `middleware.ts`). Add new public routes to its allow-list.
- **Deployment:** Vercel (Next.js frontend) + Supabase hosted project (DB + Edge Functions)

### Key directories
```
app/(app)/          — all authenticated app pages (one folder = one route)
components/         — shared UI components (ui/, pv/, layout/, worksheets/, etc.)
lib/                — types, helpers, Supabase client
supabase/
  functions/        — Deno Edge Functions (deployed via Supabase Dashboard)
  migrations/       — numbered SQL files (run manually in Supabase SQL Editor)
hooks/              — custom React hooks
public/             — static assets (logo, icons)
```

### Edge Functions
| Function | Purpose |
|----------|---------|
| `submit-pv` | Create a new PV; handles BAM/Finance/GM/General branches |
| `admin-action` | All PV state transitions (approve, reject, cancel, mark paid, hard-delete, etc.) |
| `signatory-action` | PIN-verified approval by Bishop / Treasurer / Secretary |
| `bam-action` | BAM Committee approve/reject |
| `ministry-action` | HOD-level budget approval |
| `pr-action` | Purchase Request approve/reject by GM/Signatories |
| `submit-pr` | Create a new Purchase Request |
| `set-pin` | Hashed PIN management for signatories |
| `subscribe-push` | Web push notification subscription |
| `payroll-reminder` | Payroll 18th-of-month reminder. **Not currently scheduled** — nothing invokes it and `cron.job` holds only `fd-maturity-check`. |
| `gm-claim-notify` | Notifies GM on new claim submissions |

**Shared helpers** live in `supabase/functions/_shared/` — `supabase.ts` (DB client, `nextPvNo()`, `nextBulkRunNo()`), `cors.ts`, `push.ts`.

### User roles

`FINANCE_ADMIN` · `FINANCE_ADMIN_2` · `FINANCE_ADMIN_3` · `ADMINISTRATOR` ·
`GENERAL_MANAGER` · `BISHOP` · `TREASURER` · `SECRETARY` · `MINISTRY_HEAD` ·
`BUILDING_MANAGER` · `BAM_COMMITTEE` · `STAFF`

Labels are data, not code — they live in the `app_roles` table and are edited at
Administration → Access & Roles → "Roles & what they mean". `FINANCE_ADMIN`
displays as **"Finance Executive"**, `MINISTRY_HEAD` as **"EXCO Member"**; the
keys never change, because RLS policies are written against them.

**See [`docs/roles.md`](docs/roles.md)** for the five layers a role touches and
what to edit for each — adding a role means changes in all of them, and skipping
any produces an account that looks privileged and is not.

### PV approval chains
- **General / Ministry PVs:** HOD Budget check → Finance Review → GM Review → Pending Signatory → Approved → Paid
- **BAM PVs (submitted by Finance Admin):** BAM_REVIEW → Finance Review → GM Review → Pending Signatory → Approved → Paid
- **BAM PVs (submitted via BEM worksheet):** BAM_COMMITTEE_REVIEW → Finance Review → GM Review → Pending Signatory → Approved → Paid
- **Payroll Bulk PVs:** Payroll Run → auto-created PVs → Finance Review → GM Review → Pending Signatory → Approved → Paid

### Numbering
PV numbers (`LCM/BAM/LSC/HLE-YYYY-XXX`) are derived from `MAX(pv_no)` in the `pvs` table — there is no separate sequence. Deleting all PVs auto-resets to `001`.

### BAM Worksheet → PV
When a BEM submits a PV from a worksheet, the edge function uses `worksheet_bem_signature_data` (not `finance_signature_data`) to detect the worksheet origin and correctly attribute the signature to the BEM slot, not the Finance Executive slot.

### Worker flat rates (BAM worksheets)
- `PA_PERSONNEL` → RM 200 / session
- `RELA_PERSONNEL` → RM 100 / session
- `BUILDING_CARE_TAKER` → hourly rate (editable)

---

## Workflow Rules

### Branching
- All non-trivial work happens on a feature branch, not directly on `master`.
- Branch naming: `feature/<short-description>` or `fix/<short-description>`.
- Merge to `master` only when the feature is complete and tested.

### Commits
- Write clear, descriptive commit messages (what changed and why).
- Commit frequently — do not batch unrelated changes into one commit.
- **Never force-push to `master`.** Never skip git hooks (`--no-verify`).

### Database / Supabase
- **Never make silent destructive database changes** (drop tables, remove columns, change column types without `IF EXISTS` guards).
- If a schema change is required:
  1. Create a SQL file in `supabase/migrations/` named `0NN_description.sql` (next sequential number).
  2. Explain what the migration does and why.
  3. Run it — either in the Supabase SQL Editor, or with
     `npx supabase db query --linked -f supabase/migrations/0NN_name.sql`.
     Use `db query`, **not `db push`**: migrations here are applied by hand, so
     the remote tracking table does not know about them and `push` would try to
     replay every one.
  4. Use `IF NOT EXISTS` / `IF EXISTS` / `DROP … IF EXISTS` guards so migrations are safe to re-run.
- Do not enable/disable RLS or modify existing policies without explaining the security impact.

### Edge Functions

Deploy with `npx supabase functions deploy <name>`. (An earlier note here said
the CLI was blocked by Windows Application Control — that is no longer the case;
it has been used throughout for both function deploys and migrations. The
Dashboard's in-browser editor still works if the CLI ever is blocked again.)

**Edge functions do not ship with a Vercel push.** A change to one is live only
after an explicit deploy, and a stale function is a recurring cause of
mysterious wrong behaviour.

Each function's "Verify JWT with legacy secret" toggle must remain **OFF** for
`admin-action` and `submit-pv`.

### Environment Variables
- Do not rename existing env vars without explicit approval.
- Document any new variable alongside the change that needs it.

### Vercel
- Do not change Vercel project settings, env vars in the Vercel dashboard, or deployment targets without approval.

### Next.js version note
This project runs **Next.js 16.2.4** — APIs, conventions, and file structure may differ from training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
