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

## 7. Independent backup plan (proposal, revised November 17, 2026)

Nothing in this section was created or enabled. It does not repeat the
November 16 same-bucket rehearsal or the November 17 schema restore, and
it does not mark FR-STMT-004 complete. Northside stays retired.
Invitation acceptance stays deferred. Real church rows stay unchanged.

### What GitHub covers

The public repository `tobintompkins/BITS` was read on November 17.
`main` matches `origin/main`. The default branch has no `.github`
directory, the Actions API reports 0 workflows and 0 runs, and there
are 0 releases. Tracked paths do not include dumps, private keys, or
`.env`. `.env.example` contains placeholders. Local dumps under
`e2e/.local/` are gitignored. A Git push therefore stores source and
history only. It does not store the live TEST database, working `bits`,
or statement objects. Workflow artifact retention does not apply
because no workflow has run.

### Already implemented

Postgres.app `pg_dump` and `pg_restore` 18.7 can make a custom-format
archive. The November 17 restore proved that an empty `bits-test-db`
archive can be loaded into a separate local database. `age` and `gpg`
are not installed. The statement probe and restore commands write only
the designated TEST bucket, which still has 0 objects, and the app is
not configured to store PDFs there. Railway point-in-time recovery is
disabled. The backup-readiness page records a staff log. It does not
copy bytes. TEST has no `DATABASE_PUBLIC_URL`.

### Proposed destination

One Cloudflare R2 Standard bucket, `bits-independent-backups`, in the
owner's Cloudflare account, not in Railway. Prefixes:
`test/postgres/daily/`, `test/postgres/weekly/`, and
`test/statements/objects/`. No production prefix.

Official requirements, reviewed November 17. The owner completed R2
enablement; checkout was not repeated:

- Checkout adds an R2 subscription. A token cannot be created until R2
  is purchased. A primary payment method is required to purchase
  Cloudflare services. Accepted methods include card, PayPal, Apple Pay,
  Google Pay, Link, and UnionPay.
- The Enable agreement is a continuous month-to-month subscription that
  renews until canceled in the dashboard before the next billing period.
  Cancellation is billed for that monthly period and is not refunded.
  The published agreement includes a minimum one-month purchase
  obligation. R2 has no separate published base monthly fee. Its invoice
  lines are usage, billed for the previous period.
- Included Standard usage is 10 GB-month, 1 million Class A operations,
  and 10 million Class B operations. Above that: $0.015 per GB-month,
  $4.50 per million Class A, and $0.36 per million Class B. Egress is
  not charged. Usage inside the allowance is invoiced at $0.00. Sales
  tax follows the account postal code. Infrequent Access has no included
  allowance and is not proposed.
- Cloudflare may place a temporary card preauthorization for usage-based
  services. The published policy does not state the hold amount. A
  failed payment method can suspend R2 access. If it stays invalid for
  30 days, usage-based data may be deleted.
- Later on November 17 the signed-in R2 overview showed the product
  enabled: Class A 0, Class B 0, storage 0 B, and billable usage $0.00.
  Checkout was not repeated. The only new resource is the private
  Standard bucket `bits-independent-backups`, location Eastern North
  America, created November 17, 2026. Public development URL is
  disabled, no custom domain is connected, and the bucket holds 0
  objects and 0 B. No token was created and nothing was uploaded.
  Railway, church data, and Work Matrix were not changed.

### Prepared upload bounds

Size, retry, stored-total, and timeout checks are implemented in
`lib/ops/independent-backup-guard.ts` and covered by unit tests. The
preflight command runs the size and stored-total checks and does not
upload. Retry and timeout run when the backup job calls them. R2 does
not enforce the size, retry, or timeout bounds. The retention locks
were applied later and are recorded below.

