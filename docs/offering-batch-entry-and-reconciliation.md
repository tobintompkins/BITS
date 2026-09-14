# Offering Batch Entry Completion and Reconciliation

Authorized staff can finish data entry on a **DRAFT** offering batch and
authorized financial leadership can reconcile an **ENTERED** batch. This
increment supports only:

- `DRAFT` → `ENTERED`
- `ENTERED` → `RECONCILED`

Reopening, locking, deposits, donation edits, corrections, and two-person
approvals are not included.

## Permission rules

Server actions enforce every rule. Hiding a button is not the security
boundary.

- `ORG_ADMIN`, `TREASURER`, and `DATA_ENTRY` may mark a draft batch as
  `ENTERED`.
- Only `ORG_ADMIN` and `TREASURER` may mark an entered batch as `RECONCILED`.
- `DATA_ENTRY` cannot reconcile.
- `REPORT_VIEWER` may view statuses and integrity warnings but cannot change
  them.
- `DONOR` and signed-out users cannot access staff batch workflows.

## Allowed transitions

| From | To | Who |
|---|---|---|
| `DRAFT` | `ENTERED` | ORG_ADMIN, TREASURER, DATA_ENTRY |
| `ENTERED` | `RECONCILED` | ORG_ADMIN, TREASURER |

A draft cannot jump to reconciled. Reconciled and locked batches reject both
actions. Each action requires explicit confirmation.

## Financial-integrity checks

A reusable checker reads current database values and reports only safe codes:

- `NO_DONATIONS`
- `DONATION_WITHOUT_ALLOCATIONS`
- `ALLOCATION_TOTAL_MISMATCH`
- `BATCH_RECORDED_TOTAL_MISMATCH`
- `EXPECTED_TOTAL_REQUIRED`
- `BATCH_NOT_BALANCED`
- `INVALID_STATUS`
- `CONCURRENT_CHANGE`

Errors never include donor names, emails, check numbers, notes, or Stripe
references.

## Draft-entry completion behavior

Completing entry re-reads the organization-scoped batch, requires status
`DRAFT`, and requires:

- at least one donation
- at least one allocation on every donation
- each donation’s allocation sum to equal `totalAmount`
- the sum of donation totals to equal `recordedTotal`

It does **not** require `expectedTotal` to match. After success, donation entry
and draft editing stay unavailable because those actions still require
`DRAFT`.

## Reconciliation requirements

Reconciliation repeats the same donation-integrity checks, then also requires
`expectedTotal` to be present and to equal `recordedTotal` exactly. The
displayed difference must be zero. Totals are not changed. No deposit or lock
record is created.

## Transaction and concurrency protection

Each transition runs in one database transaction:

1. Re-query the organization-scoped batch.
2. Recalculate integrity from current donations and allocations.
3. Confirm the expected current status.
4. Conditionally update status only when the old status and the validated
   `recordedTotal` still match.
5. Write the audit event.
6. Commit both together.

If two staff members complete entry at once, only one succeeds. If
`recordedTotal` changes after the integrity read, the conditional update fails
with `CONCURRENT_CHANGE` and nothing is saved.

## Audit behavior

Successful `DRAFT` → `ENTERED` writes `COMPLETE_OFFERING_BATCH_ENTRY`.
Successful `ENTERED` → `RECONCILED` writes `RECONCILE_OFFERING_BATCH`.

Each event includes organization, actor, entity type `OfferingBatch`, entity
ID, old and new status, expected total, recorded total, and a safe integrity
summary. Donor identity, check numbers, notes, Stripe data, and payment
details are omitted. Failed validation writes no audit. A failed audit write
rolls back the status change.

## Why automatic total repair is prohibited

A mismatch means the recorded history is inconsistent. Silently rewriting
`recordedTotal` or `expectedTotal` would hide the error and break the audit
trail. Staff must correct the underlying donations or expected amount in a
later controlled workflow.

## Current limitations

- Batches cannot be reopened.
- `RECONCILED` → `LOCKED` is not implemented.
- Deposits, donation edits, deletions, corrections, and approvals are not
  included.

## Next milestone

Deposit tracking and reconciled-batch locking.
