# Test database isolation (Core 11C / 11D)

Ordinary unit tests must not write to the working church database. Real SQL
runs only against a dedicated isolated database such as `bits_e2e`, from an
explicit command that fails closed when that target is missing or equivalent
to the working destination.

Core 11D adds the actual-connection guard: a marked child is not ready unless
the live `DATABASE_URL` used by clients equals the isolated destination and is
not the preserved working destination. This is verification hardening, not a
new ledger. Original v1 remains incomplete.

## Commands

| Command | Database | What it runs |
|---|---|---|
| `npm test` / `npm run test:unit` | None | Mocked/unit suites. Isolated-only files are excluded. Mixed files keep API-surface tests and skip their database describes. `lib/db/prisma.ts` is a lazy proxy and refuses to construct or reuse a real client unless the isolated runtime guard passes. |
| `npm run test:isolated` | `BITS_E2E_DATABASE_URL` only | Event/check-in database suites plus membership, invitation, and ledger concurrency. Child env is assigned before Vitest loads modules. Direct isolated-config runs fail instead of skipping when the runtime guard is not satisfied. |

`npm test` is safe without a database. `npm run test:isolated` must fail when
`BITS_E2E_DATABASE_URL` is missing, ambiguous, a working name (`bits`,
`postgres`), the same PostgreSQL destination as the working URL (including
username, localhost/127.0.0.1, and driver `host`/`port` query overrides), or
when required schema tables are absent. It never falls back to
`DATABASE_URL`.

Production Next.js runtime does not set `VITEST` or `BITS_ISOLATED_DATABASE`
and continues to use the normal working `DATABASE_URL`.

## Module and client ordering

`lib/db/prisma.ts` is a lazy proxy. In Vitest it validates the isolated
runtime on every access, including cached-client reuse. Construction uses the
classified isolated URL, not an unverified `DATABASE_URL`. A cached client
whose destination no longer matches is rejected rather than retargeted.
Production (no `VITEST`) still uses the normal working `DATABASE_URL`.

Parent preflight may read working `DATABASE_URL` before launch. Child runtime
requires `BITS_ISOLATED_DATABASE=1`, an explicit `BITS_WORKING_DATABASE_URL`,
a dedicated isolated `BITS_E2E_DATABASE_URL`, and a driver-resolved
`DATABASE_URL` equal to the isolated target and unequal to working. Isolated
tests therefore:

1. Load env files in `scripts/run-isolated-tests.ts` (dotenv does not override
   existing values).
2. Classify `BITS_E2E_DATABASE_URL` against the original working destination.
3. Snapshot working counts and content fingerprints, then spawn Vitest with
   `DATABASE_URL`/`BITS_E2E_DATABASE_URL` retargeted to the isolated URL,
   `BITS_WORKING_DATABASE_URL` holding the original working URL,
   `BITS_ISOLATED_DATABASE=1`, and `BITS_ISOLATED_REQUIRE_DB=1`.
4. Only then import Prisma or fixtures.

Direct invocation of an isolated-only file through the default Vitest config
collects no tests. Direct isolated-config invocation without a verified child
env fails before a client is created. Mixed files lazy-import Prisma inside
`describe.runIf(isolatedDatabaseRunEnabled())`. A truthy isolated flag with
`DATABASE_URL` still pointed at working `bits` is rejected.

Late dotenv reloads in an isolated child cannot retarget `DATABASE_URL`,
`BITS_E2E_DATABASE_URL`, or `BITS_WORKING_DATABASE_URL`. Core 07 acceptance
config prefers `BITS_WORKING_DATABASE_URL` so a retargeted `DATABASE_URL` is
not compared with itself.

## Identity guard

Isolation is the PostgreSQL database name plus destination equivalence, not an
`e2e` substring in a username or path. `bits_e2e` is accepted; `bits` and
`postgres` are not. Alias and query-override comparisons reuse the Core 07
helpers.

## Fixtures and cleanup

Attendance/check-in tests create unique per-run fictional churches, accounts,
members, and event graphs. They do not select the oldest organization or an
existing user. Cleanup deletes only owned events, attendance, QR, stations,
idempotency, audits, members, memberships, organizations, and users. Partial
setup failures clean up IDs already recorded. If cleanup itself fails, a
redacted id list is written to gitignored `e2e/.local/isolated-fixture-manifest.json`.
Tests do not `ALTER TABLE`, reset schemas, or seed the working church.

Concurrency suites construct clients from the classified isolated URL. The
isolated Vitest config sets `BITS_ISOLATED_REQUIRE_DB=1` so mistargeted
direct runs fail instead of reporting a skipped pass.

## Residual working data

Independent review found eight recent check-in audits on working `bits` from
legacy tests that previously used `DATABASE_URL`. Core 11C/11D do **not**
delete them. Action names and date windows are not ownership proof. Leave
cleanup pending explicit review. Do not erase genuine audit history to restore
a historical count.

Working snapshots now include deterministic content fingerprints of audit,
event, membership, donation, batch, household/contact, and household-membership
rows (ids, statuses, timestamps, contact foreign keys; no names or emails).
Count/total equality alone is not enough. This is not a complete database
backup or comparison.

## Remaining isolation limits

There is still no row written into the isolated database as a positive
target marker. Isolation is the dedicated name (`bits_e2e`), driver-resolved
destination inequality versus the preserved working URL, and the child flag.
The runner does not create that identity in an unknown database. Production
connection behavior is unchanged.

## Remaining blockers

Live Clerk two-tenant acceptance, invitation send/accept, object-store
probe/restore, and launch gates remain open. Isolated giving-household
concurrency is verified on `bits_e2e`; live signed-in household forms are not.
Isolated SQL success is not original v1 completion.