| Bound | Rule |
|---|---|
| Postgres size | Refuse the upload if the archive is larger than 100 MiB. The current TEST dump is 384,921 bytes. |
| Statement size | One copy run refuses more than 1,000 objects or 1 GiB. `bits-statements-test` has 0 objects today. |
| Stored total | Do not start an upload if the objects already in `bits-independent-backups`, plus the new archive, would exceed 8 GiB. |
| Retries | At most 3 attempts for one object. Wait 5 seconds, then 15 seconds. Then stop and exit non-zero. Do not rerun the job automatically. |
| Retention | Applied November 17 on `bits-independent-backups` and read back after reload. Daily lock 14 days, expire after 15 days, about 15 copies. Weekly lock 56 days, expire after 57 days, about 8 or 9 copies. Statement lock 90 days, expire after 91 days. The 7-day multipart abort remains. |
| Timeout | The job stops the whole run at 120 seconds, aborts the dump, encryption, and network calls, and does not start another attempt. That code is in deployment `cfb015f5-dab0-47fe-8fa0-0e9c88f60987`. The November 18 runs finished in about 3 seconds, so they did not exercise the timeout. |

### Spending alert

Cloudflare budget alerts email when account-wide usage-based spend
crosses a dollar threshold. Official behavior: the alert is
informational, it does not pause a product or cap the invoice, and
usage is processed about once a day. A $1 alert named
`BITS $1 spend warning` was saved for the account email already on the
form. The list shows 0% of a $1.00 budget. Cloudflare's separate
auto-created $10 alert was left in place. This is not the backup-job
failure email, and no failure email has been delivered.

### Proposed controls

| Control | Proposal |
|---|---|
| Runner | A later Railway cron in `bits-test` / `test`, on the private network. It can read `bits-test-db` without a public database port. A GitHub-hosted runner cannot reach `railway.internal`, and the Mac SSH tunnel is not an unattended path. The cron stops if Railway stops. Copies already stored in R2 remain. |
| Upload credential | Created November 17: account token `bits-independent-backups-upload`, Object Read & Write, scoped only to `bits-independent-backups`. It is not Admin and does not apply to all buckets. Official object permission can delete objects in that bucket. The secret is in the macOS login keychain under service `bits-independent-backups-upload` and account `r2-object-read-write`. It is not in Git or chat. |
| Deletion protection | Applied and read back: 14 days on `test/postgres/daily/`, 56 days on `test/postgres/weekly/`, and 90 days on `test/statements/`. Each lock blocks overwrite and delete, including by lifecycle, until its age is met. No whole-bucket or indefinite lock was saved. |
| Restore credential | A second token, Object Read only, for the same bucket. It is used from the owner machine at restore time. The cron does not receive it. |
| Encryption | November 17: `age` v1.3.2 was installed from the official FiloSottile release after the published SHA-256 matched. Homebrew and MacPorts were not installed. The setup script created one identity outside the repository at `~/Library/Application Support/BITS/independent-backup/age-identity.txt`, mode `0600`, directory mode `0700`. A second run left that file unchanged. The public recipient is `age1x3n3tp6nryyhtavnr3eppkav0pc47vfeps9qqf30afkc7w9yc9dq8265jm`. The private key was not printed. A 46-byte synthetic file encrypted to that recipient and decrypted with the local identity; the bytes matched. The ciphertext did not contain the plaintext. No upload ran. |
| Key custody | The owner deferred the offline recovery-key copy. It is incomplete and not verified. The Mac holds the only confirmed private-key copy. The private key is not in Git, chat, Railway, or the upload job. |
| Schedule and retention | The retention ages are saved. Recurring execution stays off. A daily run, after a later approval, would be 11:15 UTC. The 15-day expiration holds about 15 daily archives. The 57-day expiration holds about 8 or 9 weekly archives. The upload token does not edit these rules. |
| Statements | Copy only objects that exist in `bits-statements-test`. There are 0 today, and the app writer is unset. Do not give the cron a statement-bucket delete credential. |
| Notification | A non-zero cron exit is the failure signal. Hobby keeps deployment logs for 7 days. No email or paging notifier is configured, and none is claimed. |
| Restore | Download with the read-only token, decrypt with the offline private key, and restore only into a new local database approved at that time. Never restore over TEST, working `bits`, `bits_e2e`, the Core 20 databases, or `bits_test_schema_recovery_2026111717161546d41ce7`. |

The local synthetic encrypt-and-decrypt check passed. One manual upload
rehearsal ran on November 17 and was deleted afterward. The recurring
cron is not authorized.

### Manual rehearsal, November 17, 2026

One approved run uploaded two encrypted files to `bits-independent-backups`
under `test/rehearsal/manual-20261117/`, downloaded them, decrypted them
locally, and compared checksums. The bucket was empty beforehand. The
size guard ran against that empty total. Each network call and `age`
invocation used the 3-attempt retry guard and the 120-second timeout.
This run finished on the first attempt, so the retry waits and timeout
abort were not triggered. No database was changed and no church record
was used.

