# Original v1 — audit coverage (Core 22)

November 4, 2026. This reviews existing FR-AUDIT-001–004 coverage for
original giving records. It is not a security certification, and it does
not mark original version 1 complete.

Evidence is source inspection plus tests already in the tree. This review
did not rerun the application suite, isolated SQL, or Core 20 restore.
Mocked tests are not live acceptance.

`audit_events.occurredAt` is the database default. Writers do not accept a
client timestamp. Ordinary application code creates rows through
`createAuditEvent` and reads them with an organization id. The repository
has no update or delete. `deleteMany` appears only in isolated tests,
event-test fixtures, and e2e cleanup. That is not production CRUD.
FR-AUDIT-004 does not require new database roles or cryptographic
tamper-proofing. Check-in history was not deleted.

## Coverage

| Workflow | Action | Actor and church | Transaction | Evidence |
|---|---|---|---|---|
| Organization settings update | `UPDATE` on `Organization` | Signed-in editor of the resolved church. Actor comes from the server account | Organization row, logo key, and audit share one transaction. Logo bytes are staged outside it | Core 23 unit tests and isolated `bits_e2e` rollback/concurrency. See the repaired contract below |
| Donor create/update, including deactivate | `DONOR_CREATED` / `DONOR_PROFILE_UPDATED` on `Donor` | Membership actor and church. Client organization id must match. Contact values and notes are stored as `changed` | Same `prisma.$transaction` as the donor write | `donor-management.service.test.ts`: foreign id, report-viewer denial, audit inside the transaction, thrown audit failure, notes omitted |
| Giving household create/update/deactivate | `GIVING_HOUSEHOLD_CREATED` / `UPDATED` / `DEACTIVATED` / `REACTIVATED` on `Household` | `access.actor` and `access.organization` | Same household transaction | Unit test throws on audit failure. Isolated `giving-household.concurrency.test.ts` rolls back link, move, end, and settings when audit injection fails, then accepts a clean retry |
| Giving household link/move/end | `GIVING_HOUSEHOLD_MEMBER_LINKED` / `MOVED` / `ENDED` on `HouseholdMembership` | Same access pair. Dates are recorded; donor and household ids are `changed` | Same transaction | Same isolated rollback test |
| Offering type create/update/deactivate/reactivate | `OFFERING_TYPE_CREATED` / `UPDATED` / `DEACTIVATED` / `REACTIVATED` on `OfferingType` | Membership actor and church | Same transaction | `offering-type.service.test.ts` asserts the action and a thrown audit failure |
| Batch create/update | `CREATE_OFFERING_BATCH` / `UPDATE_OFFERING_BATCH` on `OfferingBatch` | `requireActor` and `requireOrganization` | Same transaction | Source. No separate audit-failure injection |
| Complete entry / reconcile | `COMPLETE_OFFERING_BATCH_ENTRY` / `RECONCILE_OFFERING_BATCH` | Actor and church passed into the locked transaction | `createAuditEvent(..., input.db)` after the status predicate | Source. Conflict and permission failures throw before a successful status audit |
| Deposit record/update and lock | `RECORD_BATCH_DEPOSIT` / `UPDATE_BATCH_DEPOSIT` / `LOCK_OFFERING_BATCH` | Same | Same transaction. An unchanged deposit returns before any audit | Source |
| Manual gift create/update/delete | `CREATE_MANUAL_BATCH_DONATION` / `UPDATE_MANUAL_BATCH_DONATION` / `DELETE_MANUAL_BATCH_DONATION` on `Donation` | Caller passes the server actor and church into the transaction | Same transaction as the gift, allocations, totals, and idempotency claim | Isolated `ledger.concurrency.test.ts` sees one gift and one audit row for a concurrent same-token create. Audit-failure injection was not rerun |
| Individual/household generate and reissue | `GENERATE_CONTRIBUTION_STATEMENT` / `REISSUE_CONTRIBUTION_STATEMENT` on `ContributionStatement` | Generation actor and current church | Same transaction | Generation tests assert the action. PDF cleanup stays outside the transaction |
| Publish | `PUBLISH_CONTRIBUTION_STATEMENT` | Publisher and current church | Same transaction, after the status predicate | Publish tests assert the action |
| Void request, review, and execution | `REQUEST_CONTRIBUTION_STATEMENT_VOID`, `APPROVE_` / `REJECT_CONTRIBUTION_STATEMENT_VOID_REQUEST` on `StatementVoidRequest`; `VOID_CONTRIBUTION_STATEMENT` and `EXECUTE_CONTRIBUTION_STATEMENT_VOID_REQUEST` | Requesting or reviewing actor and current church | Same transaction | Source. A lost review race throws before the audit |
| Staff generated-statement PDF | `VIEW_GENERATED_CONTRIBUTION_STATEMENT` on `ContributionStatement` | Authorized staff account and statement church | Audit is written before the response stream. Failure destroys the file stream and returns JSON | `app/api/staff/statements/[id]/pdf/route.test.ts` |
| Portal published-statement PDF | `VIEWED` / `DOWNLOADED` on `statement_access_events` | Linked donor account and statement church | Access row is written before the response stream. Failure destroys the stream and returns JSON | Route tests cover denial and unavailable files. The audit-failure branch is confirmed in `app/api/portal/statements/[id]/pdf/route.ts` and was not executed in this review |
| Contribution, batch-reconciliation, and statement-access CSV | `CONTRIBUTION_REPORT_EXPORTED`, `BATCH_RECONCILIATION_REPORT_EXPORTED`, `STATEMENT_ACCESS_REPORT_EXPORTED` | Report actor and current church. Entity id is the church id | Audit is awaited before the CSV is returned. Failure becomes “not released” | Each report service test rejects `audit down` |

