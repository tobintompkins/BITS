# Original v1 — Railway TEST-host setup (Core 17 / 17A)

October 23, 2026. Owner steps for a **separate TEST** Railway project.
The November 16 current-host section records the resources and deploy
that were later approved. Production remains a later explicit action.

A Railway TEST deploy still runs `NODE_ENV=production`. Production
guards still apply. Do not set `BITS_E2E_ACCEPTANCE=1` on this host.
The local original-v1 acceptance harness stays on loopback
`bits_e2e`. Do not point isolated SQL scripts at Railway by bypassing
their guards.

Manual CARD/ACH stay closed. Clerk Organizations setup stays unfinished.
Do not copy working `bits` data to Railway.

## Current host file (November 16, 2026)

Railway Config as Code is deprecated. A new service cannot use
`railway.json`. Existing files stop being read on December 1, 2026.
This repository has `.railway/railway.ts`. Railway does not read that
directory during a deploy. The CLI evaluates it with `railway config plan`
and `railway config apply`. The named partial `bits-app` was applied on
November 16.

The linked target is project `bits-test`
(`bd76fc8a-0408-443d-a2d4-7dfd2fbdde9c`), environment `test`
(`6dfca267-20cf-419d-8c3a-1297737b1b86`). No service is linked.
`stellar-abundance` and Matrix were not changed. The project's empty
default environment `production` (`90f4b704-97ab-4b10-981c-ddba70aaf0bf`)
has no service and no bucket. Do not use it.

Environment `test` has app service `bits`
(`86ec2fbf-3c85-44f7-99d7-94a96039feba`) and Postgres `bits-test-db`
(`0d062a65-540b-419e-a6b6-98773ef9991c`). On November 16,
`npm run db:migrate` applied all 52 checked-in migrations to that
database. Public church tables were present and contained 0 rows. No seed
ran. The app `DATABASE_URL` is that same private `railway` database.
Private bucket
`bits-statements-test`
(`c1c5ecde-ee0c-407d-92f4-6d5cea0f054a`), region `iad`, still has 0
objects and is not the application PDF backend. The two Clerk development
names are shared variables on `test` only. Their values were not printed.
The `production` environment still has no services and no buckets.

A whole-project plan showed a delete of `bits-statements-test`. The
file exports `partial = "bits-app"`, and the applied plan created only
the service and database. That partial now owns `service.bits` and
`database.bits-test-db`. It does not own the bucket. `APP_BASE_URL` is
set on the service and remains in `variables.ignore`. A new plan was not
run after the deploy.

The public domain is `https://bits-test.up.railway.app`, and
`APP_BASE_URL` is that exact URL. Invitations stay `mock`.
`BITS_E2E_ACCEPTANCE` is unset. Deployment
`7953e76b-25fe-41dd-b42e-34fcb3cf2747` is SUCCESS. Build command
`npm run build`, start `npm start`, health check `/visit`, no pre-deploy
command. Railpack installed Node 24.22.2. The source is HEAD `8621a9d`
plus the uncommitted working tree. The first upload,
`9500e617-dd8e-4010-ab0c-61e30fe745c3`, failed during `next build` because
`.railwayignore` used an unanchored `storage/` pattern and also excluded
`lib/storage`. The file is now root-anchored, and the second upload
succeeded.

Unsigned checks on that URL: `GET /visit` 200 and the page contained
Plan Your Visit, Service Times, Sunday Morning Worship, and
110 Old Orchard Rd. `GET /batches`, `/dashboard`, `/donors`, `/portal`,
and `/portal/gifts` returned 307 to `/sign-in`. `GET /sign-in` returned
200. `GET /api/e2e/original-v1-target` returned 404 with no fingerprint.
No signed-in TEST session was run. Working `bits` stayed at 3
organizations, 3 memberships, 4 donations, `187.00`, 0 batches, and 338
audits. `stellar-abundance` `updatedAt` stayed
`2026-10-16T16:34:52.400Z`.

The file proposes project `bits-test`, environment `test`:

| Resource | Setting |
|---|---|
| App service `bits` | Build `npm run build`. Start `npm start`. Health check `GET /visit`. Deployed November 16 by `railway up`; this graph still has no repository source |
| Postgres `bits-test-db` | New empty database. `DATABASE_URL` is a reference to that database |
| Clerk keys | References to shared variables that must already exist on the `test` environment |
| `APP_BASE_URL` | Ignored by `variables.ignore` entry `bits/APP_BASE_URL`. The create does not send it. A later plan does not delete it |
| Migrations | Not in `npm start` and not a pre-deploy command |
| Storage bucket | Not included. Bucket creation stays a separate approval |

`railway` 3.16.0 typechecks the file. `@railway/cli` 5.71.0 is installed
and its evaluator loaded the file. `npm run railway:check` passed before
the shared-variable receipt existed. The November 16 apply used that
receipt and created only the two resources above.

