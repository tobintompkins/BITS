# Offering Batch Foundation and Directory

Staff can create draft offering batches, browse the organization directory,
view batch details, and edit draft batches at `/batches`. Donation entry,
reconciliation, deposits, corrections, approvals, and delete are not part of
this increment.

## Permissions

Server actions and services enforce every rule. Hiding a button is not the
security boundary.

- `ORG_ADMIN`, `TREASURER`, and `DATA_ENTRY` may view, create, and edit draft
  batches.
- `REPORT_VIEWER` may view the directory and batch details but cannot create or
  edit.
- `DONOR`, signed-out users, and other roles cannot access batch pages.

`DATA_ENTRY` can work on draft batches even though that role cannot view or
manage contribution statements.

## Organization isolation

Every query and mutation includes the authenticated church `organizationId`
from the server context. A batch ID from another organization resolves to the
same generic not-found result. Directory counts, filters, pagination, and
month-to-date totals are scoped to the current organization.

The browser cannot supply `organizationId`. The server ignores any
organization, creator, status, or recorded-total values posted from the form.

## Directory and filtering

`/batches` is titled **Offering Batches**. Permitted roles see an **Add Batch**
button. Summary cards show draft, entered, reconciled, and locked counts plus
the total recorded this month.

Staff can search by name or service description, filter by status and offering
date range, sort by offering date, created date, name, expected total, or
recorded total, and page through results. Those values live in the URL and are
validated with Zod before use. Empty, loading, and invalid-filter states are
shown.

## Creation rules

New batches always begin as `DRAFT` with `recordedTotal` `0.00`.
`createdByUserAccountId` comes from the signed-in account. Optional service
description, expected total, and notes are normalized; blank strings become
`null`. Future offering dates show a warning and may still be saved.

## Draft-only editing

`/batches/[id]/edit` can change only name, offering date, service description,
expected total, and notes. The mutation re-reads the batch inside a transaction
and updates with `updateMany` where `organizationId` matches and `status` is
still `DRAFT`. If another process moves the batch to `ENTERED`, `RECONCILED`,
or `LOCKED`, the update count is zero and staff see a friendly conflict
message. Recorded total, deposit fields, creator, organization, and status
cannot be changed here.

There is no delete action in this increment.

## Currency handling

Money is accepted as decimal text (`10` or `10.50`), parsed with `decimal.js`,
and stored as `Decimal(12, 2)` strings. JavaScript number arithmetic is not
used for persistence or difference calculations. Expected total, when present,
must be zero or greater. Difference is expected minus recorded, or empty when
no expected total was entered.

## Audit behavior

A successful create or draft update writes one `AuditEvent` in the **same
transaction**:

- `CREATE_OFFERING_BATCH` or `UPDATE_OFFERING_BATCH`
- `entityType`: `OfferingBatch`
- `entityId`: batch ID
- `organizationId` and `actorUserAccountId`
- safe old and new values for `name`, `offeringDate`, `serviceDescription`,
  and `expectedTotal`

Notes, donor data, Stripe secrets, and payment details are not stored in audit
metadata. If the audit write fails, the batch change rolls back.

## Status limitations

This increment does not move a batch to `ENTERED`, `RECONCILED`, or `LOCKED`,
does not record donations, and does not create deposits. Those statuses can
appear in the directory when later milestones write them. They remain
read-only here.

## Next milestone

Secure manual donation entry and allocation inside draft batches is
implemented. See `docs/manual-batch-donation-entry.md`. The following
milestone is batch entry completion and reconciliation workflow.
