# Original v1 — Launch runbook

October 23, 2026. Proposed operator procedure. **No command in this
file was executed for a deploy, migrate, seed, charge, email, or
restore.** Labels:

- **Verified locally (historical):** ran in an earlier increment on this
  tree; not a fresh Core 16 recertification.
- **Proposed / not executed:** safe to consider later; do not treat as
  done.
- **Blocked:** missing owner or provider configuration.

This is not a ready-to-launch certificate. Original version 1 remains
incomplete. See `docs/original-v1-deployment-readiness.md`.

## 1. Prerequisites (owner)

Blocked until the owner supplies them. Do not invent Clerk users,
Organizations, buckets, Railway services, or domains.

1. Separate Railway **test** and **production** projects, each with its
   own PostgreSQL service. §21.1.
2. Production HTTPS application URL and matching Clerk component URLs
   (`APP_BASE_URL`, sign-in/up, invitation redirect origin).
3. Clerk production (or remaining Development) organizations and the
   five original BITS roles. Live two-church acceptance is still
   owner-deferred.
4. Private S3-compatible statement bucket that is **not** the TEST
   bucket. `BITS_STATEMENT_S3_TEST_TARGET=1` never points at the app
   bucket.
5. Proven PostgreSQL backup and a restore that has actually been
   practiced on a non-production copy. Reverting git does not roll back
   schema or gifts.
6. Proven private-object backup/restore for statement PDFs.
7. Decision already recorded: v1 keeps manual CARD/ACH closed.

Do not paste secret values, emails, or connection strings into chat or
this file.

## 2. Local project commands

Working directory: the BITS repository. Use `npm ci` so the lockfile
pins versions.

| Step | Command | Label |
|---|---|---|
| Reproducible install | `npm ci` | Isolated `/tmp` copy in Core 17A |
| Unit tests | `npm test` | Verified locally (Core 17A): 225 files / 1,590 passed, 62 skipped |
| Isolated SQL | `npm run test:isolated` | Verified locally (historical Core 12A/11D). Never uses working `bits` |
| Isolated HTTP smoke | `npm run test:runtime-smoke` | Verified locally (Core 17A). See section 5 |
| Lint | `npm run lint` | Verified locally (Core 17A) |
| Schema file check | `npm run prisma:validate` | Verified locally (Core 17A). Not remote migrate status |
| Production build | `npm run build` | Verified locally (Core 17A) after generate |
| Typecheck after build | `npm run typecheck` | Verified locally (Core 17A) after the production build |
| Start | `npm start` (Next reads `PORT`) | Isolated production-mode start in Core 17A. Not Railway |
| Whitespace | `git diff --check` | Executed for this increment |

Do not run `npm run db:seed`, `npm run db:migrate`,
`*:local-migrate`, `staff:first-admin-bootstrap -- --apply`, or
`statements:storage-* -- --apply` as part of a casual start.

## 3. Migration review and backup gates

**Proposed / not executed.**

1. Take a PostgreSQL backup of the target database and store it outside
   the app container. Record the check on
   `/administration/backup-readiness` only after the backup exists.
   That page does not create backups.
2. Review pending Prisma migrations by filename and SQL. Do not apply
   from this runbook. Latest original-v1 additive migrations on disk
   include membership `version`, ledger `reviewVersion` / create
   idempotency, and staff invitations.
3. If migrate is later authorized: `npm run db:migrate` against the
   **target** `DATABASE_URL` only, after the backup is confirmed
   restorable. Do not attach migrate to application start, Railpack
   predeploy, or a health check.
4. If migrate or a release fails, follow section 6. Do not restore
   over the active database from this runbook.

Local schema-setup scripts are for isolated `bits_e2e` or an explicitly
chosen loopback working database. They are not production migrate.

Core 20, November 4, 2026, rehearsed a **local synthetic** logical backup
on loopback Postgres.app 18.6. Command:
`npm run recovery:local-database -- --host 127.0.0.1 --port 5432 --username <local role> --maintenance-database postgres`
and the same command with `--apply` only after the safety tests pass.
The apply created `bits_e2e_recovery_2026110502432060350d59_source` and
`bits_e2e_recovery_2026110502432060350d59_restored`, restored the dump,
and left both databases for review. It did not restore working `bits`,
replace a connection string, or prove production backup scheduling,
point-in-time recovery, or statement PDFs. See
`docs/original-v1-local-database-recovery.md`.

