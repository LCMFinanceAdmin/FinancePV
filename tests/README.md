# Tests

```bash
npm test
```

Node's own runner, with its own type stripping. No test framework, no build
step, nothing added to `package.json`'s dependencies — the `.ts` files are run
as they are.

## What is covered

| file | what it holds |
| --- | --- |
| `leave-decision.test.ts` | when an application is granted: ordered steps, grouped slots, rejection, chains stored before steps existed |
| `leave-routing.test.ts` | who has to sign, for staff, pastors, Deans, the Bishop and an explicit assignment |
| `leave-action.test.ts` | the application walked end to end through the real route handler |
| `payroll-calc.test.ts` | what is owed: EPF across the RM5,000 threshold and the age brackets, SOCSO/SKBBK/EIS, an incomplete month |
| `pv-voucher.test.ts` | what the payment voucher says, and whose signature it asks for |
| `pv-checker.test.ts` | the checker's step on a voucher, through the real `ministry-action` edge function |
| `pv-submit-routing.test.ts` | where a new voucher goes the moment it is raised, through the real `submit-pv` edge function |
| `pv-finance-gm.test.ts` | Finance review, the gate to the signatories, and who may not sign |
| `pv-signatories-paid.test.ts` | how many officers must sign, when that is enough, the approval PIN, and marking a voucher paid |

The last of those runs `app/api/leave-action/route.ts` itself. Only the three
modules that reach outside the process are stood in for — the Next response
helper, the Supabase client and the mailer — so what is under test is the code
the site runs, not a description of it.

## Edge functions

Several files run Supabase edge functions, which are written for Deno. Three
things make that possible: `Deno.serve` is shimmed before the import so the
handler can be captured rather than served, the modules that reach outside the
process are swapped for stand-ins, and the import goes through a variable so
TypeScript does not pull Deno source into this directory's type graph — Deno
checks it, with its own config.

`_shared/supabase.ts` is deliberately **not** stubbed. It holds rules these
tests are about — who counts as the beneficiary of a voucher, how many
signatures an amount needs — and standing it in for would mean testing the
stand-in. Only its network import is replaced, so the real module loads and its
real logic runs.

## What these tests cannot see

The database. `npm test` runs against a stand-in, so a row-level security
policy drawn too tight passes here and fails in the browser. `scripts/`
holds a separate check that attempts real writes as the `authenticated` role
and reports what the database actually did:

```bash
npm run verify:access
```

See `scripts/README.md`. Run it after any migration that changes who may
write what.

## Real figures stay out

`payroll-calc.test.ts` uses invented salaries. The reconciliations against the
church's own AutoCount export — every employee's EPF, SOCSO and EIS checked
against the figures about to be paid — live outside this repository and stay
there. They are a stronger check than any invented case, and they carry real
salaries, IC numbers and bank details. Nothing derived from them belongs in a
file that goes to GitHub.

## How it works

`helpers/hooks.mjs` resolves the `@/…` alias against the repository root and
points those three modules at the stand-ins in `helpers/`. `helpers/world.ts`
is the mutable world a test sets up and reads back: the rows the database
holds, who is signed in, and what would have been emailed.

`tests/tsconfig.json` is separate because Node's type stripping requires
imports to carry the `.ts` extension and the app's config forbids it. The app's
`tsconfig.json` excludes this directory for the same reason, which also keeps
the tests out of the Next build.

## Writing another

The stand-in database only knows `leave_applications` and `user_roles`, and
only the query shapes those routes use. Reaching for anything else throws by
design — a route that grows a new call should fail loudly here rather than pass
against a silence.
