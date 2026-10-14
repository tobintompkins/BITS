# Original v1 — Ledger workflow acceptance and repairs (Core 11)

October 14, 2026. This increment reviews the existing offering-batch, manual
donation, transition, deposit/lock, correction-request, contribution-report,
and statement-inclusion paths. It does not add a second ledger, payment
processing, a formal adjustment journal, or mark original version 1 complete.

## Requirement mapping

| Requirement | Existing runtime path | Evidence | Core 11 result |
|---|---|---|---|
| FR-BATCH-001–002 create/list draft batches | `offering-batch.service` + `/batches` | Service tests | Unchanged; still DRAFT-only create/edit |
| FR-BATCH-003 statuses | Transition + deposit/lock services | Integrity + transition tests | Snapshot-bound confirmations added |
| FR-BATCH-004 identified and anonymous gifts | `manual-batch-donation.service` | Service + validation tests | One Donation per gift, including split checks |
| FR-BATCH-005 calculated totals and expected warning | Integrity checker; complete-entry does not require expected; reconcile does | Integrity tests | Warnings do not rewrite totals |
| FR-BATCH-006 locked history | Draft-only mutations; correction requests do not mutate gifts | Service tests | Draft correction added; locked mutations still rejected |
| FR-DON-001–002 gift fields | `Donation` model + manual write schema | Validation tests | Client Stripe/org/total fields ignored |
| FR-DON-003 payment methods | Manual entry: CASH/CHECK/STOCK_OR_NONCASH/OTHER | Validation rejects CARD/ACH | CARD/ACH remain Stripe-reserved; not invented as admin processing |
| FR-DON-004–005 donor vs anonymous | `donorId` null when anonymous | Service tests | Anonymous cash counts in batch/report totals, not statements |
| FR-DON-006–007 allocations = total | Server-computed `sumMoneyAmounts` | `0.10+0.20=0.30` tests | One gift, not one gift per allocation |
| FR-DON-008 envelope language | UI “Fund allocations” | Existing form | Unchanged |
| FR-DON-009 audit before lock | Create audit existed; edit/delete were missing | New update/delete audits | Draft-only correction path added |
| Section 18.1 allocation/transition/permission tests | Existing unit tests + this increment | Vitest | Extended |
| Isolated concurrency | Was mocked only | New `bits_e2e` two-session tests | Increment, add-vs-complete, competing reconcile |

## Fictional journey exercised

1. Authorized staff create a DRAFT batch with offering date and optional expected total.
2. Record an identified CHECK split across two active funds, an anonymous CASH gift
   (`donorId=null`), and a STOCK_OR_NONCASH administrative record with staff-entered
   deductible `0.00`. BITS does not invent fair-market value or claim tax compliance.
3. `0.10 + 0.20` is stored as `0.30` with two allocations and one Donation.
4. Complete entry may proceed with an expected-total mismatch. Reconcile requires an
   exact expected/recorded match. A stale confirmation (`recordedTotal` /
   `expectedTotal` / `donationCount`) is rejected after the transaction recheck.
5. After lock, new gifts, draft edits, deletes, batch metadata edits, deposit edits,
   and transition rollback are rejected server-side. A correction request writes only
   `FinancialCorrectionRequest` rows.
6. Contribution detail/by-donor/by-household/by-fund views already count a split
   gift once and keep fund amounts on allocations. Batch reconciliation CSV keeps
   stored versus calculated variance. Statements already exclude anonymous and test
   gifts.

## Money, date, anonymous, and payment policy

- Amounts use `decimal.js` at currency scale 2. Client totals are ignored.
- Offering-date override still requires an explicit confirmation.
- Anonymous aggregate cash is a church total, not a personal contribution.
- CARD/ACH stay rejected on the manual form because Stripe records electronic gifts.
  Administrative CARD/ACH recording without processing is a separate remaining gap,
  not implemented here.
- Noncash/other notes are staff text only.

## Concurrency and lock order

Shared financial lock order, compatible with Core 09/10:

1. Organization `FOR UPDATE`
2. Offering batch `FOR UPDATE`
3. Donation/allocation writes, conditional `recordedTotal` increment, and status
   `updateMany`
4. Audit in the same transaction

The existing `updateMany` increment (`status = DRAFT`) is still the status guard.
A raw two-session increment of `10.00` and `20.00` must produce `30.00` before the
service-path creates are asserted. Entry versus complete-entry must end in an
allowed serial order: either ENTERED with no later gift, or DRAFT with both gifts.
Competing reconcile requests must leave exactly one RECONCILED row.

Idempotency: the save button disables while pending. Server create is **not**
idempotent. Repeated successful submits remain distinct gifts. No operation token
was added.

## Repairs in this increment

1. **Stale transition confirmation.** Confirmations now bind to the reviewed
   `recordedTotal`, `expectedTotal`, and `donationCount`. A later gift or total
   change cannot ride a previous dialog.
2. **Draft gift correction.** FR-DON-009 requires audited modifications before
   lock. Without edit/delete, a mistyped DRAFT gift could not be corrected. Update
   and delete are DRAFT-only, manual-only, church-scoped, and adjust `recordedTotal`
   by the exact difference.

No new Prisma migration. No working-database reset. No live gifts, invitations,
charges, or object-store writes.

## Remaining original gaps

- Live Clerk two-church browser acceptance, including this new Playwright spec
- Live invitation send/accept
- Live statement storage/restore
- Two-session household locking
- Formal locked-batch adjustment ledger (explicitly deferred by FR-BATCH-006)
- Administrative CARD/ACH recording without Stripe processing
- Server-side create idempotency token
- Deployment readiness

## Verification (October 14, 2026)

- Full `npx vitest run`: 221 files / 1,642 tests passed, including isolated `bits_e2e` increment, add-versus-complete, and competing-reconcile cases.
- Lint, typecheck, `git diff --check`, Prisma validate, and production build passed.
- Signed-in Playwright ledger journeys were not executed. Unsigned `/batches` still redirects to sign-in.
- No working-database gift edits, invitations, charges, or object-store writes.

Original v1 remains incomplete.
