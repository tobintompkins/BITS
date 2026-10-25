# Original v1 — Deployment-readiness review (Core 16)

October 23, 2026. Readiness review only. Nothing was deployed, purchased,
merged, or written to a working or remote database. The original
specification was read and not changed. Original version 1 is not
complete, and this document does not claim launch readiness.

Owner decisions already recorded and kept:

- Manual CARD/ACH stay rejected. External administrative CARD/ACH is
  deferred. See `docs/original-v1-payment-method-assessment.md`.
- Clerk organization/account setup remains deferred. See
  `docs/original-v1-live-acceptance-setup.md`.
- Statement-storage probe/restore remains blocked without a designated
  TEST target. See `docs/original-v1-storage-verification.md`.

## How to read statuses

| Status | Meaning |
|---|---|
| Ready locally | Evidence exists on this machine or in unit tests. Not production proof. |
| Unverified | Code or docs exist; runtime/provider evidence does not. |
| Blocked | A required owner or provider step is absent. Do not treat as a skip-pass. |

A set environment name is not a passed gate. Presence of `.env` was not
inspected for values. No secrets, emails, connection strings, or donor
inventories are recorded here.

## Original launch requirements

| Requirement | Exact original point | Evidence | Status |
|---|---|---|---|
| Railway app + Postgres | §2, §15.5, §21.1 | `railway.json` + `docs/original-v1-railway-test-setup.md`. No remote project is linked | Unverified / blocked — owner must create the TEST project |
| Separate test and production | §15.5, §21.1 | Isolated `bits_e2e` harness exists; no second Railway project is evidenced | Blocked for production |
| Durable private PDF storage | §15.5, §21.1, FR-STMT-004 | Local adapter + S3 config; production local writes fail closed unless explicitly allowed. Live TEST target unset | Blocked for production PDFs |
| Postgres and PDF backups before real donor data | §15.5, §21.3 | `/administration/backup-readiness` is an attestation log, not a backup. No restore rehearsal | Blocked |
| Documented Railway/production config | §18.4, Phase 1D | This review plus `docs/original-v1-launch-runbook.md` | Ready locally as documentation; remote config unverified |
| Two-org isolation and roles | §18.3–18.4, FR-ORG / FR-AUTH | Unit/isolated tests; live two-church Clerk run deferred | Blocked for launch acceptance |
| Staff/donor auth | §18.4 | Clerk middleware + server role checks; live identities deferred | Blocked for launch acceptance |
| Donor / household / offering-type / batch / reports / statements | §18.4 | Application paths exist; signed-in acceptance outstanding | Unverified live |
| Financial and authorization tests | §18.4, §15.4 | `npm test` and isolated suites exist; last full unit run was Core 15 | Ready locally (historical); not a release-candidate recertification |
| HTTPS in deployed environments | §15.1 | No deployed environment inspected | Unverified |
| No raw card/bank credentials | §15.1 | Manual form has no credential fields; Stripe is hosted checkout | Ready locally |
| Formal locked-ledger adjustments | FR-BATCH-006, future enhancements | Deferred; not a v1 launch blocker | Deferred |
| Phase 2 live/recurring/refunds | §1.2, FR-PAY-FUTURE | Not v1 blockers | Deferred |

## Runtime, install, build, and start

| Item | On disk | Status |
|---|---|---|
| Next.js / React | `next@16.2.10`, `react@19.2.4` | Ready locally |
| Prisma | `prisma@^7.8.0`, `@prisma/adapter-pg` | Ready locally |
| Lockfile | `package-lock.json` is tracked | Ready locally |
| `engines` / `.nvmrc` | `engines.node` `>=24 <25` (Core 17A). `.nvmrc` is `24`. Railpack official order puts engines above `.nvmrc`. Verified locally on Node v24.13.1. `@types/node` `^20` is types only | Ready locally; remote Railway unverified |
| Install | `npm ci` in an isolated `/tmp` copy of the current working tree | Recertified in Core 17A |
| Build / start | `npm run build` is `prisma generate && next build`. `npm start` does not migrate. Railway injects `PORT` | Isolated production-mode start recertified in Core 17A |
| Bind / health | No dedicated health route. `/` is not the probe. Isolated `GET /visit` returned **200**. `railway.json` still omits `healthcheckPath` | Local unsigned smoke only. Not DB or role acceptance |
| Host manifest | `railway.json` selects Railpack, `npm start`, restart on failure. Optional `RAILPACK_NODE_VERSION=24` is a host env name, not a `railway.json` field | Ready as config; no remote service linked |
| Clerk request boundary | Next 16 `proxy.ts` with the same `clerkMiddleware` and staff matchers. Deprecated `middleware.ts` caused production `next start` to HTTP-proxy `/visit` and the e2e probe to the same port (500) | Local smoke repaired; not a Clerk Organizations setup |

