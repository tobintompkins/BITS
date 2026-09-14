# Manual Batch Donation Entry

Authorized staff can record an offline donation inside a **DRAFT** offering
batch and split it across one or more active giving funds. The entry screen is
`/batches/[id]/donations/new`. Editing, deleting, correcting, reconciling,
locking, deposits, refunds, and Stripe changes are not part of this increment.

## Permissions

Server actions and services enforce every rule. Hiding **Add Donation** is not
the security boundary.

- `ORG_ADMIN`, `TREASURER`, and `DATA_ENTRY` may add donations to draft batches.
- `REPORT_VIEWER` may view the batch and donation summaries but cannot add
  donations or search donors for entry.
- `DONOR`, signed-out users, and other roles cannot access staff batch
  workflows.

`DATA_ENTRY` can enter draft-batch donations even though that role cannot view
or manage contribution statements.

## Organization isolation

Every query and mutation uses the authenticated church `organizationId` from
the server context. Batch IDs, donor IDs, and offering-fund IDs from another
organization resolve to a generic not-found result. Donor search never returns
another church’s records. The browser cannot supply `organizationId`.

## Supported payment methods

Manual entry accepts only `CASH`, `CHECK`, `STOCK_OR_NONCASH`, and `OTHER`.
`CARD` and `ACH` are rejected because Stripe records online electronic gifts.
A check number is required for `CHECK` and must be empty for every other
method.

## Donor and anonymous behavior

Donor search looks up **active** donors in the current organization by first
name, last name, full name, email, or phone. Results include name, masked
email, masked phone, and household name when an active membership exists.
Internal notes and giving history are not returned.

A donor is required unless **Anonymous** is selected. Anonymous gifts always
store `donorId` as `null`. Inactive donors are rejected.

## Allocation rules

Staff must assign at least one active `OfferingType` from the current
organization. Duplicate funds on the same donation are rejected. Each
allocation amount must be positive with at most two decimal places. The
donation total is **computed from the allocation sum** on the server. Client
totals are ignored.

## Deductibility behavior

Deductible amount must be between zero and the donation total. When the gift is
not tax-deductible, `deductibleAmount` is stored as `0.00`. If goods or
services were provided, a description and a non-negative estimated value no
greater than the donation total are required.

Optional reference text is stored with the donation note because the current
`Donation` model has no dedicated reference column. Notes and references are
not shown in the batch donation list.

## Transaction and concurrency protection

Create runs in one database transaction:

1. Re-read the batch by ID and current organization.
2. Require status `DRAFT`.
3. Re-read and validate the selected donor in the current organization.
4. Re-read every selected fund in the current organization and require it to be
   active.
5. Create the `Donation` linked to the batch.
6. Create every `DonationAllocation`.
7. Atomically increment `OfferingBatch.recordedTotal` with
   `updateMany` where status is still `DRAFT`.
8. Write the audit event.

Manual donations always store `stripeCheckoutSessionId` null,
`stripePaymentIntentId` null, and `isTest` false. Those values, creator IDs,
and batch totals posted from the form are ignored.

If the batch leaves `DRAFT` while the form is open, the increment count is
zero and every donation, allocation, total, and audit change rolls back.
Concurrent valid additions increment `recordedTotal` in the database so later
gifts are added to the current total instead of overwriting it.

## Audit behavior

A successful create writes one `AuditEvent` in the same transaction:

- action: `CREATE_MANUAL_BATCH_DONATION`
- entityType: `Donation`
- entityId: created donation ID
- organizationId and actorUserAccountId
- safe metadata: batch ID, payment method, anonymous status, total amount,
  deductible amount, and allocation fund IDs with amounts

## Sensitive data excluded from audit logs

Audit metadata does not include donor email or phone, check number, notes,
goods/services descriptions, card or bank data, or Stripe secrets and
payloads.

## Draft-only limitation

`ENTERED`, `RECONCILED`, and `LOCKED` batches reject new donations. This
increment does not edit or delete donations, reassign donors, reconcile or
lock batches, or change Stripe gifts.

## Next milestone

Batch entry completion and reconciliation workflow.
