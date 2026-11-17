# Statement PDF recovery runbook

October 14, 2026. This is the operator procedure for Core 08 synthetic
verification and a later reviewed restore. It does not mark disaster
recovery complete.

## What this covers

- Inventory of expected statement metadata and checksums
- Synthetic probe and restore rehearsal against a designated test target
- Reviewed restore of a statement PDF reference after a verified backup copy
- Authorized staff/portal download checks after restore

## What this does not cover

- PostgreSQL backup or restore
- Real-tenant cutover
- Historical local-to-`s3v1:` migration (still dry-run only)
- Production bucket purchase, ACL, IAM, or lifecycle changes
- Proof that every object in a versioned bucket is permanently gone

Distinguish these outcomes: local/emulator rehearsal, live provider
copy/restore, provider version restoration, durable independent backup, and
full database-plus-PDF disaster recovery. A same-bucket copy is not an
independent durable backup.

## 1. Inventory expected metadata

```bash
npm run statements:storage-diagnostics
npm run statements:storage-inventory
```

Diagnostics print no secrets. Inventory is read-only and refuses `--apply`.
Preserve `pdfStorageKey`, `pdfChecksum`, organization id, and statement id
for each row you may restore. Do not treat inventory as a backup.

## 2. Designate an isolated test target

Required names only:

- `BITS_STATEMENT_S3_TEST_TARGET=1`
- `BITS_STATEMENT_S3_TEST_BUCKET` (dedicated test/e2e name, not
  `BITS_STATEMENT_S3_BUCKET`)
- `BITS_STATEMENT_S3_TEST_REGION` or `BITS_STATEMENT_S3_REGION`
- optional test endpoint / prefix / path-style / insecure-HTTP flags

### Owner handoff (November 4, 2026)

Core 21 inspected configuration by name only and ran the existing
read-only probe once. No writes were attempted. The result was
`mode=preflight`, `targetKind=unconfigured`, `executionKind=none`,
check `test-target` blocked, exit 2. That was configuration preflight,
not provider connectivity. `--apply` was not run. Core 27 does not
repeat that probe.

### Railway TEST bucket sheet (November 5, 2026)

Railway is the chosen host. The concrete resource for this rehearsal is
one new Railway Storage Bucket whose display name is
`bits-statements-test`, inside a TEST-only Railway project. It must stay
separate from any application statement bucket
(`BITS_STATEMENT_S3_BUCKET`) and from the TEST Postgres database in
`docs/original-v1-railway-test-setup.md`. Railway appends a hash to the
display name. Use the Credentials tab value `BUCKET` as the S3 API name.
Use `RAILWAY_BUCKET_NAME` only as the display name.