## Configuration and secret boundaries

Names only, from `.env.example` and feature loaders:

- Database: `DATABASE_URL`, optional `DIRECT_URL`
- Clerk: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, sign-in/up URLs, `APP_BASE_URL`
- Statement storage: `BITS_STATEMENT_PDF_BACKEND`, `BITS_STATEMENT_S3_*`, optional AWS keys. Never `NEXT_PUBLIC_*` for credentials
- Isolated TEST storage: `BITS_STATEMENT_S3_TEST_*` only, via process env or gitignored `e2e/.local/storage-test.env`
- Stripe test: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (live webhook events are ignored in code)
- Invitations: `BITS_STAFF_INVITATION_PROVIDER` defaults to `mock`; live send needs `clerk` + `BITS_STAFF_INVITATION_ALLOW_LIVE=1` + test Clerk secret + allowlisted emails
- First-admin tool: apply requires `--apply` and `BITS_STAFF_BOOTSTRAP_APPLY=1`
- Acceptance: `BITS_E2E_*` and Clerk org/email names in gitignored `e2e/.local/`

`.env*` is gitignored except `.env.example`. A local `.env` file exists and was not opened for values.

There is no single boot-time environment validator. Each subsystem fails closed (Prisma requires `DATABASE_URL`; statement S3 requires dedicated names; production local PDFs require an explicit override; Clerk live invitations require several flags). Missing remote Clerk or storage values are blockers, not passes.

## Tenant, roles, and test-only surfaces

- Protected staff/portal routes go through `proxy.ts` Clerk auth, then server role checks. Login does not auto-grant `ORG_ADMIN` even if `BITS_AUTO_PROVISION_ORG_ACCESS` is set. See `docs/original-v1-role-tenant-acceptance.md`.
- Concurrent role-revocation during an in-flight write is a known limitation, not serialized. Membership `version` exists for explicit staff edits. See `docs/original-v1-household-concurrency.md`.
- `/api/e2e/original-v1-target` returns 404 unless `BITS_E2E_ACCEPTANCE=1`, the runtime is not production, Clerk keys are not live, and a bearer token matches. Production must not set the acceptance flag. Guards were read, not activated.
- Isolated Prisma acquire refuses unit tests that point at working `bits`. See `docs/test-database-isolation.md`.
- `npm run db:seed`, `db:migrate`, and `*:local-migrate` / bootstrap scripts are operator tools. None were run.

## Migrations and rollback

Fifty-two Prisma migrations are on disk under `prisma/migrations/`, including later additive ledger-review, membership-version, and staff-invitation files. This inventory is file presence only.

- `npm run db:migrate` is `prisma migrate deploy`. **Proposed / not executed.**
- Local helper scripts (`staff:membership-local-migrate`, `ledger:review-local-migrate`, schema-setup variants) must never be pointed at production.
- A local schema is not proof a remote database is migrated.
- Reverting application code does not undo schema or data. PostgreSQL rollback needs a proven restore of a taken backup. No restore SQL is provided here.

## Persistent storage and backups

- New statement PDFs in production require `BITS_STATEMENT_PDF_BACKEND=s3` and a private bucket. Local files under the app working tree will not survive a typical Railway redeploy.
- Core 08/14 probe and restore are synthetic. Mocked sender tests are not emulator or live-provider proof. `--apply` was not run.
- `/administration/backup-readiness` copy states BITS does not create or verify backups from that page. Scopes are database, leadership documents, member documents, photographs, and other. Statement PDFs are not a dedicated scope.
- Existing archive listings and mocked restore tests are not successful restore rehearsals.

## Errors, logs, monitoring

- Invitation and storage-probe text redact emails, Clerk ids, and common secret patterns. This is not a full production logging policy.
- No monitoring or alerting service is configured. Do not purchase one in this review. Optional later enhancement, not a substitute for backups and Clerk/storage gates.

