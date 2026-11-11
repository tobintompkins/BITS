# Original v1 — Railway TEST-host setup (Core 17 / 17A)

October 23, 2026. Owner steps for a **separate TEST** Railway project.
Nothing in this file creates, links, or deploys a remote service. No
Railway account is assumed. Production remains a later explicit action.

A Railway TEST deploy still runs `NODE_ENV=production`. Production
guards still apply. Do not set `BITS_E2E_ACCEPTANCE=1` on this host.
The local original-v1 acceptance harness stays on loopback
`bits_e2e`. Do not point isolated SQL scripts at Railway by bypassing
their guards.

Manual CARD/ACH stay closed. Clerk Organizations setup stays unfinished.
Do not copy working `bits` data to Railway.

## Current host file (November 10, 2026)

Railway Config as Code is deprecated. A new service cannot use
`railway.json`. Existing files stop being read on December 1, 2026.
This repository now has one unapplied file, `.railway/railway.ts`.
Railway does not read that directory during a deploy. The CLI evaluates
it with `railway config plan` (read-only) and `railway config apply`
(creates billed resources). Neither command has been run. No project is
linked.

The file proposes project `bits-test`, environment `test`:

| Resource | Setting |
|---|---|
| App service `bits` | Build `npm run build`. Start `npm start`. Health check `GET /visit`. No source, so no deploy |
| Postgres `bits-test-db` | New empty database. `DATABASE_URL` is a reference to that database |
| Clerk keys | References to shared variables that must already exist on the `test` environment |
| `APP_BASE_URL` | Ignored by `variables.ignore` entry `bits/APP_BASE_URL`. The create does not send it. A later plan does not delete it |
| Migrations | Not in `npm start` and not a pre-deploy command |
| Storage bucket | Not included. Bucket creation stays a separate approval |

`railway` 3.16.0 typechecks the file. `@railway/cli` 5.71.0 is installed
and its evaluator loaded the file. `npm run railway:check` passed. A remote
plan has not been run.

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

Remote plan requires the Railway project and the `test` environment to
exist. The app service and database remain uncreated until a later
approved apply. Do not log in, link, or plan until that project and
environment are the intended target.

1. Run `railway login`.
2. Create project `bits-test`. Create an empty environment named `test`.
   Railway's default environment is named `production`; do not use it.
   Do not attach the working `bits` database.
3. In Shared Variables for environment `test`, set
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` from the
   existing development keys. Do not paste the values into chat or git.
4. From this repository, run `railway link` and select `bits-test` /
   `test`.
5. Run `npm run railway:shared-check`. It stops if either value is missing
   or empty, and it does not print the values.
6. Run `railway config plan`. Read it before any approval. Stop if it names
   another project, the `production` environment, a bucket, a migration, a
   repository source, or a variable value. The first plan can warn that
   `bits/APP_BASE_URL` matches nothing. That warning is expected until the
   service exists and the variable is set.
7. Approval to apply is separate. Apply would create the empty Postgres
   service `bits-test-db` and the app service `bits`. It would not copy
   church data, create a bucket, or deploy.
8. After the service exists, set its `APP_BASE_URL` to the generated
   `https` domain before connecting a repository or deploying. Later plans
   leave that variable alone because it is ignored.
9. Migration stays a separate approval: back up the still-empty TEST
   database, then run `npm run db:migrate` against that `DATABASE_URL`
   only. `prisma.config.ts` reads `DATABASE_URL`. It does not read
   `DIRECT_URL`.

## Why `/` is not the health check

`app/page.tsx` loads the primary organization, public prayer requests,
and a service alert, and wraps Clerk sign-in. It can return HTML after
caught database errors, but it is not a liveness probe and it is not
role/tenant acceptance.

`/visit` is an unsigned guest page with no database read. It may be
used later as an HTTP 200 smoke URL. It does not prove Postgres, Clerk,
or statement storage. A dedicated health route was **not** added.

The unapplied `.railway/railway.ts` sets the platform health check to
`/visit`. Do not change it to `/`. A 200 is process liveness only.

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
| Host builder | Railpack by default. No Dockerfile. `.railway/railway.ts` is the unapplied service definition |
| Optional host env | `RAILPACK_NODE_VERSION=24` is a documented Railpack variable. It is **not** a `railway.json` field. Set it only in the host secret/env store if the owner wants an explicit override |
| Install / build / start | `npm ci` · `npm run build` (`prisma generate && next build`) · `npm start` (no migrate) |

`npm run build` now runs `prisma generate` then `next build`. Generate
reads the schema and does not migrate. Do not add migrate to start,
predeploy, or health checks. Remote Node selection is **not** verified.

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

Proposed / not executed:

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

## What a successful TEST start is not

- Not live two-church Clerk acceptance
- Not invitation send/accept
- Not private PDF persistence or restore
- Not permission to copy working church data
- Not production Railway setup