The installed Next.js 16.2.10 `next start` command reads `PORT` and
listens on `0.0.0.0`. The start command does not need an added
`--port $PORT`. Do not add `-H 127.0.0.1`: a local production start
bound only to that address returned 500 because the Next proxy could
not reach itself. The default bind returned 200 for `/visit`. `RAILPACK_NODE_VERSION=24` is a non-secret service
variable in the file. Restart-on-failure was in the old file and is not
a field in the current Infrastructure as Code reference, so it was not
copied into an invented field.

### Setup sequence

Local validation does not create a Railway project. It is already done:

1. `npx tsc -p .railway --noEmit`
2. `npm run railway:check`

That check uses Railway CLI 5.71.0 to load `.railway/railway.ts`. It
confirms `APP_BASE_URL` is ignored, no migration command is present, and a
plan stops until `npm run railway:shared-check` has verified the Clerk
shared values.

The project, `test` environment, app service, and database now exist.
Do not create a second project, service, database, or bucket, and do
not use environment `production`.

1. `railway login` is already complete for this machine.
2. Project `bits-test` and environment `test` already exist. The default
   environment `production` is empty. Do not attach the working `bits`
   database.
3. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are shared
   variables on environment `test`. They are the local development keys.
   The values were not printed. Do not paste them into chat or git.
4. This repository is already linked to `bits-test` / `test`.
5. Run `npm run railway:shared-check`. It stops if either value is missing
   or empty, and it does not print the values.
6. Run `railway config plan`. Read it before any approval. Stop if it names
   another project, the `production` environment, a bucket delete, a
   migration, a repository source, or a variable value. The November 16
   named-partial plan was the two creates only. The first plan can warn
   that `bits/APP_BASE_URL` matches nothing. That warning is expected until
   the service exists and the variable is set.
7. The approved apply created empty Postgres `bits-test-db` and app
   service `bits`. It did not copy church data, create a bucket, migrate,
   or deploy the app.
8. The generated domain is `https://bits-test.up.railway.app`.
   `APP_BASE_URL` was set to that URL with deploys skipped. Later plans
   leave that variable alone because it is ignored.
9. Migration was approved and applied on November 16. Railway volume
   backups are limited to Pro, so the recoverable archive is the
   gitignored custom dump
   `e2e/.local/backups/bits-test-db-pre-migration-2026-11-16.dump`
   (875 bytes, SHA-256
   `bfe2694b0191f1a2447f47e29502eb06d573fe91e5049e4b6185ed89b2a273ef`).
   That file was listed, not restored. `npm run db:migrate` then applied
   52 migrations. `prisma.config.ts` reads `DATABASE_URL` and does not
   read `DIRECT_URL`.
10. The approved app deploy used `railway up` against service `bits` in
    `bits-test` / `test` only. It did not seed, copy church data, or set
    statement-storage variables. The successful deployment is
    `7953e76b-25fe-41dd-b42e-34fcb3cf2747`.

## Why `/` is not the health check

`app/page.tsx` loads the primary organization, public prayer requests,
and a service alert, and wraps Clerk sign-in. It can return HTML after
caught database errors, but it is not a liveness probe and it is not
role/tenant acceptance.

`/visit` is an unsigned guest page with no database read. It may be
used later as an HTTP 200 smoke URL. It does not prove Postgres, Clerk,
or statement storage. A dedicated health route was **not** added.

The deployed service sets the platform health check to `/visit`. Do not
change it to `/`. A 200 is process liveness only. The November 16 page
also rendered the static visit copy. It does not prove a public church
record, because the TEST database has no church rows.

## Runtime pin