## Staff operations and accessibility

Increment docs exist for donors, households, offering types, ledger, reports, statements, invitations, and storage. There is no single staff handbook covering the weekly batch-to-statement path. Portal `/portal/help` and `/help/leadership` are in-app fragments, not launch documentation.

Accessibility of core workflows was not re-tested here. That remains an open Phase 1D check.

## Section 18.4 — missing checks, not assumed passes

1. Two organizations isolated — unit/isolated evidence only; live Clerk two-church run **blocked**.
2. Clerk staff/donor roles — harness present; live identities **blocked** (owner-deferred).
3. Donor / household / offering-type usable — code present; signed-in acceptance **unverified**.
4. Batch identified/anonymous entry — unit/isolated evidence; live **unverified**.
5. Reports and PDFs — code present; authorized live run **unverified**.
6. Durable PDF + access audit — adapter present; production object store and backup **blocked**.
7. Railway + production config documented — runbook written; remote Railway **unverified**.
8. Financial/authorization tests on a release candidate — last unit suite was Core 15; not recertified against a production build in this increment.

## Concrete defects / follow-ups (not repaired here)

| Finding | Path | Impact | Proposed later repair |
|---|---|---|---|
| No Railway/Nixpacks/Docker deploy manifest | repository root | Hosting is inferred, not declared | Add only after an owner-created Railway project exists |
| No `engines` / `.nvmrc` | `package.json` | Railway Node version is unspecified | Pin an LTS Node that Next 16 supports |
| No application health route | `app/api` | Platform health checks must use an existing URL | Prefer `/` or a later dedicated probe; do not add a second unused health surface now |
| `middleware.ts` deprecation | was `middleware.ts` | Next 16 production start proxied public routes to the same port (HTTP 500) | Core 17A moved the same `clerkMiddleware` to `proxy.ts` |
| Backup-readiness has no statement-PDF scope | `lib/validation/backup-readiness.ts` | Operators may omit PDF backup attestation | Add a scope only if the owner wants the log to track statement artifacts |

No silent rewrite of deploy infrastructure was made.

## Verification (October 23, 2026)

Docs-only increment. Isolated SQL was not used. A production build and live browser run were not executed and are not claimed.

| Check | Result |
|---|---|
| Read-only inventory | `package.json`, lockfile, `.env.example`, Prisma migration filenames, middleware, e2e target route, invitation/bootstrap guards, statement-storage config, backup-readiness copy |
| Deploy manifests | Absent: Railway, Dockerfile, Nixpacks, Procfile, `.nvmrc` |
| Environment values | Not printed. Process names checked without loading `.env` |
| `git diff --check` | Passed after the documentation change |
| `npm test` / lint / build | Not rerun |

## Core 17A local HTTP smoke (October 23, 2026)

Isolated `/tmp` copy, Node v24.13.1, existing Development Clerk keys in
the child only, no working `DATABASE_URL`:

| URL | Status |
|---|---|
| `GET /visit` | 200 |
| `GET /api/e2e/original-v1-target` (flag off) | 404 |
| Same path with flag + synthetic token | 404 |
| Unsigned `GET /batches` | 307 `/sign-in` |

This is public startup evidence only. It is not signed-in role/tenant
acceptance, not Railway, and not a launch certificate.

## Remaining ordered work

1. Owner: create separate Railway test and production projects, attach Postgres, set names from `.env.example` in the host (not in git). §21.1.
2. Owner: complete deferred Clerk Development identities, then live two-church acceptance. FR-AUTH, §18.4.
3. Owner: authorized live invitation send/accept against isolated `bits_e2e` only. See `docs/original-v1-staff-invitations.md`.
4. Owner: designate isolated `BITS_STATEMENT_S3_TEST_*`, run probe/restore `--apply`, then choose production private PDF storage and a backup/restore exercise. FR-STMT-004, §15.5.
5. Recertify `npm ci`, `npm run build`, `npm start`, lint, typecheck after build, and `npm test` on the intended Node version. §18.4.
6. Staff handbook and accessibility pass for the original batch/report/statement path. Phase 1D.

Live Clerk two-church acceptance, invitation send/accept, and provider backup/restore stay open launch gates. Formal locked-ledger adjustments and Phase 2 payments stay deferred and are not treated as v1 blockers.