Statement timeline reads use `findEntityAuditEvents(organization.id, ...)`
and a void-request query with the same church id. The leadership activity
view uses `findAllowListedAuditEvents` for `findPrimaryOrganization()`
after an edit-access check. On-screen report reads are not treated as
statement downloads.

## Organization settings contract (repaired November 5, 2026)

`saveOrganizationSettings` updates an already resolved church. A missing
or ambiguous church does not create an organization or grant `ORG_ADMIN`.
First-admin bootstrap remains the separate grant path.

The organization row, logo key, and `UPDATE` audit use one transaction
client. Repository writes take that client. Audit values come from the
locked row and the saved row. An unchanged save does not write an audit
row. An audit failure rolls the database change back.

A new logo is staged, before the transaction, to a unique
`logo-<random>.<ext>` file with exclusive create. The previous
`logo.png` is not overwritten or deleted until the transaction commits
and a fresh read still shows the key this save stored. Removal sets the
key to null in the transaction and deletes the old owned file after that
read. Cleanup failure leaves the saved row in place and returns a short
notice. An uncertain commit keeps the staged file instead of deleting a
file that might now be current. Deletes stay inside
`uploads/organizations/<church id>/` and ignore other paths, including
`https` logo URLs.

The database write and the file replacement are not one atomic
transaction. Competing saves take the existing organization `FOR UPDATE`
lock first. That lock does not serialize every role change in the
application.

Evidence: focused unit tests cover denial, no-op, audit rollback,
same-extension staging, write failure, and post-commit cleanup failure.
`npm run test:isolated -- server/services/organization-settings.concurrency.test.ts`
ran the rollback and two competing replacements on `bits_e2e`. Working
fingerprints were unchanged. Mocked transaction rollback is not that
SQL result. No signed-in browser save was run.

## Verification follow-up (November 5, 2026)

Core 23A did not add a second settings service. It strengthened the
existing checks.

The competing-save test now holds the organization lock in the first
writer and observes the second writer in `pg_blocking_pids` before
release. Removing that lock fails the helper because the second backend
is never blocked. While the first writer held the lock, `logo.png` still
contained its prior bytes. After both commits, the stored key matched
the winning file, both `UPDATE` audits existed, and the predecessor and
losing staged file were gone.

Logo staging creates the file exclusively before writing bytes. A write
or close failure removes only the file that attempt created. If that
removal fails, the log records the storage key and error code and the
original write error is preserved. A name collision is left untouched,
including the current logo.

The isolated runner previously exited 2 with an empty message when local
Postgres was stopped, because the connection error was an `AggregateError`
with no message and stderr was not flushed. It now prints that the local
database service is unavailable and that nothing was migrated or reset.
URLs and password fields are redacted. The focused isolated file then
passed on `bits_e2e` with Postgres.app 18 running, including the new
organization count and logo-key fingerprint. Postgres was stopped after
that run.

Focused unit tests: 5 files / 37 passed. Full unit suite: 233 files /
1,651 passed, 62 skipped. Production build and `tsc --noEmit` passed.
No signed-in browser save was run. Database commit and file cleanup
remain separate. Original version 1 is incomplete.

## Giving audit review (November 5, 2026)

`/reports/giving-audit` reads existing `audit_events` rows for the session
church. It does not create a second audit store or write a row when the
page opens. Organization administrators and treasurers may open it.
`/administration/security-activity` still requires organization-admin
`canEdit`, so a treasurer cannot reach privacy, document, purchase,
maintenance, or equipment rows by changing the giving-audit query.

The giving page allow-list uses the action strings current writers persist:
donor create and profile update; giving-household create, update,
deactivate, and reactivate; membership link, move, and end; offering-type
create, update, deactivate, and reactivate; batch create, update, complete,
reconcile, deposit record, deposit update, and lock; gift create, update,
and delete; organization settings `UPDATE`; statement generate, reissue,
publish, staff view, void, and void-request actions; contribution,
batch-reconciliation, and statement-access export; and financial-correction
request, approval, rejection, and cancellation. No second historical
spelling of those actions was found in the current writers.

Summaries name the changed fields. They do not render old or new private
values. Missing metadata and a missing actor still render. Each page shows
25 rows, ordered by timestamp and then id, with an older-page link. Record
links are omitted unless the same church still has that row. Portal
statement view and download history stays on the statement access report.

Focused unit tests passed. They are not a signed-in browser review.

Core 25A, the same day, labels From, Through, and the listed times as UTC.
Those filters still use UTC calendar days. Gift links open the batch detail
page after a same-church batch lookup. A missing, unbatched, or other-church
batch stays unlinked. The draft gift edit route is not used for review.
Original version 1 is incomplete.

## Still open

Live Clerk acceptance, invitation delivery, statement-object restore,
Railway, production backup scheduling, and provider disaster recovery
remain open. A same-church audit row is not proof of those gates.
Original version 1 is incomplete.
