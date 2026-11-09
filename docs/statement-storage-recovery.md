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