Official dashboard steps, from
[Storage Buckets](https://docs.railway.com/storage-buckets)
on November 5, 2026:

1. Open the Railway dashboard and a TEST-only project. This workspace
   has no Railway CLI, no `.railway` link, and no Railway token.
2. On the project canvas, click Create, select Bucket, choose a region,
   and set the name to `bits-statements-test`. The region cannot be
   changed after creation.
3. After the bucket deploys, open its Credentials tab. That tab shows
   whether the bucket uses virtual-hosted or path-style URLs.

Current buckets use virtual-hosted URLs. The documented endpoint shape
is `https://t3.storageapi.dev`, and the documented region value is
`auto` ([Storage Buckets](https://docs.railway.com/storage-buckets)).
The installed `@aws-sdk/client-s3` client sends `forcePathStyle` only
when `BITS_STATEMENT_S3_TEST_FORCE_PATH_STYLE=1`. Leave that unset for a
virtual-hosted bucket. Set it to `1` only when the Credentials tab says
the bucket requires path-style URLs. The endpoint must be HTTPS. Leave
`BITS_STATEMENT_S3_TEST_ALLOW_INSECURE_HTTP` unset.

The client does not read Railway's `BUCKET`, `ENDPOINT`, `REGION`,
`ACCESS_KEY_ID`, or `SECRET_ACCESS_KEY` names. Map them as follows.
Put only the seven `BITS_STATEMENT_S3_TEST_*` names in gitignored
`e2e/.local/storage-test.env`. `git check-ignore` matches that path
through `/e2e/.local/`. The file is absent. The probe loads those seven
names from the process environment first, then from that file. It does
not load the rest of the file.

| Railway Credentials value | App name | Where it belongs |
|---|---|---|
| Dedicated TEST bucket, not an application bucket | `BITS_STATEMENT_S3_TEST_TARGET=1` | `e2e/.local/storage-test.env` |
| `BUCKET` | `BITS_STATEMENT_S3_TEST_BUCKET` | `e2e/.local/storage-test.env` |
| `REGION` | `BITS_STATEMENT_S3_TEST_REGION` | `e2e/.local/storage-test.env` |
| `ENDPOINT` | `BITS_STATEMENT_S3_TEST_ENDPOINT` | `e2e/.local/storage-test.env` |
| Optional object prefix | `BITS_STATEMENT_S3_TEST_PREFIX` | `e2e/.local/storage-test.env` |
| Path-style only when the Credentials tab requires it | `BITS_STATEMENT_S3_TEST_FORCE_PATH_STYLE` | `e2e/.local/storage-test.env` |
| Leave unset for Railway HTTPS | `BITS_STATEMENT_S3_TEST_ALLOW_INSECURE_HTTP` | `e2e/.local/storage-test.env` |
| `ACCESS_KEY_ID` | `AWS_ACCESS_KEY_ID` | Shell for the probe process. Not part of the file allowlist |
| `SECRET_ACCESS_KEY` | `AWS_SECRET_ACCESS_KEY` | Shell for the probe process. Not part of the file allowlist |

Do not commit those values. Do not paste them into chat. Do not copy
`BITS_STATEMENT_S3_BUCKET` into the test file. `.env` has none of the
application bucket, region, endpoint, or AWS credential names.
`e2e/.local/acceptance.env` sets `BITS_STATEMENT_PDF_BACKEND` to `local`
and is not loaded by the probe.

Railway bills bucket storage at $0.015 per GB-month. Its docs say S3
API operations and bucket egress are free, and that buckets have no
object versioning, lifecycle rules, or automatic snapshots
([Storage Buckets](https://docs.railway.com/storage-buckets)). Creating
this bucket can incur storage charges. This workspace will not create it.

### Inspection (November 16, 2026)

Read-only. No bucket, project, deploy, credential file, or `--apply`
command was created or run. `docs/bits-design-spec.md` was not edited.

| Check | Result |
|---|---|
| Installed CLI | `@railway/cli` 5.71.0 via `node node_modules/@railway/cli/bin/railway.js`. `railway` is not on `PATH` |
| `whoami` / `status` | Logged in after `railway login` on November 16. Account name only; no token printed |
| Link | No project link. `.railway/railway.ts` still proposes empty project `bits-test` and environment `test`, with no bucket, and has not been applied |
| `e2e/.local/storage-test.env` | Absent |
| Seven `BITS_STATEMENT_S3_TEST_*` names, application bucket names, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Unset |
| `npm run statements:storage-probe` | Exit 2. `mode=preflight`, `targetKind=unconfigured`, `executionKind=none`. No secrets printed. This is not a provider rehearsal |
| `--apply` probe and restore | Not run |

Current official pages, read November 16, 2026:
[Storage Buckets](https://docs.railway.com/storage-buckets),
[Storage Buckets Billing](https://docs.railway.com/storage-buckets/billing),
and [railway bucket](https://docs.railway.com/cli/bucket).
Buckets are private. The display name is not the S3 API name; `BUCKET`
is the display name plus a hash. Current buckets use virtual-hosted
URLs. The documented endpoint example is `https://t3.storageapi.dev`
and the documented region example is `auto`. CLI bucket regions are
`sjc`, `iad`, `ams`, and `sin`, and the region cannot be changed after
creation. There is no object versioning, lifecycle configuration, or
automatic snapshot. Storage is $0.015 per GB-month. A fractional
GB-month total is rounded up to the next whole number. The billing page
states no minimum retention and no retrieval fee. S3 API operations and
bucket egress are free. `railway config apply` remains out of scope
because it would also create the app service and Postgres.

After the Hobby plan was active, project `bits-test`
(`bd76fc8a-0408-443d-a2d4-7dfd2fbdde9c`) was created. Railway also
created an empty default environment named `production`; it has no
services and no bucket. Environment `test`
(`6dfca267-20cf-419d-8c3a-1297737b1b86`) is the linked target. The
private bucket display name is `bits-statements-test`, id
`c1c5ecde-ee0c-407d-92f4-6d5cea0f054a`, region `iad`. Its S3 API name is
`bits-statements-test-hrqzaa`. Credentials report virtual-hosted URLs,
region `auto`, and endpoint host `t3.storageapi.dev`. Storage is 0 B
and the object count is 0. `stellar-abundance` and its Matrix service
were not changed. `railway config apply` was not run. Access keys were
not written to disk or chat. Gitignored `e2e/.local/storage-test.env`
holds only `BITS_STATEMENT_S3_TEST_TARGET`, `BUCKET`, `REGION`, and
`ENDPOINT`. Probe `--apply` and restore `--apply` passed on November 16 as
`live-provider` runs. See the command record below.

Those three setup steps are done. Do not create a second bucket, and
do not add this bucket to `stellar-abundance`.

### Live rehearsal (November 16, 2026)

Target: project `bits-test`, environment `test`, S3 API bucket
`bits-statements-test-hrqzaa`. Access keys stayed in the process
environment and were not printed. No real donor PDF, database write, or
application deploy.

| Command | Result |
|---|---|
| `npm run statements:storage-probe` | Exit 0. `mode=preflight`, `targetKind=designated-test`, `executionKind=live-provider`. No object I/O. Preflight is not the rehearsal |
| `npm run statements:storage-probe -- --apply` | Exit 0. `mode=probe`, `executionKind=live-provider`, run `a633b294-bfbe-41fd-b336-31c3bb27cf4d`. Conditional create, rejected overwrite, SHA-256 match without using ETag, wrong checksum rejected, unsigned request denied, owned key absent after delete |
| `npm run statements:storage-restore -- --apply` | Exit 0. `mode=restore`, `executionKind=live-provider`, run `203d5e3c-f8da-4179-943c-17d8d003884f`. Recovery copy read before source delete. Restored object matched SHA-256 and length, 60 bytes, on a fresh read. Owned keys absent |
| Bucket after both runs | `bits-statements-test`: 0 objects, 0 B. No failed-cleanup manifest |

Classification: live provider, not mock and not emulator. The restore
copy lived in the same bucket. It is not an independent durable backup,
scheduled retention, provider-loss recovery, or a PostgreSQL-plus-PDF
restore. Authorized staff and portal downloads of a real statement were
not exercised.

After that bucket exists, map credentials without pasting them into
chat or git. `npx railway bucket credentials` prints secrets; keep that
output out of logs and reports. The probe file allowlist is only the
seven `BITS_STATEMENT_S3_TEST_*` names. The S3 client uses the AWS SDK
default credential chain, so `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY` stay in the shell for that process and do not
belong in `e2e/.local/storage-test.env`. Use the hashed `BUCKET` value,
not the display name. Leave `BITS_STATEMENT_S3_TEST_FORCE_PATH_STYLE`
unset when the credentials say the URL style is virtual.

Synthetic writes stay a second approval after the hashed bucket name is
known. The approved operation would be only
`statements:storage-probe`, then `--apply`, then
`statements:storage-restore -- --apply`: run-owned synthetic PDFs and
backup copies, read/restore, and delete only that run's keys.

No suitable TEST bucket is configured. These commands are proposed and
were not run:

```bash
npm run statements:storage-probe
npm run statements:storage-probe -- --apply
npm run statements:storage-restore -- --apply
```

The first command is read-only after the target is configured. The two
`--apply` commands write and delete a synthetic object and wait for an
explicit owner authorization for that bucket. A successful probe is not
disaster recovery, independent backup retention, or launch acceptance.

Record `emulator` and `live-provider` separately. A later same-bucket
synthetic recovery still would not prove independent durable backups,
provider disaster recovery, version retention, or staff/portal
authorization.

Scripts load those TEST names from the process environment, then from
gitignored `e2e/.local/storage-test.env` if present. Process values win.
The overlay cannot change database URLs or Clerk keys. Do not put
application or Clerk secrets in that file.

```bash
npm run statements:storage-probe
```

The default command is read-only. It does not write objects.

## 3. Synthetic provider probe

```bash
npm run statements:storage-probe -- --apply
```

This writes a reserved non-donor key, proves conditional create, rejects
overwrite, verifies SHA-256 (never ETag), checks one unsigned object URL
with a deadline and bounded body, and verifies the exact key is absent
after delete. 401/403 is denial evidence. Redirects, DNS failures,
timeouts, and 404 are inconclusive. AccessDenied or timeout after delete
is unknown, not absence. Cleanup failure writes a run-owned exclusive
manifest under `e2e/.local/statement-probe-manifests/`. Do not delete a
failed manifest until the leftover key is confirmed absent.

## 4. Synthetic restore rehearsal

```bash
npm run statements:storage-restore -- --apply
```

This creates a recovery copy, verifies it independently, removes only the
synthetic source, restores from the separately fetched backup object (not
retained source bytes), and checks SHA-256 plus byte length on a fresh
read. Owned keys are cleaned up afterward; unknown cleanup retains the
run manifest. It is not a durable offsite backup.

## 5. Reviewed restore of a real statement PDF

Do this only with a reviewed plan and recovery credentials that are not the
application role:

1. Confirm the statement row still has the expected `pdfStorageKey` and
   `pdfChecksum`.
2. Confirm a verified backup copy of those exact bytes exists outside the
   failed object.
3. Restore to a new key, or to the original key only after inspect proves
   it is absent, using conditional create (`If-None-Match: *`).
4. Update the statement reference only with an optimistic predicate and an
   audit event. Retain the previous key.
5. Download through the authorized staff or portal route and confirm the
   checksum. Do not use an auth-bypass endpoint.

Legacy local files stay in place. Migration remains dry-run only.

## 6. Afterward

Record the command, date, execution kind (`mock`, `emulator`, or
`live-provider`), and each check status. A fake SDK sender is mocked
evidence, not emulator execution. Missing identities or an undesignated
bucket are blockers, not passes. Original version 1 remains incomplete
until live Clerk acceptance, a designated emulator or live-provider
restore, broader financial/staff workflows, and deployment checks exist.

## 7. Independent backup plan (proposal, November 17, 2026)

Nothing in this section was created or enabled. It does not repeat the
November 16 same-bucket rehearsal or the November 17 schema restore, and
it does not mark FR-STMT-004 complete. Northside stays retired.
Invitation acceptance stays deferred. Real church rows stay unchanged.

### Already implemented

Postgres.app `pg_dump` and `pg_restore` 18.7 can make a custom-format
archive. The November 17 restore proved that an empty `bits-test-db`
archive can be loaded into a separate local database. `age` and `gpg`
are not installed. The statement probe and restore commands write only
the designated TEST bucket. Railway point-in-time recovery is disabled,
and its archive would still be a Railway bucket. The backup-readiness
page records a staff log. It does not copy bytes.

### Proposed destination

One Cloudflare R2 Standard bucket, `bits-independent-backups`, in a
Cloudflare account that is not the Railway workspace. Prefixes:
`test/postgres/daily/`, `test/postgres/weekly/`,
`test/statements/objects/`, and `test/statements/manifests/`. No
production prefix. R2 is outside the Railway volume and bucket failure
boundary. Published Standard storage is $0.015 per GB-month after 10
GB-month, with egress free. The current TEST dump is 384,921 bytes, so
the published free allowance covers the expected TEST volume at $0.
Class A and Class B operations for one daily upload also stay inside
the published free monthly allowances. No Railway plan change.

### Proposed controls

| Control | Proposal |
|---|---|
| Credentials | A bucket-scoped R2 token, stored in the owner password manager and later as GitHub Actions secrets. It is not a Railway variable, not an application `AWS_*` key, and not an entry in `e2e/.local/storage-test.env`. The Railway read token used to dump TEST is a different secret. |
| Encryption | `age` encrypts each dump and PDF before upload. The private key stays in the password manager and one offline copy. It is not stored in Railway, GitHub, or R2. |
| Schedule | GitHub Actions at 11:15 UTC daily, after the owner approves the workflow. The job may read only `bits-test-db`. It must refuse working `bits`. |
| Retention | 14 daily Postgres archives and 8 weekly archives. Statement objects remain while the restored checksum is referenced, then 90 days. R2 lifecycle enforces that. Railway buckets have no lifecycle rules. |
| Notifications | GitHub failed-workflow email to the repository owner. No new paging service. |
| Restore | Download and decrypt with the offline key. Restore Postgres only into a new local database approved at that time. Never restore over TEST, working `bits`, `bits_e2e`, the Core 20 databases, or `bits_test_schema_recovery_2026111717161546d41ce7`. Match PDF bytes to the checksum. The first rehearsal uses the existing empty dump plus one new synthetic PDF, then deletes that synthetic object. |

### Owner actions before any resource or schedule

1. Confirm a Cloudflare account can open R2 without starting a paid plan.
2. Create only the bucket `bits-independent-backups`.
3. Create one token limited to that bucket and store it outside Railway.
4. Install `age`, generate a key, and keep the private key offline.
5. Turn on GitHub email for failed BITS workflows.
6. Approve the workflow in a later change. Do not enable it before the token, key, and email are ready.
7. Approve the synthetic rehearsal separately. It does not use real donor files.
