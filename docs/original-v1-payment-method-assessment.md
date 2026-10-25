# Original v1 — Payment-method scope assessment (Core 15)

October 23, 2026. Requirements-to-code review only. No card entry, raw
payment credentials, checkout, recurring payments, refunds, or new
transaction models were added. The original specification at
`/Users/tobytompkins/Documents/Church APP for BITS to serve /bits-design-spec.md`
was read and not changed. Original version 1 is not complete.

A later embedded Cursor prompt is historical evidence, not authorization
to rebuild payments. Section 20.6 is a future-phase prompt.

## Plain-language conclusion

The ledger already records CASH, CHECK, STOCK_OR_NONCASH, and OTHER on
draft batches, and it already records Stripe **test** checkout gifts as
CARD after a verified webhook. Manual CARD/ACH entry is rejected on
purpose. An externally settled card or bank gift **cannot** be recorded
today without either calling it OTHER (or similar) or asserting a Stripe
checkout/payment-intent id.

That is **not** a confirmed original-v1 defect. FR-DON-003 lists all six
methods and immediately reserves Card/ACH “for future online giving or
administrative records until Phase 2.” Version-1 non-goals exclude live
Stripe. Security text forbids storing raw card or bank credentials.
Existing Phase 2 checkout/webhook code stays; it is not rebuilt here.

**Owner decision (October 23, 2026):** option 1 is selected. Manual
CARD/ACH stay rejected for original v1. External administrative CARD/ACH
is deferred. Do not add payment features or activate Stripe live events.
Existing Phase 2 test checkout/webhook stays unchanged.

## How FR-DON-003 is reconciled

| Source | Exact quote | Reading used here |
|---|---|---|
| FR-DON-003 | “Payment methods shall initially support `CASH`, `CHECK`, `CARD`, `ACH`, `STOCK_OR_NONCASH`, and `OTHER`.” | The enum and report filters support all six. Enum presence is not proof that staff may type CARD/ACH. |
| FR-DON-003 | “Card and ACH are reserved for future online giving or administrative records until Phase 2.” | CARD/ACH are held back for later online giving **or** later admin records. The sentence does not require v1 admin card/ACH entry. |
| §1.2 Non-goals | “Live Stripe checkout or recurring online payments.” | Live charging is out of v1. Existing checkout/webhook code is later Phase 2 work already present; do not remove it and do not treat it as v1 completion. |
| §2 Key decision | “Stripe is planned for Phase 2. Data structures and service boundaries must accommodate it.” | Reservation of Stripe ids on `Donation` is enough for v1. Dedicated `PaymentTransaction` tables were optional. |
| FR-PAY-FUTURE-001–007 | “Phase 2 shall use Stripe… A donation shall only be created or finalized after authoritative successful-payment confirmation from Stripe webhooks.” | Applies to **Stripe-processed** gifts. It does not authorize charging from a manual form, and it does not by itself forbid a later admin record of an already-received external gift. |
| §15.1 Security | “Do not store raw card or bank-account payment credentials; defer payment entry to Stripe-hosted flows in Phase 2.” | Manual CARD/ACH, if ever authorized, must record that money was already received. It must never collect PAN, CVV, or account numbers. |
| FR-BATCH-006 / future enhancements | Locked-batch formal adjustments are a future enhancement. | Unrelated. Draft edits plus audit remain the v1 correction path. |
| §20.4 historical prompt | “Support CASH, CHECK, CARD, ACH, STOCK_OR_NONCASH, OTHER” | Scaffold language. It is not current authorization to enable admin CARD/ACH or to rebuild the ledger. |
| §20.6 | Phase 2 Stripe prompt | Future work. Not this increment. |

Core 11 called administrative CARD/ACH a “remaining gap.” Core 15
reclassifies that line: it is an **owner policy decision**, not an
unambiguous missing v1 workflow.

## Can an external card/ACH gift be recorded without asserting Stripe processed it?

**No, not through the application.**

- The manual write schema accepts only `CASH`, `CHECK`, `STOCK_OR_NONCASH`,
  `OTHER`. Tests reject `CARD` and `ACH`.
- The batch form has those four options only.
- Create always stores `stripeCheckoutSessionId: null` and
  `stripePaymentIntentId: null` for manual gifts.
- Stripe persist writes `paymentMethod: "CARD"` **and** Stripe ids, and
  only from test-mode checkout.
- Schema allows `PaymentMethod.CARD` / `ACH` with null Stripe ids, but
  no staff path writes that combination.
- A treasurer can record the money as OTHER (or CHECK/CASH) with a note.
  That does not claim Stripe processed it, and it does not label the
  gift CARD/ACH.

A manual CARD/ACH row, if later authorized, is still **not** permission
to charge a card or bank account.

## Requirement map

Evidence levels: **code** = current source; **test** = automated
coverage; **spec** = original wording only.

