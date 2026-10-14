# Original v1 role and tenant acceptance

October 14, 2026. Core 07 added the fail-closed Playwright harness. Core 07A
reviews the single-church fallback and makes isolated live setup practical.
This does not finish original version 1.

Ordinary `npm run test:e2e` smoke tests may still skip without Clerk
credentials. `npm run test:e2e:acceptance` must not skip: missing
configuration, the wrong database, or the wrong server is a failure.

## Commands

1. Review the actual harness first. `npm run test:e2e:acceptance:preflight`
   is a redacted read-only diagnostic. It reports missing variable **names**,
   server mismatch, invalid Clerk development keys, an unavailable database,
   and missing identities. It never prints tokens, passwords, emails, or
   connection strings.
2. Create an isolated PostgreSQL database named `bits_e2e`. Do not use the
   working church `DATABASE_URL`. `npm run test:e2e:acceptance:setup -- --apply`
   creates that empty sibling database when the local server is reachable,
   applies existing migrations only to `bits_e2e`, and writes gitignored
   token/storage files. It never resets, copies, drops, or seeds `bits`.
3. Create two Clerk development organizations and seven fictional users.
   Use a development Clerk instance. Production secret keys are rejected.
4. Start a dedicated acceptance app without stopping an existing `next dev`
   on port 3000:

   ```bash
   npm run test:e2e:acceptance:server
   ```

   That child process sets `DATABASE_URL` to `BITS_E2E_DATABASE_URL` and
   `BITS_E2E_ACCEPTANCE=1`. It does not inherit the working church database.
   Shared PDF writes use `e2e/.local/statement-storage`.
5. Keep the Playwright process `DATABASE_URL` pointed at the working
   database so the fixture runner cannot fall back. Isolated settings load
   from `e2e/.local/acceptance.env` and win over `.env`; explicit shell
   exports still win over both.
6. Rerun preflight against the isolated server, then
   `npm run test:e2e:acceptance`.

The fixture runner talks only to `BITS_E2E_DATABASE_URL`. It never runs
`prisma/seed.ts`, never resets a database, and never deletes historic rows
outside owned `E2E07-{runId}-` records in the two configured churches.
Cleanup failures are thrown and do not erase unrelated data.

`GET /api/e2e/original-v1-target` is 404 unless `BITS_E2E_ACCEPTANCE=1` on
a non-production development/test runtime. A matching fingerprint proves
the running process uses the isolated database. The probe never mutates
data and never discloses the database URL.

Traces, screenshots, videos, storageState, `e2e/.auth/`, and `e2e/.local/`
are gitignored. Do not commit tokens, emails, or passwords.

## Clerk Development identities

Create these in the same development instance used by `sk_test_` /
`pk_test_`. Do not invent emails in configuration as if they already exist.
BITS fixture roles are assigned by `e2e/acceptance/fixtures/prepare.ts` and
are not Clerk dashboard roles.

| Env name | Church A | Church B | BITS fixture role |
|---|---|---|---|
| `E2E_CLERK_ORG_ADMIN_EMAIL` | member | — | `ORG_ADMIN` |
| `E2E_CLERK_TREASURER_EMAIL` | member | — | `TREASURER` |
| `E2E_CLERK_DATA_ENTRY_EMAIL` | member | — | `DATA_ENTRY` |
| `E2E_CLERK_REPORT_VIEWER_EMAIL` | member | — | `REPORT_VIEWER` |
| `E2E_CLERK_DONOR_A1_EMAIL` | member | — | `DONOR` (preferred household recipient) |
| `E2E_CLERK_DONOR_A2_EMAIL` | member | — | `DONOR` (same household) |
| `E2E_CLERK_MULTI_ORG_EMAIL` | member | member | `ORG_ADMIN` in both |

Set `E2E_CLERK_ORG_A_ID` and `E2E_CLERK_ORG_B_ID` to those two organizations.
Church B has no dedicated donor Clerk user; Southside gift data is fixture-only.

## Role and route matrix

