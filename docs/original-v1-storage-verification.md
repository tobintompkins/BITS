# Original v1 — Statement storage verification (Core 08)

October 14, 2026. This records the Core 08 increment against the current
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

## Outstanding blockers

- Designate `BITS_STATEMENT_S3_TEST_*` and run probe plus restore
  `--apply`. Record emulator vs live-provider results separately.
- Live Clerk two-tenant acceptance remains blocked on identities.
- Broader ledger acceptance, staff-management completeness, two-session
  household locking, and deployment readiness remain.
- Original version 1 is not complete.
