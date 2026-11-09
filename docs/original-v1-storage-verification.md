# Original v1 — Statement storage verification (Core 08 / Core 14)

October 14, 2026 (Core 08) and October 23, 2026 (Core 14). This records
the statement-storage probe and restore increment against the current
working tree. It is not disaster-recovery certification and does not mark
original version 1 complete.

## What this increment adds

- Probe cleanup reports `cleanedUp` only after `inspectRemoteStatementPdf`
  returns absent. AccessDenied or timeout after delete is unknown, not
  absence. `deleteRemoteStatementPdf` remains best-effort for generation
  rollback.
- S3 `readBody` streams incrementally and never calls
  `transformToByteArray`, so the 15 MiB cap is enforced during read.
- PUT, GET, and DELETE share the 15s abort timeout.
- Probe and restore refuse the application bucket. Writes require
  `BITS_STATEMENT_S3_TEST_TARGET=1` and a dedicated
  `BITS_STATEMENT_S3_TEST_BUCKET`.
- `npm run statements:storage-restore` is a synthetic rehearsal that
  restores from the backup object, not an in-memory original.

See `docs/private-statement-storage.md` and
`docs/statement-storage-recovery.md`.

## Core 14 repairs (October 23, 2026)

- `checkUnsignedObjectPrivacy` inspects the requested object URL, aborts
  on a deadline, reads a bounded cancellable body, and never treats
  redirects, DNS failures, timeouts, or 404 as privacy proof. 401/403 is
  denial evidence. Successful unsigned bytes fail the check. Credentialed
  URLs are not sent.
- Failed-cleanup manifests are run-owned under
  `e2e/.local/statement-probe-manifests/run-{runId}.json` with exclusive
  create. Another run is not overwritten.
- Restore rehearses from a separately fetched backup object, compares
  SHA-256 and byte length, then reports verified owned-key cleanup.
  Unknown cleanup retains the run manifest.
- Scripts load gitignored `e2e/.local/storage-test.env` for
  `BITS_STATEMENT_S3_TEST_*` only. That overlay cannot change
  `DATABASE_URL`, `DIRECT_URL`, isolated/working database URLs, or Clerk
  keys. Process values win.
- A bucket name that merely contains the letters `test` (for example
  `contest-statements`) is not a dedicated TEST target. `BITS_STATEMENT_S3_TEST_TARGET=1`
  is still required.

## Verification (October 23, 2026)

Worktree: HEAD `1fef2d0` plus uncommitted Core 02–14 and earlier local
work. No commit was created for this increment. No app credentials,
database records, bucket objects, IAM, or the original specification were
changed for a live write.

| Check | Result |
|---|---|
| Focused storage adapter/config/env/probe tests | 4 files / 29 passed |
| `npm test` | 222 files / 1,579 passed, 62 skipped |
| Isolated SQL | Not required |
| `npm run lint` | Passed |
| `git diff --check` | Passed |
| `npm run prisma:validate` | Passed (existing SetNull warning) |
| `npm run build` | Passed (existing middleware-to-proxy and member-document NFT warnings) |
| `npx tsc --noEmit` after build | Passed |
| Read-only `npm run statements:storage-probe` | Blocked: no designated `BITS_STATEMENT_S3_TEST_*` target. `executionKind=none`. No secrets printed |
| `statements:storage-probe -- --apply` | Not run. Emulator absent; live TEST bucket unset |
| `statements:storage-restore -- --apply` | Not run. Same TEST-target blocker |
| Fake SDK sender | Mocked evidence only |
| Clerk live acceptance | Deferred by owner; not restarted |

Distinguish mocked adapter/probe results (passed) from emulator and
live-provider results (not executed). A same-bucket copy would not be an
independent durable backup even if a TEST target were later designated.

## Verification (October 14, 2026)

Worktree: HEAD `1fef2d0` plus uncommitted Core 02–08 and earlier local
work. No commit was created for this increment. No app credentials,
database records, bucket objects, or the original specification were
changed for a live write.

| Check | Result |
|---|---|
| Focused storage adapter/config/probe tests | Passed earlier in this increment (7 files / 74 tests) |
| Generation / staff / portal PDF regressions | Included in the full suite below |
| `npx tsc --noEmit` | Passed |
| `npm run lint` | Passed |
| `git diff --check` | Passed |
| `npm run build` | Passed (existing middleware-to-proxy and member-document NFT warnings) |
| Full `npx vitest run` | 207 files / 1,546 tests passed |
| Read-only `npm run statements:storage-probe` | Blocked: no designated `BITS_STATEMENT_S3_TEST_*` target. No secrets printed. |
| `statements:storage-probe -- --apply` | Not run. Live provider writes require an isolated TEST bucket. |
| `statements:storage-restore -- --apply` | Not run. Same TEST-target blocker. |
| `npm run test:e2e:acceptance` | Unchanged blocker: Clerk development organizations and seven fictional identities are not configured. |

Distinguish mocked adapter/probe results (passed) from live-provider
results (not executed). A same-bucket copy would not be an independent
durable backup even if a TEST target were later designated.

## Verification (November 4, 2026)

Worktree: HEAD `7787b2f` plus uncommitted Core 18–20 and this docs-only
Core 21 record. No commit. No code, credentials, database, or bucket
objects were changed. Core 20's disposable databases were not touched.

| Check | Result |
|---|---|
| `e2e/.local/storage-test.env` | Absent. Overlay would supply only `BITS_STATEMENT_S3_TEST_*` |
| Shell `BITS_STATEMENT_S3_TEST_*` | All seven allowlisted names unset |
| Application provider in `.env` | Bucket, region, endpoint, and AWS credential names unset |
| `e2e/.local/acceptance.env` | `BITS_STATEMENT_PDF_BACKEND` is local. Not loaded by the probe. No S3 names |
| Read-only `npm run statements:storage-probe` | Exit 2. `mode=preflight`, `targetKind=unconfigured`, `executionKind=none`, `test-target` blocked. No secrets printed |
| `--apply` probe and restore | Not run. No designated TEST target |
| `git diff --check` | Passed on the Core 21 documentation edits |

Preflight is not provider connectivity. No emulator or live-provider
execution occurred. Same-bucket synthetic recovery, independent durable
backups, provider disaster recovery, version retention, and staff/portal
authorization remain separate and unproven. Clerk acceptance stays
deferred. Original version 1 is not complete.

## Outstanding blockers

- Designate `BITS_STATEMENT_S3_TEST_*` (shell or gitignored
  `e2e/.local/storage-test.env`) and run probe plus restore `--apply`.
  Record emulator vs live-provider results separately. Do not install
  unknown images or use the application bucket.
- Live Clerk two-tenant acceptance remains deferred by the owner.
- Broader ledger acceptance, staff-management completeness, live
  household forms, and deployment readiness remain.
- Original version 1 is not complete.
