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
   `expectedTotal` / `donationCount` / `reviewVersion`) is rejected after the
   transaction recheck. A same-total donor, date, or allocation change increments
   `reviewVersion` and cannot ride a previous dialog.
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

Idempotency: the save button still disables while pending (usability only). Manual
gift CREATE now also uses one client `operationToken` per logical submission,
retained across timeout/retry and rotated only after confirmed success or a new
gift form. Uniqueness is `(organizationId, action, operationToken)`. The same
actor+token+canonical payload returns the original result. The same token with a
different payload, batch, or actor is `CONFLICT` without leaking details. Two
distinct tokens with identical gift details remain two gifts. Replay after lock
returns the historical result when still authorized and does not reopen the
batch. If the original gift was deleted, the token is `ALREADY_PROCESSED` and is
not recreated. Claim, gift, allocations, total, version, and audit commit in one
transaction. A failed validation or audit does not leave a successful token.
Successful `ledger_create_idempotency` rows are retained; there is no TTL or
automatic cleanup that would let a later retry create a duplicate. Gift delete
sets `donationId` null and later replays return already-processed. Batch or
church delete cascades the claim. Tokens and payload fingerprints are not written
to public logs or donation audit change lists.

## Repairs in this increment

1. **Stale transition confirmation.** Confirmations bind to the reviewed
   `recordedTotal`, `expectedTotal`, `donationCount`, and monotonic
   `reviewVersion`. Totals/count alone cannot authorize a same-total rewrite.
   Draft gift edit/delete also submit the expected revision.
2. **Draft gift correction.** FR-DON-009 requires audited modifications before
   lock. Update and delete are DRAFT-only, manual-only, church-scoped, and adjust
   `recordedTotal` by the exact difference.
3. **Durable create idempotency (Core 11A).** Manual gift CREATE claims
   `ledger_create_idempotency` in the same transaction as the gift write.

### Core 11A writers that increment `reviewVersion`

- Manual gift create / update / delete
- Draft batch header edit (`updateDraftOfferingBatch`)
- Complete entry, reconcile, deposit record/update, and lock

Stripe settlement, unmatched-online-gift, and financial correction-request writers
do not attach gifts to batches or mutate reviewed totals; they are out of this
review-version contract. Event check-in idempotency is event-scoped and was not
reused.

Additive migration `20261014200000_add_ledger_review_and_idempotency` is applied
to isolated `bits_e2e` with `npm run ledger:review-schema-setup`. Core 11B applied
the same checked-in migration to verified local loopback `bits` after a new
custom-format backup. A missing review column or create-idempotency table now
fails closed with an operator migrate message; unrelated database errors are not
relabeled as schema-not-ready, and runtime code never applies DDL.

### Core 11B confirmed repairs (October 19, 2026)

1. **Schema-not-ready mislabeled as a form error.** Missing `reviewVersion` or
   `ledger_create_idempotency` now returns `SCHEMA_NOT_READY` with operator copy
   pointing at `ledger:review-local-migrate` / `ledger:review-schema-setup`.
   Unrelated failures stay generic and still fail closed. Runtime never applies
   DDL.
2. **Create token lost on reload.** The new-gift form keeps one UUID in
   `sessionStorage` for the open batch, reuses it across timeout/retry/reload,
   and clears it only after confirmed success so the next new gift gets a new
   token.
3. **Local migrate refused an already-applied database.** The working migrate
   command now reports already-ready when history and shape match, and only
   calls `migrate deploy` when the pending set is exactly this additive
   migration.

No working-database reset. No live gifts, invitations, charges, or object-store
writes.

### Core 11C verification boundary (October 19, 2026)

Real SQL, including ledger concurrency, now runs only through
`npm run test:isolated` against dedicated `bits_e2e`. Ordinary `npm test` excludes
those suites and blocks Prisma construction unless the isolated child marker is
set. The isolated runner keeps the original working destination in
`BITS_WORKING_DATABASE_URL` so Core 07 working-versus-test comparison cannot
compare a retargeted `DATABASE_URL` with itself. Attendance fixtures own
per-run fictional churches instead of the oldest working church.

Eight recent check-in audits on working `bits` from earlier unguarded tests
were inventoried only and were not deleted. See `docs/test-database-isolation.md`.

### Core 11D connection guard (October 19, 2026)

Isolated readiness now checks the actual `DATABASE_URL` used by clients, not
only the isolated flag and `BITS_E2E_DATABASE_URL`. A marked child must keep
the original working destination in `BITS_WORKING_DATABASE_URL`. Cached Prisma
clients are rejected when the destination changes. Isolated Vitest runs fail
closed instead of skip-passing when that guard is not satisfied. Working
content fingerprints were unchanged; the eight earlier check-in audits were
not deleted.

## Remaining original gaps

- Live Clerk two-church browser acceptance, including this new Playwright spec
- Live invitation send/accept
- Live statement storage/restore
- Two-session household locking
- Formal locked-batch adjustment ledger (explicitly deferred by FR-BATCH-006)
- Administrative CARD/ACH recording without Stripe processing
- Deployment readiness

## Verification (October 14, 2026)

- Core 11: Full `npx vitest run`: 221 files / 1,642 tests passed, including isolated `bits_e2e` increment, add-versus-complete, and competing-reconcile cases.
- Core 11A: Full `npx vitest run`: 224 files / 1,670 tests passed, including isolated concurrent same-token create, replay after complete-entry, and same-total delete-and-replace. Lint, typecheck, `git diff --check`, Prisma validate, and production build passed. Isolated `bits_e2e` received `20261014200000_add_ledger_review_and_idempotency`. Working `bits` was not migrated.
- Core 11B: Full `npx vitest run`: 226 files / 1,681 tests passed, including isolated concurrent same-token create, replay after complete-entry, and same-total delete-and-replace. Lint, typecheck, `git diff --check`, Prisma validate, and production build passed. Working loopback `bits` received the additive review migration after `e2e/.local/backups/bits-core11b-before-ledger-review.dump`. Isolated `bits_e2e` was already ready and was not reapplied. Pre-existing data counts were unchanged; no operation claims were manufactured for historic gifts. A temporary production server returned 307 for unsigned `/batches`, `/batches/new`, and `/batches/corrections` and was stopped afterward.
- Core 11C: `npm test` 217 files / 1,543 passed, 62 skipped mixed-file database describes. `npm run test:isolated` 18 files / 163 passed against `bits_e2e`. Working fingerprints unchanged (336 audits, 24 events, 0 attendance actions, 2 memberships, 4 donations totaling 187.00, 0 batches). Eight earlier check-in audits were not deleted. See `docs/test-database-isolation.md`.
- Core 11D: Guard tests with fake URLs passed before any live SQL. `npm test` 218 files / 1,560 passed, 62 skipped. `npm run test:isolated` 18 files / 163 passed, 0 skipped. Working counts and content fingerprints unchanged. Eight earlier check-in audits were not deleted.
- Signed-in Playwright ledger journeys were not executed. Unsigned `/batches` still redirects to sign-in.
- No working-database gift edits, invitations, charges, or object-store writes.

Original v1 remains incomplete.
