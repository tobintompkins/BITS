# Report catalog exports — October 3, 2026

Original scope: remaining May section 14 catalog outputs after Core 04 —
batch-reconciliation screen/CSV/print and restricted statement-access
screen/CSV. The original May specification is unchanged.

## Files

- `lib/auth/report-catalog-permissions.ts`
- `lib/reports/church-timezone-range.ts`
- `lib/validation/batch-reconciliation-report.ts`
- `lib/validation/statement-access-report.ts`
- `server/services/report-catalog-access.ts`
- `server/repositories/batch-reconciliation-report.repository.ts`
- `server/repositories/statement-access-report.repository.ts`
- `server/services/batch-reconciliation-report.service.ts`
- `server/services/statement-access-report.service.ts`
- `components/reports/batch-reconciliation-filters.tsx`
- `components/reports/statement-access-filters.tsx`
- `components/reports/print-report-controls.tsx`
- `app/(staff)/reports/batch-reconciliation/page.tsx`
- `app/(staff)/reports/statement-access/page.tsx`
- `app/api/staff/reports/batches/csv/route.ts`
- `app/api/staff/reports/statement-access/csv/route.ts`
- Focused tests beside those modules
- Link/print updates: `components/reports/contribution-report-filters.tsx`,
  `app/(staff)/reports/page.tsx`, `app/(staff)/batches/[id]/page.tsx`,
  `app/(staff)/statements/registry/page.tsx`, `app/globals.css`,
  `server/services/contribution-report.service.ts`

No schema migration. Existing `OfferingBatch`, `Donation`,
`DonationAllocation`, `ContributionStatement`, `StatementAccessEvent` and
`AuditEvent` rows are reused. Member households at `/households` remain a
separate system.

## Batch reconciliation

`/reports/batch-reconciliation` lists offering batches in an inclusive
offering-date range, with optional same-church batch id and validated status.
Empty batches stay in the result. Totals cover every matching batch, not the
current page. Print (`?print=1`) uses the same authorized snapshot and print
CSS; it prints all bounded matching rows, not only the page.

Columns: name/reference, offering date, status, expected total (blank when
unset, never silently zero), stored recorded total, independently calculated
gift total (each donation once), allocation total (each allocation once),
variance (calculated minus expected; blank if no expected), stored recorded
minus calculated, gift counts, real/test split, deposit date and reference.
There is no invented deposit-amount field.

Canonical batch inclusion is every donation with that `batchId`, including
anonymous gifts and inactive funds. Mixed real/test batches are flagged.
Comparable aggregate variance excludes mixed batches so a real-only expected
total is never compared silently with a mixed calculated total. Discrepancies
are read-only and do not repair totals or change status.

Limits: 366 inclusive days, 500 batches, 5,000 nested gifts. Overflow is
rejected before delivery.

## Statement access

`/reports/statement-access` lists stored `StatementAccessEvent` rows only. It
does not synthesize missing accesses, deduplicate repeated downloads, or claim
that a person read a file. The lifecycle timeline stays on
`/statements/registry/[id]`.

Occurred-at filters use the active church time zone, including DST
transitions, then convert to UTC. CSV includes ISO UTC timestamps, a church
local display time, and the IANA time zone. Historical events for inactive
recipients and voided statements are kept. Exported columns are event time,
statement identifier, type, status, recipient label, action and a
display-name actor label (`Staff member` when no name). PDF storage keys,
checksums, tokens, addresses, notes and void reasons are omitted.

Limits: 366 inclusive days, 5,000 events. Overflow is rejected.

## Permissions

Tenant resolution matches Core 04: active account, selected Clerk church, or
exactly one active membership. Client organization ids are stale-church checks
only.

Batch report/export/print: ORG_ADMIN, TREASURER, REPORT_VIEWER. DATA_ENTRY,
DONOR and unauthenticated users are denied.

Statement-access report/export: ORG_ADMIN and TREASURER only. REPORT_VIEWER
statement viewing is not authority to export staff/recipient access history.
The registry link uses existing `canManageStatements` and does not expand
timeline access.

Exports write `BATCH_RECONCILIATION_REPORT_EXPORTED` or
`STATEMENT_ACCESS_REPORT_EXPORTED` before bytes are returned. Audit failure
blocks delivery. Exports are not recorded as `StatementAccessEvent` PDF
views. CSV reuses Core 04 formula neutralization. Queries do not mutate
batches, gifts, allocations, PDFs or access history.

## Validation performed

- 31 focused catalog-export tests passed (DST day boundaries; batch
  status/filename and exclusive offering-date end; statement action/filename
  and DST timestamp range; batch role matrix, foreign/stale filters, empty
  expected totals, split allocations, variance signs, mixed real/test
  aggregate exclusion, overflow without audit, audit-fail without release,
  and screen/print/CSV snapshot parity; statement admin export,
  report-viewer denial, voided/inactive/repeated events, foreign/stale
  filters, DST query bounds, omitted private fields, overflow, audit-fail
  without access-event writes, and display-name actor labels; CSV route
  headers and authorization mapping).
- Core 04 contribution-report service tests still passed.
- Focused ESLint on changed files passed.
- Full TypeScript check passed.
- Full lint passed.
- `git diff --check` passed.
- Production build passed, with existing middleware/file-tracing warnings.
  `/reports/batch-reconciliation`, `/reports/statement-access`,
  `/api/staff/reports/batches/csv` and
  `/api/staff/reports/statement-access/csv` are present alongside unchanged
  `/reports`, `/giving-households` and `/households` routes.
- Full test suite: 191 files passed; 1,461 tests passed (October 3 Core 04
  baseline was 184 / 1,430).

Unauthenticated `/reports/batch-reconciliation` and
`/reports/statement-access` redirect to Clerk sign-in. Unsigned CSV routes
return 401.

Not yet verified: authenticated treasurer/report-viewer/DATA_ENTRY/donor
browser acceptance; a live export audit row; durable private statement
storage; and launch verification. This increment does not mark original v1
complete.