Official Railpack Node order
([railpack.com/languages/node](https://railpack.com/languages/node/)):
`RAILPACK_NODE_VERSION` → `devEngines.runtime` → `package.json`
`engines.node` → `.nvmrc` → `.node-version` → mise → default LTS.
`engines.node` beats `.nvmrc`. That is inferred from official docs, not
from a remote Railway build.

| Item | Value |
|---|---|
| App engines pin | `engines.node` `>=24 <25` (aligned with `.nvmrc` `24` so Railpack does not collapse a `>=20.9.0` range to Node 20) |
| Dependency minima | Next 16.2.10 and Clerk 7.5.12 require `>=20.9.0`. Prisma client engines are `^20.19` or `^22.12` or `>=24.0` |
| npm | `engines.npm` `>=10`. Verified locally with npm 11.8.0. Separate from the Node pin |
| Requested LTS line | Node 24 |
| Verified on this machine | Node v24.13.1 / npm 11.8.0 |
| Host builder | Railpack. No Dockerfile. The November 16 build installed Node 24.22.2 |
| Optional host env | `RAILPACK_NODE_VERSION=24` is a documented Railpack variable. It is **not** a `railway.json` field. Set it only in the host secret/env store if the owner wants an explicit override |
| Install / build / start | `npm ci` · `npm run build` (`prisma generate && next build`) · `npm start` (no migrate) |

`npm run build` now runs `prisma generate` then `next build`. Generate
reads the schema and does not migrate. Do not add migrate to start,
predeploy, or health checks. The November 16 Railpack build installed
Node 24.22.2 and compiled with `npm run build`.

## After the remote plan

Use the setup sequence above. These checks stay separate from it:

- First HTTP check after a deploy: unsigned `/visit` is 200 and
  `/api/e2e/original-v1-target` is 404.
- Leave statement storage unset. The `bits-statements-test` bucket is a
  separate approval at the published $0.015/GB-month storage price.
  Railway buckets do not version or snapshot objects. The setup sheet
  remains `docs/statement-storage-recovery.md`. Signed-in acceptance
  stays blocked until Clerk Organizations are enabled.

Costs that need owner approval: Railway project, Postgres plugin,
outbound egress, any object-storage bucket, custom domain, and paid
Clerk/Stripe plan changes. This patch does not purchase any of them.

## Safe variable names and TEST defaults

Set values in Railway. Do not commit them.

| Name | TEST default / rule |
|---|---|
| `DATABASE_URL` | Railway TEST Postgres URL only |
| `DIRECT_URL` | Same TEST database if a pooler is used |
| `NODE_ENV` | Railway sets `production` |
| `PORT` | Railway injects this; `next start` reads it |
| `APP_BASE_URL` | Set on service `bits` after its public domain exists. `bits/APP_BASE_URL` is ignored, so later plans do not delete or overwrite it |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Shared variable on environment `test`, development `pk_test_` only |
| `CLERK_SECRET_KEY` | Shared variable on environment `test`, development `sk_test_` only |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
| `BITS_STATEMENT_PDF_BACKEND` | `local` only if the owner accepts ephemeral disks; otherwise leave unconfigured until a TEST bucket exists |
| `BITS_STATEMENT_ALLOW_LOCAL_PRODUCTION` | unset unless the owner explicitly accepts lost PDFs on redeploy |
| `BITS_STATEMENT_S3_TEST_TARGET` | unset on this host. Probe/restore stay on the local designated TEST target |
| `BITS_E2E_ACCEPTANCE` | **unset** |
| `BITS_E2E_TARGET_TOKEN` | unset |
| `BITS_STAFF_INVITATION_PROVIDER` | `mock` |
| `BITS_STAFF_INVITATION_ALLOW_LIVE` | unset |
| `BITS_STAFF_BOOTSTRAP_APPLY` | unset |
| `STRIPE_SECRET_KEY` | unset or `sk_test_` only. Live webhook events are ignored in code |

Never set live Clerk secrets on the local acceptance server. Never set
`BITS_E2E_ACCEPTANCE` on Railway TEST.

## Migration review gate

Executed on November 16 against `bits-test-db` only. Railway volume
backup was unavailable on Hobby, so the recoverable archive is the
gitignored logical dump named in step 9. That dump was listed, not
restored. The gate below is the procedure that was followed:

1. Inventory `prisma/migrations` on the revision being deployed.
2. Confirm the TEST database is empty or already at the expected
   history. Do not fabricate `_prisma_migrations` rows.
3. Take a Railway/Postgres backup of the TEST database.
4. Owner approves `npm run db:migrate` against that TEST URL only.
5. If migrate fails, follow `docs/original-v1-launch-runbook.md`
   section 6. Restore only to a new isolated TEST copy under a reviewed
   plan.

## Verification (October 23, 2026 — Core 17A)

Isolated copy of the current working tree under `/tmp` (Core 17
mechanism). Excluded `.env*`, `e2e/.local`, `.git`, `node_modules`,
`.next`, and root `/storage/` only. Existing local Development
`pk_test_` / `sk_test_` keys were loaded in-process and passed to the
child env only. Values were not printed.

| Check | Result |
|---|---|
| Isolated `npm ci` | Passed on Node v24.13.1 |
| Isolated generate + build | Passed. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` present at build. Dummy unused generate URL only |
| Isolated `next start` | Ready on `127.0.0.1:3021`, `NODE_ENV=production` |
| `GET /visit` | **200** |
| `GET /api/e2e/original-v1-target` flag-off | **404**, body `Not found`, no fingerprint |
| Same path flag-on + synthetic token | **404** (`NODE_ENV=production` guard). No fingerprint |
| Unsigned `GET /batches` | **307** to `/sign-in` |
| Core 17 keyless 500 | Reproduced earlier. Not a pass. Clerk keys plus Next 16 `proxy.ts` (same `clerkMiddleware`) were required for HTTP 200/404 |
| Working-tree unit/lint/build/typecheck | 225 files / 1,590 passed, 62 skipped. Typecheck after build |
| Remote Railway | Not created. Not a launch |

## Remote TEST smoke (November 16, 2026)

Checked against `https://bits-test.up.railway.app` after deployment
`7953e76b-25fe-41dd-b42e-34fcb3cf2747`:

| Check | Result |
|---|---|
| `GET /visit` | 200. Static visit copy rendered |
| Unsigned `/batches`, `/dashboard`, `/donors`, `/portal`, `/portal/gifts` | 307 to `/sign-in` |
| `GET /sign-in` | 200. No account was used |
| `GET /api/e2e/original-v1-target` | 404, no fingerprint |
| Signed-in staff or portal | Not run |

## TEST schema backup — inspection and proposal (November 16, 2026)

### Actual inspection, before the restore

Read-only inspection of `bits-test-db`
(`0d062a65-540b-419e-a6b6-98773ef9991c`) through a temporary SSH tunnel.
The tunnel was closed and its credential file was removed. No dump was
written and no restore database was created.

| Item | Result |
|---|---|
| Server | Postgres 18.6 (Debian 18.6-1.pgdg13+2) |
| Database | `railway` |
| Data directory | `/var/lib/postgresql/data/pgdata` |
| Migrations | 52 finished, 0 unfinished, 0 rolled back. Names match `prisma/migrations`. SHA-256 of the sorted names `dc676b85734b59076d5fe6bb2fce265efdfd92ae40d89bb435083f871cf2caef` |
| Public tables | 75 |
| Church and role rows | organizations, memberships, donors, donations, batches, audits, invitations, and role types are all 0 |
| Recovery indexes | `household_memberships_one_open_per_donor` and `ledger_create_idempotency_org_action_token_key` are present |
| Railway PITR | `enabled: false`, `bucketWired: false`. PITR was not enabled |
| Local cluster | Postgres.app 18.7 is accepting connections on `127.0.0.1:5432`. Its data directory is under the local Library path, separate from the TEST volume |
| Preserved databases | `bits`, `bits_e2e`, `bits_e2e_recovery_2026110502432060350d59_source`, and `bits_e2e_recovery_2026110502432060350d59_restored` |
| Working `bits` | 3 organizations, 3 memberships, 4 donations, `187.00`, 0 batches, 338 audits |

`npm run recovery:local-database -- --apply` was not run. That command
creates fictional churches and can dump only a `bits_e2e_recovery_*`
database. Core 20 remains the synthetic rehearsal in
`docs/original-v1-local-database-recovery.md`.

### Proposed, then declined

The proposed action was one fresh custom-format `pg_dump` of TEST with
Postgres.app `pg_dump` 18.7, using `--no-owner` and `--no-acl`, and a
restore with `--exit-on-error` and `--single-transaction` and without
`--clean` or `--create`.

The November 16 database
`bits_test_schema_recovery_202611162129099f88a8e0` was not approved. That
name was not created.

### Executed November 17, 2026

This is empty-database schema recovery. TEST had no church rows, so the
restore does not prove recovery of real church records.

| Item | Result |
|---|---|
| Source | `bits-test-db` `0d062a65-540b-419e-a6b6-98773ef9991c`, database `railway`, data directory `/var/lib/postgresql/data/pgdata` |
| Dump | `e2e/.local/database-recovery/2026111717161546d41ce7/bits-test-db.dump`, 384,921 bytes, SHA-256 `9429863446c929ef21d5151c916ed85cfe7cc1a2f8fa3fecdd75749e4fa9e50f` |
| Restore target | New local database `bits_test_schema_recovery_2026111717161546d41ce7` on Postgres.app 18.7, `127.0.0.1:5432`, local Library data directory |
| Restore | `pg_restore --no-owner --no-acl --exit-on-error --single-transaction`. The first attempt rolled back because the custom archive named role `postgres`, which Postgres.app does not have |
| Schema | Match. 52 finished migration names and file checksums, 75 public tables, both recovery indexes, and the six checked foreign keys |
| Rows | organizations, memberships, donors, donations, batches, audits, invitations, and role types are 0 on both sides |
| Left unchanged | TEST, working `bits` (3/3/4/`187.00`/0/338), `bits_e2e`, both Core 20 databases, deployment `7953e76b-25fe-41dd-b42e-34fcb3cf2747`, and bucket `bits-statements-test` at 0 objects |

The dump is one gitignored file on this Mac. PITR remains `enabled: false`
and `bucketWired: false`. No schedule, second copy, or point-in-time
recovery was created.

## What a successful TEST start is not

- Not live two-church Clerk acceptance
- Not invitation send/accept
- Not private PDF persistence or restore
- Not permission to copy working church data
- Not production Railway setup