| File | Plaintext bytes | SHA-256 | Encrypted bytes | After decrypt |
|---|---:|---|---:|---|
| Existing empty TEST dump `bits-test-db.dump` | 384,921 | `9429863446c929ef21d5151c916ed85cfe7cc1a2f8fa3fecdd75749e4fa9e50f` | 385,201 | Same SHA-256 |
| Synthetic PDF, text “BITS synthetic backup rehearsal. No church records.” | 626 | `d06a6707450986a06cf38f7605412a4ed5b9b89dd700bbeb058746d1ff71f323` | 826 | Same SHA-256 |

After the checksums matched, only those two objects were deleted. A
following list showed 0 objects. Recurring backups stayed off. The
offline recovery-key copy stays incomplete and not verified. The bucket
lock is still unset, so this token can still delete objects. The
failure email was not exercised. This is not a database restore and it
does not complete recovery-key resilience, FR-STMT-004, or the original
roadmap.

### Retention rules, applied and read back

These rules were saved on November 17 and were still present after the
settings page was reloaded. A bucket lock blocks overwrite and deletion,
including deletion by a lifecycle rule, until its age is met. Official
R2 behavior: the strictest matching lock wins, a blocked delete returns
HTTP 409 `ObjectLockedByBucketPolicy`, and lifecycle removal usually
follows within 24 hours after the object is eligible. A lock does not
stop a new object with a different key. Reusing one key would fail after
the first upload, so each run needs its own date in the key.

The expiration is one day after the lock so the lock can end and the
object can then be deleted instead of remaining forever. The existing
7-day abort of unfinished multipart uploads stays. No lock covers the
whole bucket, and none is indefinite. The object token cannot edit these
rules. A later dashboard delete of a rule is possible for someone who
can edit bucket configuration. A bucket cannot be emptied while any
lock rule exists. The read-back showed no whole-bucket lock and no
indefinite lock.

| Rule | Prefix | Lock | Lifecycle delete |
|---|---|---:|---:|
| `lock-test-postgres-daily` | `test/postgres/daily/` | 14 days (1,209,600 seconds) | 15 days (1,296,000 seconds) |
| `lock-test-postgres-weekly` | `test/postgres/weekly/` | 56 days (4,838,400 seconds) | 57 days (4,924,800 seconds) |
| `lock-test-statements` | `test/statements/` | 90 days (7,776,000 seconds) | 91 days (7,862,400 seconds) |

These durations are ages, not object counts. A daily run writes one
object per day, so the 15-day expiration holds about 15 daily archives.
A weekly run would write one object per week, so the 57-day expiration
would hold about 8 or 9 weekly archives. `scheduledBackupKeys` still
calculates a Sunday weekly key, and the Railway job does not call it.
The deployed job and the prepared daily job write only
`test/postgres/daily/`. They do not write `test/postgres/weekly/` or
`test/statements/`. Statement copies stay absent while
`bits-statements-test` has 0 objects and the app writer is unset. The saved read-back
is: daily lock 14 days and delete after 15; weekly lock 56 days and
delete after 57; statement lock 90 days and delete after 91. The
7-day multipart abort remains enabled with no prefix. Public access,
CORS, and Standard storage were left as they were.

### Manual failure test, schedule removed

Service `bits-test-backup` (`0f68511a-a35d-4d0a-af5c-48b9a0e93265`) exists
only in project `bits-test`, environment `test`. Production has no
instance. The image is `node:24-alpine`. The start command is
`node -e "process.exit(1)"`. The restart policy is Never, with zero
retries. The service has no database URL, upload token, or private key.

One manual cron run, `574e0e9e-2548-481f-8e88-b1dc09ec2e50`, was created
at `2026-11-17T20:31:14.883Z` and finished at `2026-11-17T20:31:16.874Z`.
Its status is `CRASHED` and its duration is 1 second. The deployment
`edad5603-33ab-4511-b553-6705b535c30a` is also `CRASHED`, and its one
instance is `CRASHED`. The cron schedule was then cleared.
At that point `nextCronRunAt` was null and recurring execution was off. The web service
`bits` deployment `7953e76b-25fe-41dd-b42e-34fcb3cf2747` remains
`SUCCESS` with its instance `RUNNING`.