| ID / section | Short exact quote | Code / tests | Current behavior | Evidence | Classification |
|---|---|---|---|---|---|
| FR-DON-001 | “one received gift, such as one envelope, check, cash gift, or future payment transaction” | `Donation`; `manual-batch-donation.service.ts` | One Donation per gift, including split allocations | code + test | implemented; live acceptance pending |
| FR-DON-002 | fields include “payment method, total amount, optional check number” | `prisma/schema.prisma` `Donation`; write schema | Manual create/edit persist those fields. Client Stripe/org/total values are ignored | code + test | implemented; live acceptance pending |
| FR-DON-003 enum | “initially support `CASH`, `CHECK`, `CARD`, `ACH`, `STOCK_OR_NONCASH`, and `OTHER`” | `enum PaymentMethod`; report filters | All six exist. Manual entry uses four. Stripe test persist uses CARD. ACH has no writer | code + test | implemented (enum); admin CARD/ACH **ambiguous/deferred** |
| FR-DON-003 reservation | “reserved for future online giving or administrative records until Phase 2” | `MANUAL_PAYMENT_METHODS`; `manual-batch-donation.test.ts` | CARD/ACH rejected on manual write | code + test + spec | **ambiguous/deferred** — owner choice below |
| FR-DON-006–007 | at least one allocation; sum equals total | `sumMoneyAmounts`; service tests `0.10 + 0.20 = 0.30` | Server computes total; client total ignored | code + test | implemented |
| FR-DON-009 / FR-BATCH-006 | no silent locked edits; formal adjustments deferred | draft-only update/delete; `FinancialCorrectionRequest` | Stripe gifts cannot be edited from batch entry even on DRAFT | code + test | implemented; formal adjustments deferred |
| §1.2 / FR-PAY-FUTURE-002 | no live Stripe / “Phase 2 shall use Stripe” | `member-stripe-giving.service.ts` `mode: "payment"`; webhook `LIVE_MODE_REJECTED` | Checkout session exists. Live webhook events are ignored. Recurring is absent | code + test | Phase 2 feature present; live payment **acceptance pending**; recurring **genuinely missing** (Phase 2, not v1) |
| FR-PAY-FUTURE-001 | “reserve a future relationship from a donation to a payment transaction” | `Donation.stripeCheckoutSessionId`, `stripePaymentIntentId`; schema comment that `PaymentTransaction` is reserved | Relationship reserved on Donation. No `PaymentTransaction` / `PaymentRefund` models | code | implemented as reserved columns; dedicated tables **ambiguous/deferred** (spec allowed either) |
| FR-PAY-FUTURE-006 | finalize only after verified Stripe webhook | `stripe-webhook.service.ts`; `persistStripeTestDonation` | Test `checkout.session.completed` is claimed, idempotent, tenant-scoped, then persisted. Live mode ignored | code + test | implemented for test Stripe; live settlement **acceptance pending** |
| FR-PAY-FUTURE-003 | offering type during checkout | Stripe persist + offering-type online flags | Test persist writes one allocation to the checkout fund | code + test | implemented for test path |
| FR-PAY-FUTURE-004–005, 007 | recurring, fee coverage, BITS refunds | no RecurringGivingPlan / PaymentRefund writers | Not present | code | genuinely missing — Phase 2, not a v1 gate |
| §15.1 credentials | “Do not store raw card or bank-account payment credentials” | no card/account fields on Donation or forms | No PAN/CVV/account capture found on manual or Stripe paths | code | implemented |
| FR-REPORT-001 | filter by “payment method as appropriate” | `CONTRIBUTION_REPORT_PAYMENT_METHODS`; `/reports` | Filters and CSV labels include CARD and ACH | code + test | implemented; live acceptance pending |
| FR-STMT / donor history | statement and portal gift lists | statement services `isTest: false`; portal shows `paymentMethod` | Identified non-test gifts, including CARD if present, can appear. Anonymous and test gifts are excluded from statements | code + test | implemented; live acceptance pending |
| Unmatched online gifts | (later operations, not original FR) | `unmatched-online-gift.service.ts` | Matches Stripe gifts (`stripeCheckoutSessionId` set, `donorId` null) to a donor. Does not change payment method or invent CARD/ACH | code + test | implemented later feature; keep |
| §22.5 corrections | “unlocked edits plus audit” vs formal adjustments | draft audited edit/delete; correction requests after lock | Unlocked path exists. Formal locked journal still deferred | code + spec | implemented for drafts; formal adjustments deferred |

## Current write paths

### Manual batch entry (original v1 ledger)

- Roles: `ORG_ADMIN`, `TREASURER`, `DATA_ENTRY` (`canAddBatchDonations`).
- Form: `components/batches/manual-donation-form.tsx` — CASH, CHECK,
  STOCK_OR_NONCASH, OTHER.
