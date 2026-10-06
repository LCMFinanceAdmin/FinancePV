# Scripts

## `verify-access.sql` — does the database refuse what it should refuse?

```bash
npm run verify:access
```

`npm test` checks the code. This checks the database, which the tests never
touch: the row-level security policies that decide who may write what.

It is not a reading of the policies. It attempts real writes as the
`authenticated` role — the only role RLS applies to — and reports what actually
happened. Everything runs inside a transaction that is rolled back, so nothing
it writes survives; the `_probe` rows it creates exist for a few milliseconds
and are never committed.

### Why it has to run the writes

A refused write does not look the same in both directions:

| | what a refusal looks like |
| --- | --- |
| `INSERT` | raises `insufficient_privilege` (42501) — loud |
| `UPDATE` / `DELETE` | matches no rows. No error. **Silent.** |

The second is the reason this file exists. `USING` filters rows; it does not
raise. A policy drawn one table too tight produces no log line and no error
response — just a person saying "I pressed save and nothing happened". So the
UPDATE probes compare the number of rows that moved against the number that
should have, and the counts are taken at the moment of the probe rather than
worked out in advance, because the INSERT probes add rows of their own.

### Why it cannot be run through `db query` alone

`supabase db query --linked` connects as `postgres`, which **bypasses RLS
entirely**. Every policy in the database looks permissive from that session.
Each probe therefore sets `request.jwt.claims` and `SET LOCAL ROLE
authenticated` before it writes, and resets the role afterwards.

### Reading the output

The first row is the tally — `ALL OK`, or the number of failures with the
offending probes listed below it.

`SKIP` means nobody currently holds that role, so there was no one to test as.
People are resolved by role, never by name or address, so a resignation turns a
probe into a skip rather than a failure, and the file does not need editing when
staff change.

### What it covers

| area | the rule being tested |
| --- | --- |
| `money` | Finance writes money records; a portfolio holder and a ministry desk do not |
| `registers` | the Administrator keeps the reference data; Finance and EXCO read it |
| `registers` | an EXCO member reaches the ministries they hold and no others — what lets them appoint their checker without opening the whole register |
| `budget` | a ministry writes its own budget papers |
| `worksheets` / `income` | the Building Manager raises worksheets and records facility income |
| `banking` | Finance and the General Manager; not the Administrator |
| `credentials` | nobody at all — PIN hashes and signatures are the service role's |
| `leave` | a Trustees employee at HQ is offered leave but no staff claims; a volunteer officer is offered neither |
| `records` | a signing officer reads the directory and writes none of it; the Administrator and the General Manager still keep it |

The `leave` area is the one that is not a policy. Leave is gated by a function,
and it fails the same quiet way a policy does: somebody not entitled is offered
no leave type at all, which on the page is an empty form rather than a refusal.
Two people are employed by the Trustees rather than by LCM and the General
Manager approves their leave regardless, so "LCM does not employ you" must not
be the question the leave form asks.

### After changing a policy

Run it. A migration that tightens access is exactly the change whose damage
shows up weeks later as a save that quietly did nothing.