The upload command `npm run backup:scheduled-plan` prints the dated key
and refuses `--apply`. It was not used for this failure run, and the
completed encrypted rehearsal was not repeated.

Railway's published cron page describes a nonzero run as `CRASHED` and
a run skipped because the previous one is still active as `SKIPPED`.
It does not say either status sends mail. Railway also does not stop a
cron that is still running, so the next scheduled run is skipped.
The deployment-actions page says emails and webhooks go to project
members when a deployment reaches `Crashed` after its restart policy is
exhausted. That is a deployment-status event. It is not documented for
a skipped cron or for a job that never starts. Restart Never with zero
retries makes the first nonzero exit the exhausted limit.

The notification-delivery query returned Not Authorized. The readable
notification-rule query returned no workspace or project rules, and no
webhook field was available on the project. Account defaults were not
readable. Delivery of the November 17 crash is unknown. It is not
recorded as received or missed.

### R2-to-database restore, November 17, 2026

This is empty-schema recovery. The source dump has no church rows, so
the restore does not prove recovery of real church records or
provider-wide disaster recovery.

The earlier encrypted rehearsal compared checksums and deleted its
objects. It did not restore a database. This run added that missing
step. The object key was `test/rehearsal/r2-restore-20261117/bits-test-db.dump.age`.
That prefix matches none of the saved locks, so the completed object was
not kept for 14, 56, or 90 days. The 7-day unfinished-multipart abort
still applies to incomplete uploads. The object was deleted after
verification, and the bucket was empty again.

| Item | Result |
|---|---|
| Source dump | Existing empty TEST dump, 384,921 bytes, SHA-256 `9429863446c929ef21d5151c916ed85cfe7cc1a2f8fa3fecdd75749e4fa9e50f` |
| Decrypted SHA-256 | Same value |
| Restore database | New local `bits_test_r2_restore_202611172052c4e1` on Postgres.app 18.7, `127.0.0.1:5432`, from `template0` |
| Restore flags | `pg_restore --no-owner --no-acl --exit-on-error --single-transaction` |
| Schema | 52 finished migrations, name checksum `dc676b85734b59076d5fe6bb2fce265efdfd92ae40d89bb435083f871cf2caef`, file checksums match `prisma/migrations`, 75 public tables |
| Constraints | Both recovery indexes and the six checked foreign keys are present |
| Rows | organizations, memberships, donors, donations, batches, audits, invitations, and role types are 0 |
| Left unchanged | `bits` stayed 3/3/4/`187.00`/0/338. `bits_e2e`, both Core 20 databases, and `bits_test_schema_recovery_2026111717161546d41ce7` remain |

Recurring backups stayed off. Failure-email verification stayed pending.
The offline recovery-key copy stayed deferred.

### Manual successful backup, November 17, 2026

One manual run of `bits-test-backup` dumped `bits-test-db`, encrypted
the archive with the public age recipient, and uploaded one object.
The private age key was not given to Railway. Recurring scheduling
stayed off. The earlier restore rehearsals were not repeated.

| Item | Result |
|---|---|
| Deployment | `1bcbe000-77ba-4562-954f-9a16c1858c37`, `SUCCESS`, instance `EXITED`, deployment stopped |
| Object | `test/postgres/daily/2026-11-17/bits-test-db-20261117T210100Z.dump.age` |
| Plain archive | 384,906 bytes, SHA-256 `75df0275d8b27b5dd62e96aeb96491b20b34bdce668e8e883368215eaf133505` |
| Encrypted object | 385,186 bytes, SHA-256 `dc49ce105125e0249e9f227f7fa45d9103e9c0ad2c1db8f3f856769f0a691722` |
| Independent read-back | One object in the bucket, same key, 385,186 bytes, same ciphertext SHA-256 |
| Retention | Locked for 14 days. Eligible for expiration after 15 days. It was not deleted |
| Left unchanged | Working `bits` stayed `3\|3\|4\|187.00\|0\|338`. Web deployment `7953e76b-25fe-41dd-b42e-34fcb3cf2747` stayed `SUCCESS`. Production has no backup instance |