## 4. Test-to-production configuration

Copy names from `.env.example` into the host’s secret store. Process
values win over any local overlay.

| Concern | Test / isolated | Production |
|---|---|---|
| Database | Dedicated `bits_e2e` or Railway test DB. Never the working church DB | Separate Railway Postgres |
| Clerk | Development keys and fictional users | Production keys and real staff only after live acceptance |
| `BITS_E2E_ACCEPTANCE` | `1` only on the dedicated acceptance server | unset |
| Invitations | `BITS_STAFF_INVITATION_PROVIDER=mock` unless a fictional live allowlist is authorized | Keep mock until invitation send/accept is an explicit launch task |
| First admin | Dry-run default | Apply only with dual authorization; implementing the tool is not a grant |
| Statements | Local or isolated TEST bucket | `BITS_STATEMENT_PDF_BACKEND=s3` and a private app bucket |
| Stripe | Test keys; webhook ignores `livemode` | Phase 2. Not required to finish original v1 |
| Auto-provision | Ignored for privilege grants | Must stay non-granting |

## 5. Smoke checks after a future start

**Core 17A executed an isolated production-mode HTTP smoke on this
machine. That is not Railway and not signed-in launch acceptance.**

1. Unsigned `/visit` returned **200**. Public startup only.
2. Unsigned `/batches` returned **307** to `/sign-in`. Other staff
   routes were not re-hit in that run.
3. `/api/e2e/original-v1-target` returned **404** in production
   (flag-off, and flag-on + synthetic token).
4. Statement diagnostics print no secrets:
   `npm run statements:storage-diagnostics`. **Proposed / not executed
   this increment.**
5. Signed-in treasurer can open a draft batch and a report only after
   Clerk identities exist. **Blocked.**
6. PDF download uses the authorized staff or portal route, not a public
   URL. **Blocked** without a designated object store.

## 6. Failure and rollback decision points

| Symptom | Decision |
|---|---|
| Build or typecheck fails | Stop promotion. Keep the previous running revision. No database change. |
| Start fails before any migrate | Stop promotion. App-only rollback is enough. Do not restore data. |
| Migrate or write may have committed | Stop promotion. Preserve logs and the current database. List which migration files or gift writes actually applied. Do not invent Prisma history. |
| Schema still matches the previous app | App-only rollback is appropriate. Leave the database in place. |
| Schema moved and the previous app cannot read it | Prefer a reviewed forward repair (complete or revert the migration with a new migration). Restore is not automatic. |
| Data loss window is acceptable and a restore is explicitly reviewed | Restore the verified backup to a **new isolated** database only. Account for writes after the backup. Point a new service at that copy after review. Never overwrite the active database automatically. |
| Clerk live keys on the acceptance server | Stop. Acceptance runtime refuses live Clerk secrets. |
| App bucket used as `BITS_STATEMENT_S3_TEST_BUCKET` | Stop. Probe/restore must refuse it. |
| Local PDF backend in production | Writes fail closed unless `BITS_STATEMENT_ALLOW_LOCAL_PRODUCTION=1`, which is not a durable store. |

App rollback does not always need a data restore. A restore can discard newer gifts. This document does not authorize any restore.

## 7. Owner responsibilities that stay open

- Live Clerk two-church acceptance.
- Authorized invitation send/accept.
- Designated statement TEST target, then production object-store
  backup/restore.
- Railway TEST project from `docs/original-v1-railway-test-setup.md`, then a later production project.
- Live signed-in keyboard and screen-reader pass of original staff
  screens. Handbook and source accessibility review:
  `docs/original-v1-staff-handbook.md`,
  `docs/original-v1-accessibility-review.md`.
- Release-candidate recertification of install/build/test on the pinned
  Node version.

Formal locked-ledger adjustments and Phase 2 payments remain deferred
and are not launch blockers for original v1.
