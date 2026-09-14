# Offering Batch Deposit Tracking and Locking

Authorized financial leadership can record one deposit on a **RECONCILED**
offering batch and then permanently transition that batch from `RECONCILED` to
`LOCKED`. This increment supports only:

- Adding or updating deposit information while a batch is `RECONCILED`
- `RECONCILED` → `LOCKED`
- Viewing deposit and locking status

Reopening, unlocking, donation edits, deletions, financial corrections,
two-person approvals, multiple deposits, bank integrations, and Stripe refunds
or disputes are not included.

## Permission rules

Server actions and services enforce every rule. Hiding a button is not the
security boundary. Every query and mutation is scoped to the current
organization.

- Only `ORG_ADMIN` and `TREASURER` may add or update deposit information.
- Only `ORG_ADMIN` and `TREASURER` may lock a reconciled batch.
- `DATA_ENTRY` and `REPORT_VIEWER` may view deposit information but cannot
  modify it or lock a batch.
- `DONOR` and signed-out users cannot access staff batch workflows.

## Deposit validation

Deposit information is accepted only while the batch is still `RECONCILED`.
The browser may send only deposit date and deposit reference. Organization ID,
status, recorded total, expected total, and deposited amount are ignored.

Rules:

- Deposit date is required and must be a `YYYY-MM-DD` date.
- Deposit reference is required, trimmed, and limited to 80 characters.
- Blank strings are normalized to `null` before validation; a blank required
  reference is rejected.
- Deposit date cannot be before the batch offering date.
- Deposit date cannot be in the future.
- Recorded total must be greater than zero.
- Expected total must be present and equal recorded total exactly.
- The batch must still contain at least one donation.
- Every donation must have valid allocations that equal its total.
- The sum of donations must equal `recordedTotal`.

The deposited amount shown in the UI is the server `recordedTotal`. It is
never accepted from the browser.

## Single-deposit limitation

Each batch has one `depositDate` and one `depositReference`. Updating those
fields replaces the previous values. Multiple deposits, split deposits, and
bank-account records are not supported.

## Financial-integrity requirements

Deposit saves and locks re-read organization-scoped donations and allocations
and reuse the batch integrity checker. They require:

- at least one donation
- at least one allocation on every donation
- each donation’s allocation sum to equal `totalAmount`
- the sum of donation totals to equal `recordedTotal`
- `expectedTotal` present and equal to `recordedTotal`
- `recordedTotal` greater than zero

Locking also requires a present deposit date and deposit reference, and the
same deposit-date rules as a deposit save.

Totals are not changed. Automatic repair of mismatched totals is prohibited.

## Irreversible locking behavior

A batch may transition `RECONCILED` → `LOCKED` only after the financial and
deposit checks above succeed. Staff must confirm a dialog that states:

- Locking is permanent in the current workflow.
- Donations cannot be added or edited afterward.
- Deposit information cannot be changed afterward.
- Corrections require a future restricted correction workflow.

There is no unlock or reopen action. After lock, the detail page stays
viewable for permitted financial and reporting roles, shows a prominent
`LOCKED` badge, and explains that the batch is read-only. Donation lists,
totals, allocations, deposit information, and audit-supported history remain
visible. Edit, donation-entry, deposit-edit, completion, reconciliation, and
lock controls are hidden. Server services reject those mutations even if an
old form or URL is submitted.

## Transaction and concurrency protection

Deposit updates run in one database transaction:

1. Re-query the organization-scoped batch.
2. Require status `RECONCILED`.
3. Re-run financial-integrity checks.
4. Validate the deposit date against the offering date and the current date.
5. Conditionally update `depositDate` and `depositReference` only while status
   remains `RECONCILED` and `recordedTotal` still matches.
6. Create the audit event when values changed.
7. Commit both together.

Locking uses the same pattern and a conditional `updateMany` that requires
status `RECONCILED` before setting `LOCKED`.

If the batch becomes `LOCKED` or otherwise changes concurrently, the
conditional update count is zero, the request is rejected, and the
transaction rolls back. Two concurrent lock attempts produce exactly one
success. A concurrent deposit update cannot overwrite a newly locked batch.

## Audit behavior

Successful first deposit writes `RECORD_BATCH_DEPOSIT`. A later change writes
`UPDATE_BATCH_DEPOSIT`. No-change submissions write no audit event.

Successful locking writes exactly one `LOCK_OFFERING_BATCH` event.

Each event includes organization, actor, entity type `OfferingBatch`, entity
ID, and safe old/new deposit date and reference plus expected and recorded
totals. Lock events also include old status `RECONCILED` and new status
`LOCKED`. Donor identity, check numbers, notes, Stripe data, payment details,
bank-account information, and secrets are omitted.

A failed audit write rolls back the deposit update or lock transition. The
status or deposit change and the audit event succeed or fail together.

## Sensitive information that must not be stored

Deposit reference may contain only a safe bank deposit-slip number, internal
reference, or confirmation identifier. Bank-account numbers, routing numbers,
ABA/IBAN/SWIFT identifiers, donor data, check numbers, and Stripe secrets
must not be stored on these fields.

## Current limitations

- Batches cannot be reopened or unlocked.
- Donation editing and deletion are not included.
- Financial corrections and two-person approvals are not included.
- Only one deposit per batch is supported.
- Bank integrations are not included.
- Stripe refunds and disputes are unchanged.

## Next milestone

Restricted financial correction requests and two-person approvals.