The service image is Alpine 3.23 with Node.js 24.22.3, `pg_dump` 18.7,
and `age` 1.2.1. At the end of that run the start command ran
`node /app/backup-once.cjs` only when that file was present. The restart
policy was Never, with zero retries. `cronSchedule` and `nextCronRunAt`
were null. The service variables were the private `bits-test-db` URL
reference, the public age recipient, and the existing Object Read & Write
credential for `bits-independent-backups` only. No age identity variable
was set.

The container removed its temporary dump and ciphertext before it
reported success. No local copy of this run's dump was kept. This
archive was not decrypted and was not restored.

### Failure check before the schedule, November 18, 2026

Before the schedule was enabled, `DATABASE_URL` and the four R2
variables were removed from `bits-test-backup`. The public age recipient
stayed. The start command was `node -e "process.exit(1)"`, cron was
null, and the restart policy was Never with zero retries.

Deployment `e2f2a188-0a2c-447a-8202-042b5da5cc01` was created at
`2026-11-17T22:06:29.793Z`. Railway recorded the deployment as
`SUCCESS` and stopped. Its instance `d5b61c9b-1022-4cb0-b65a-7c638eec5438`
is `CRASHED`. The command did not use the database or R2. A later
removed deployment, `24e10512-cfc3-413a-ad18-e1ffc6656e7b`, also had that
exit-1 command. Its instance status is no longer readable. The service
was then returned to `node -e "process.exit(0)"` on deployment
`9edb9ad4-35c7-484a-ab09-d84c1d131024`, which exited without uploading.
The five credential variables were restored with deploys skipped.

This check does not establish a Deployment Crashed email. Railway's
deployment-actions page sends that mail when the deployment status is
`Crashed`. This deployment status is `SUCCESS`. `notificationDeliveries`
again returned Not Authorized. Delivery is unknown.

### Daily TEST schedule enabled, November 18, 2026

The owner approved the updated job and `15 11 * * *` UTC. UTC is
authoritative: 11:15 UTC is 06:15 Eastern standard time and 07:15
Eastern daylight time. Railway can start a few minutes off that minute.
If a previous run is still active at the next 11:15 UTC, Railway skips
the new run and does not stop the old one. The 120-second job timeout
is what turns a hung dump, encryption, or upload into a nonzero exit.
A skipped run, or a run that never starts, is outside that path.

| Item | Result |
|---|---|
| Service | `bits-test-backup`, `0f68511a-a35d-4d0a-af5c-48b9a0e93265`, instance `09a61b84-ed53-4952-89ad-5d7d3086c857`, environment `test` |
| Deployment | `cfb015f5-dab0-47fe-8fa0-0e9c88f60987`, Dockerfile image `sha256:78227e08171c318cb70f50533b96720fe1341de1d26a96c7060394afdc349684` |
| Command | `node /app/backup-once.cjs` |
| Schedule | `15 11 * * *`. `nextCronRunAt` is `2026-11-19T11:15:00.000Z` |
| Restart | Never. The service instance maximum retries are 0. The deployment snapshot leaves that field null |
| Scope | Daily TEST Postgres only. No weekly key and no statement object |

The deployed job chooses one new daily key per run, refuses the
November 17 protected key and any existing key, and does not delete.
Both runs below exited 0. The second run was an extra execution after
the first object was already stored. Both objects remain. The prefix
lock prevents deleting either one for 14 days.

| Run | Object | Plain archive | Ciphertext |
|---|---|---|---|
| `d2c84073-059e-4c35-bb09-6aac2200d1c9`, 16:22:49–16:22:52 UTC | `test/postgres/daily/2026-11-18/bits-test-db-20261118T162250Z.dump.age` | 384,906 bytes, SHA-256 `822ac323c4eee5067c457a87d8f70bdcf08dd0142f4a2486bea9f6b0bcca930e` | 385,186 bytes, SHA-256 `643dcbbd10b0ade2e24a52100c615ca095e5dc327c28cc9dcb0e461c8335e6ae` |
| `107e005a-eb01-4987-b7ec-52feb4967930`, 17:24:00–17:24:03 UTC | `test/postgres/daily/2026-11-18/bits-test-db-20261118T172400Z.dump.age` | 384,906 bytes, SHA-256 `fbb7f46fff3eccdb7520ac696b87322d06c0cee2c1b661b1dd3b15fa6a988039` | 385,186 bytes, SHA-256 `9a4dfdc3c1ce3dc2a647b0ff709153e98d38182e4b73cd5476874f9e0d837b1a` |

