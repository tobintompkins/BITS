# Original v1 — Railway TEST-host setup (Core 17 / 17A)

October 23, 2026. Owner steps for a **separate TEST** Railway project.
Nothing in this file creates, links, or deploys a remote service. No
Railway account is assumed. Production remains a later explicit action.

A Railway TEST deploy still runs `NODE_ENV=production`. Production
guards still apply. Do not set `BITS_E2E_ACCEPTANCE=1` on this host.
The local original-v1 acceptance harness stays on loopback
`bits_e2e`. Do not point isolated SQL scripts at Railway by bypassing
their guards.

Manual CARD/ACH stay closed. Clerk Organizations setup stays deferred.
Do not copy working `bits` data to Railway.

## Why `/` is not the health check

`app/page.tsx` loads the primary organization, public prayer requests,
and a service alert, and wraps Clerk sign-in. It can return HTML after
caught database errors, but it is not a liveness probe and it is not
role/tenant acceptance.

`/visit` is an unsigned guest page with no database read. It may be
used later as an HTTP 200 smoke URL. It does not prove Postgres, Clerk,
or statement storage. A dedicated health route was **not** added.

`railway.json` therefore omits `healthcheckPath`. Do not add `/` as the
platform health check.

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
| Host builder | Railpack via `railway.json` (not Docker, not a second Nixpacks file) |
| Optional host env | `RAILPACK_NODE_VERSION=24` is a documented Railpack variable. It is **not** a `railway.json` field. Set it only in the host secret/env store if the owner wants an explicit override |
| Install / build / start | `npm ci` · `npm run build` (`prisma generate && next build`) · `npm start` (no migrate) |

`npm run build` now runs `prisma generate` then `next build`. Generate
reads the schema and does not migrate. Do not add migrate to start,
predeploy, or health checks. Remote Node selection is **not** verified.

## Owner steps (all require approval; none executed here)

1. Create a **new** Railway project named for TEST only. Do not reuse a
   production project.
2. Attach a **new empty** PostgreSQL plugin in that project. Do not
   restore working `bits` into it.
3. Connect the GitHub repository later, or deploy from a reviewed
   commit. This increment does not push.
4. Confirm Railpack is the builder (`railway.json`).
5. Set variable **names** from the table below in the Railway service.
   Paste values only in the host secret store.
6. Review pending Prisma migrations by filename and SQL. Apply
   `npm run db:migrate` only after an explicit owner approval and a
   backup of that empty TEST database. Not part of `npm start`.
7. First HTTP check: unsigned `/visit` is 200 and
   `/api/e2e/original-v1-target` is 404.
8. Signed-in acceptance still needs Clerk identities. Private PDFs still
   need a designated object store. Those remain blocked.

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
| `APP_BASE_URL` | The TEST public HTTPS origin |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Development `pk_test_` only until production is authorized |
| `CLERK_SECRET_KEY` | Development `sk_test_` only |
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
