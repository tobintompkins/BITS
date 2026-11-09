# Original v1 — batch next-step guidance (Core 19)

November 2, 2026. Git HEAD `7787b2f`, plus uncommitted Core 18–18B, the
October 30 staff usability polish, and this guidance repair. This does not
certify a signed-in walkthrough, and it does not complete original version 1.

## What was wrong

The batch directory decided Reconcile and Lock from role, status, stored
expected/recorded equality, and whether a deposit date and reference were
present. Detail review uses `evaluateOfferingBatchIntegrity`: real gifts,
allocation sums, a positive recorded total, and deposit dates. An entered
batch with expected and recorded totals both `0.00` and no gifts could be
labeled **Reconcile** on the list, while review and the transition service
reject it. A reconciled row with a deposit on file could be labeled **Lock
batch** even when the deposit date or allocations would fail.

When no action flag was true, detail said no further action was available
for the user's role. A treasurer on an entered batch with unequal totals
saw a permissions message instead of the balance blocker.

## What staff see now

Directory and detail share `lib/batches/next-step.ts`. Role permission stays
separate from integrity.

| Situation | Directory | Detail |
|---|---|---|
| Draft the role can edit | **Enter gifts** | **Enter gifts**, with **Complete Entry** still available beside it when review allows |
| Draft the role cannot edit | **View only** | **View only** |
| Entered, role can reconcile | **Review batch** | **Reconcile** only when review passes. Otherwise the integrity message, not a role error |
| Entered, role cannot reconcile | **View only** | **View only**, even if the batch also fails review |
| Reconciled, no deposit, role can record one | **Record deposit** | **Record deposit** |
| Reconciled, deposit present, role can lock | **Review batch** | **Lock batch** only when review passes. A bad deposit date links to the deposit form. Gift or allocation problems say lock is unavailable and do not offer gift edits |
| Reconciled, role cannot deposit or lock | **View only** | **View only** |
| Locked | **Locked history** | **Locked history** |

**Review batch** links to the existing batch page. It does not mean reconcile
or lock will succeed.

The batch-page **Reconciliation report** link uses
`canViewBatchReconciliationReports`. Organization Admin, Treasurer, and
Report Viewer can see it. Data Entry cannot. The report route still applies
that helper and will deny a direct visit.

## Why the directory does not load gifts

`getOfferingBatchDirectory` still uses one paginated `findOfferingBatches`
select of batch columns. It does not query donations per row. Full integrity
needs every gift and allocation, so claiming Reconcile or Lock from the list
would be a weaker check than detail. Uncertain rows say **Review batch**.
Detail already calls `getOfferingBatchReview` once. Enter gifts and Record
deposit use the same role-and-status rules as review, so the list can name
those.

Transition, deposit, and lock services are unchanged. Confirmation dialogs,
`reviewVersion`, create idempotency, decimal totals, locked history, and the
manual CARD/ACH rejection stay as they were.

## Evidence

- Focused next-step, offering-batch directory, review/transition, deposit,
  integrity, and giving-permission tests: 6 files / 93 passed.
- `npm test`: 229 files / 1,625 passed, 62 skipped.
- Lint passed. Production build passed, then `tsc --noEmit` passed. The
  build still reports the existing member-document NFT warning.
- `git diff --check` passed. `docs/bits-design-spec.md` was left unchanged.
- No isolated SQL run. No working-database fixtures. No live Clerk session.

Passing these checks does not mean every screen, church, or concurrent edit
was exercised.

## Still open

Original v1 is incomplete. The next gate is live two-church Clerk acceptance.
Invitation send/accept, private statement-storage restore, and Railway remain
open. Signed-in keyboard and assistive-technology checks stay blocked without
Clerk. There is still no reopen or adjustment journal for entered and locked
batches. Manual CARD/ACH stay closed.