An independent read found three objects. The November 17 object is
unchanged at 385,186 bytes with ciphertext SHA-256
`dc49ce105125e0249e9f227f7fa45d9103e9c0ad2c1db8f3f856769f0a691722`.
Each new object's metadata SHA-256 matches its ciphertext hash. None of
the three was decrypted or restored. No `test/postgres/weekly/` or
`test/statements/` object was written. Working `bits` stayed
`3|3|4|187.00|0|338`. Web deployment
`7953e76b-25fe-41dd-b42e-34fcb3cf2747` stayed `SUCCESS`. Production has
no backup instance.

One measured successful run lasts about 2 to 3 seconds. Actual CPU and
memory were not read. At the published Hobby rates of $0.000463 per
vCPU-minute and $0.000231 per GB-minute, an assumption of 1 vCPU and 1
GB for 3 seconds is about $0.001 per month. The same assumption for the
full 120-second cap, every day, is about $0.04 per month. About 15
daily objects of 385 KiB remain inside the 10 GB Standard allowance, so
the storage line is $0.00 before tax. Two objects exist for November 18,
so the bucket holds one extra daily archive until the 15-day lifecycle
can remove the older daily objects. Egress of that ciphertext is under
$0.001 per month at $0.05 per GB. This is incremental usage inside the
existing Hobby $5 credit until the web service and database volume
consume that credit. The $1 Cloudflare alert does not cap the invoice.

### Backup watch enabled, delivery not observed

Railway deployment status is not the alert. A successful deployment can
still hide a crashed instance, and a backup that never starts creates
no deployment event. The prepared check is a separate read-only look for
a completed object under `test/postgres/daily/YYYY-MM-DD/`. It does not
upload, delete, or change the `15 11 * * *` backup schedule.

The check is due at 11:45 UTC, 30 minutes after the backup. UTC is
authoritative. If the check starts after midnight, it evaluates the
latest day whose 11:45 UTC deadline has passed. A completed object has
the daily key pattern, a non-zero size within the archive limit, and a
64-character SHA-256 metadata value. The November 17 protected object
does not satisfy a later day. No weekly or statement object counts.

| Evidence | Result |
|---|---|
| Unit tests | A failed run with no archive alerts as `failed`. No runs, or only a skipped run, alerts as `never-started`. An archive without a checksum does not count. Before 11:45 UTC the day stays `pending` unless a run has already failed |
| Live read on November 18 | Current bucket: `ok`, no alert, both November 18 daily keys. A read-only drill for November 16, which has no object, alerted `never-started` with `--runs=none` and `failed` with `--runs=failed`. Exit 1 stayed on this machine |
| Notification | `notificationSent` is false. No email or external service was used |

The workflow is `.github/workflows/bits-test-backup-watch.yml`. Its
runner is `ubuntu-slim`. Standard GitHub-hosted runners are free on this
public repository. One list and a few object heads per day stay inside
the R2 Class B allowance, so that line is $0.00 before tax. The workflow
uses a new account token, `bits-independent-backups-read`, with Object
Read only on `bits-independent-backups`. A local check allowed list and
head, and denied put and delete. Its secret is in the macOS login
keychain under service `bits-independent-backups-read` and account
`r2-object-read`. The same endpoint and S3 keys are GitHub Actions
secrets. The older token can delete objects and is not in GitHub.

GitHub sends a scheduled-workflow notification to the user who adds the
workflow to the default branch, and only when that user has Actions
notifications enabled. GitHub can delay or drop a scheduled run during
high load without sending mail. It does email the owner if inactivity
disables the schedule after 60 days. A dropped check is not itself
detected. No paid monitor is proposed.

### Still open

Failure-email delivery stays unknown. The November 17 crash and the
November 18 exit-1 deployment do not have inbox or provider delivery
evidence. The backup watch is enabled for 11:45 UTC. Its first scheduled run is
`2026-11-19T11:45:00.000Z`. No notification has been delivered. The offline recovery-key copy stays deferred, incomplete,
and not verified. Statement-copy scheduling stays separate because
`bits-statements-test` has no application writer and no objects.
Production scheduling stays open. Original v1 stays unfinished.