| Role | Donors / offering types / giving households | Contribution and batch CSV | Statement-access CSV | Portal published PDFs |
|---|---|---|---|---|
| Signed out | Redirect to sign-in | 401 | 401 | 401 |
| ORG_ADMIN | View and mutate in the active church | Allowed; audited before delivery | Allowed | Staff generated PDFs in the active church |
| TREASURER | View and mutate | Allowed | Allowed | Staff generated PDFs |
| DATA_ENTRY | View and basic mutate; cannot change financial contacts or backdate | 403 | 403 | Not church-wide reports |
| REPORT_VIEWER | View; no donor create | Allowed | 403 | No statement-access export |
| DONOR | Staff giving routes denied | 403 | 403 | Own published individual PDF; household PDF only as preferred recipient |

CSV assertions check fixture amounts and names (`125.50`, `40.25` in church A;
`999.99` stays in church B), not merely HTTP 200.

## Evidence layers

- **Harness (implemented):** Playwright project `playwright.acceptance.config.ts`,
  Clerk `@clerk/testing` sign-in, isolated fixture prepare/cleanup, target
  fingerprint, preflight/setup helpers, focused unit tests for preflight
  guards and protected-operation denial.
- **Live authenticated two-tenant run:** blocked until Clerk identities exist
  and the isolated server handshake succeeds. Do not treat unit tests or
  ordinary smoke as that run.
- **Unit/integration (already present, reused):** ambiguous and missing
  membership denial in donor, offering-type, giving-household, and
  contribution-report service tests, plus Core 07A operation-level tests
  through batch directory, donor list/write, and the member portal.

## Access review (Core 07A)

`findPrimaryOrganization()` for signed-in callers uses the active Clerk
organization, then exactly one active membership. A lone active church is
not authorization. Signed-out public pages still use the oldest organization
for branding only.

The previous development auto-provision path called that fallback and
upserted `ORG_ADMIN`, which could grant financial access to a signed-in
nonmember, and could reactivate a revoked membership. Login no longer
creates or updates any BITS membership. A selected Clerk organization
without an authorized BITS role is denied financial access. Staff
invitation and role-assignment UI remain a separate gap.

Protected batch, donor, and portal operations were exercised with
`BITS_AUTO_PROVISION_ORG_ACCESS=true`. Nonmembers, missing accounts,
revoked memberships, unknown Clerk organizations, ambiguous memberships,
and ordinary selected-org Clerk members with no BITS row receive no
private rows, writes, or new memberships. Valid selected-org and
exactly-one authorized-membership controls still succeed. Staff/portal
PDF tenant selection is unchanged.

Acceptance cleanup deletes audit rows only when `entityId` is an owned
fixture entity for the current run prefix. Same-action export or donor
audits from another prefix in the same church are preserved.

Database-target equivalence compares host, port, and database name after
loopback and `host`/`port` query overrides, matching the installed `pg`
driver. `hostaddr` is ignored. Login username and password are ignored so
two roles on the same destination cannot bypass the working-database guard.

## Outstanding blockers

- Clerk development identities must be created before live acceptance can
  pass. Isolated-database setup may already be present locally.
- Staff invitation, role-change, and complete staff-management UI remain a
  separate original-core gap.
- Live object-store probe/restore, broader ledger acceptance, two-session
  household locking, and deployment readiness are unchanged.
- Original version 1 is not complete.

## Verification (October 14, 2026)

Worktree: HEAD `1fef2d0` plus uncommitted Core 02–07A and earlier local work.
No commit was created for this increment.

| Check | Result |
|---|---|
| Focused access/preflight/cleanup tests | Passed |
| `npx tsc --noEmit` | Passed |
| `npm run lint` | Passed |
| `git diff --check` | Passed |
| `npm run build` | Passed (existing middleware-to-proxy and member-document NFT warnings) |
| Full `npx vitest run` | 206 files / 1,534 tests passed |
| Isolated `bits_e2e` setup | Already present from earlier 07A setup. Working `bits` was not reset, copied, dropped, or seeded. |
| Isolated server handshake | Not rerun in this review-fix pass |
| `npm run test:e2e:acceptance` | Blocked: Clerk development organizations and seven fictional identities are not configured. |

A real authenticated two-tenant Playwright run did **not** occur. Original version 1 is not complete.