- Validator: `lib/validation/manual-batch-donation.ts`
  `MANUAL_PAYMENT_METHODS`. CHECK requires `checkNumber`; other methods
  reject a check number.
- Create: `createManualBatchDonation` stores Stripe ids as null,
  `isTest: false`, and fingerprints `paymentMethod` in the durable
  operation-token payload (`lib/batches/create-idempotency.ts`).
- Edit/delete: draft batch only; `reviewVersion` must match; Stripe
  gifts (`stripeCheckoutSessionId` or `stripePaymentIntentId` set) are
  `NOT_EDITABLE`.
- Provenance shown on the batch list as `source: "manual"` vs
  `"stripe"` from Stripe ids, not from payment method alone.

### Stripe-processed gifts (existing Phase 2 code; keep)

- `persistStripeTestDonation` always writes `paymentMethod: "CARD"`,
  Stripe ids, and `isTest: true`. It never writes ACH.
- Webhook supports `checkout.session.completed` only, claims
  `stripeEventId` uniquely, ignores live-mode events, and persists
  inside a transaction.
- Unmatched queue attributes Stripe gifts without a donor. Matching
  sets `donorId`; it does not record a new payment method.
- Manual create on the same batch does not rewrite those Stripe rows.

### What does not exist

- Administrative CARD/ACH without Stripe ids.
- Any application writer for `PaymentMethod.ACH`.
- Raw card/bank credential fields.
- Recurring plans, fee coverage, or BITS-initiated refunds.
- `PaymentTransaction` / `PaymentRefund` tables.

## If the owner chooses option 1 — retain Stripe-only CARD/ACH

Keep the four-method manual form and the CARD/ACH rejection tests.
Document for staff: electronic gifts that Stripe did not process may be
entered as OTHER with a note, or left until Phase 2 live settlement.
Do not add CARD/ACH options “for completeness.”

## If the owner chooses option 2 — authorize external already-received records

Do **not** implement this until that choice is explicit. Proposal only:

- Reuse `Donation` / `DonationAllocation` and the current draft-batch
  path. No new transaction model. No charges, refunds, emails, or
  webhooks.
- Allowed roles: same as today (`canAddBatchDonations`).
- Add CARD and ACH to the manual form **only** with an explicit
  “already received outside Stripe” control. Store a durable provenance
  that is not a Stripe id (for example `source: "external"` / note
  prefix). Leave `stripeCheckoutSessionId` and `stripePaymentIntentId`
  null.
- Reject any card number, expiry, CVV, routing, or account field if
  submitted. Copy must say this is not a charge.
- Stripe-created gifts stay immutable from batch entry. A manual
  CARD/ACH row must never later grow Stripe ids through this form.
- Keep Decimal allocation invariants, tenant scope, create
  operation-token fingerprint (include method + provenance), and
  `reviewVersion` invalidation on method or amount change.
- Audit payment method and provenance, not credential material.
- Reports and statements already understand CARD/ACH labels; include
  identified non-test external gifts the same way as other manual gifts.
- Tests that would be required: reject CARD/ACH without the external
  provenance flag; reject credential-looking fields; allocation sums;
  Stripe gift still `NOT_EDITABLE`; idempotent replay; other-org
  isolation; reports/statements include the new row without marking it
  Stripe-processed.

## What this increment did not do

- No live gifts, charges, refunds, emails, or webhooks.
- No working-`bits` writes and no isolated SQL.
- Clerk live acceptance remains deferred by the owner.
- Statement-storage probe/restore remains blocked without a designated
  TEST target.
- Invitation delivery and deployment remain open.
- Formal locked-ledger adjustments remain deferred.

## Verification (October 23, 2026)

Docs-only increment. Isolated SQL was not required. A production build
was not run and is not claimed.

| Check | Result |
|---|---|
| Focused payment/ledger/report tests | 8 files / 97 passed (`manual-batch-donation` validation and service, create idempotency, contribution report, Stripe webhook, Stripe test persist, unmatched gifts, member Stripe giving) |
| `npm test` | 222 files / 1,579 passed, 62 skipped |
| `git diff --check` | Passed |
| Isolated SQL | Not run |
| Production build | Not run |

## Owner-authorized v1 decision — October 23, 2026

The owner delegated the choice after the recommendation to retain current restrictions. Option 1 is selected for original v1: manual CARD/ACH remain rejected; staff retain CASH, CHECK, STOCK_OR_NONCASH and OTHER. This does not authorize charges or new payment features. ACH has no application writer; existing Stripe test CARD settlement remains unchanged. Administrative external CARD/ACH support is deferred, not implemented. The scope decision is resolved; live acceptance and original-v1 completion are not.

Core 16 continues as a deployment-readiness review, not a deploy. Clerk remains owner-deferred and storage recovery remains blocked on a designated test target.
