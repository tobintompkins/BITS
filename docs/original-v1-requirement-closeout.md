# Original v1 requirement closeout

November 5, 2026. Source and documentation review for Core 24. No application
code, suite, isolated SQL, browser session, storage probe, restore, or
deployment was run for this note. Older dates below are the dates already
recorded in those evidence files. They are not new executions.

The May 2026 specification at
`/Users/tobytompkins/Documents/Church APP for BITS to serve /bits-design-spec.md`
and the repo copy `docs/bits-design-spec.md` are the same file: 1,283 lines,
Git blob `dc8876469916f4f42a759bcc8c25f2eeab6bf9f4`. Neither file was edited.
Staff routes in the running app omit the specification’s optional
`/org/[slug]` prefix. That prefix is allowed to vary by specification §6.3.

The November 5 status table that used to follow this note was replaced on
November 16, 2026. That earlier table said organizations were disabled and
that no `/select-organization` page existed. Both statements are stale.
The specification text was not changed.

## Reconciliation — November 16, 2026

No application code changed, and no test, restore, probe, or deployment was
run for this reconciliation. Marks are only **Complete**, **Unfinished**, or
**Deferred**. A mocked test does not complete a requirement. The checklist
in `docs/BITS_ROADMAP_TRACKER.md` is the single remaining-work list.

Evidence classes:

- **Historical browser** — November 11, `npm run test:e2e:acceptance`, 33 passed in 6.5 minutes including setup and cleanup, on isolated `bits_e2e`. Core 29 the same day, 10 passed including setup. Church A was removed on November 15. Not a current pass.
- **Current single-church browser** — November 16 First UPC of Saco on working `bits`. Not the two-church suite.
- **Current isolated SQL** — November 16 `anonymous-gift.integration.test.ts`, `ledger-lock.integration.test.ts`, and `statement-coverage.integration.test.ts`, each 1 file / 1 test on `bits_e2e`. Clerk was stubbed. Not Playwright.
- **Earlier isolated SQL** — Core 11C, Core 12, Core 23A, and Core 26A. Not rerun on November 16.
- **Mocked** — fake persistence, the mocked invitation provider, or the mocked storage adapter.
- **Schema** — stored fields or a database constraint. Not a runtime walkthrough.

## Functional requirements

| ID | Mark | Evidence class | Recorded evidence |
|---|---|---|---|
| FR-ORG-001 | Complete | Historical browser | Two churches coexisted and cross-church reads were denied |
| FR-ORG-002 | Complete | Historical browser; earlier isolated SQL | Church A could not read or change church B. Wrong-organization writes fail in the ledger and household SQL tests |
| FR-ORG-003 | Complete | Schema; historical browser | Organization fields exist. One fictional settings save included an isolated logo |
| FR-ORG-004 | Complete | Historical browser; earlier isolated SQL | Only the organization administrator could save. Core 23A: 1 file / 2 passed on `bits_e2e`. Logo-file cleanup stays outside the database commit |
| FR-ORG-005 | Complete | Historical browser; current single-church browser | The harness used Clerk organization ids. Saco’s stored id matched the owner’s only Clerk membership. `/select-organization` offered that church and opened the dashboard |
| FR-AUTH-001 | Complete | Historical browser; current single-church browser | The seven harness identities signed in through Clerk. The Saco session reached the dashboard and portal |
| FR-AUTH-002 | Complete | Schema; current single-church browser | `Donor` is unique on `(organizationId, userAccountId)`. The owner has one linked Saco donor and a different linked donor at First Community |
| FR-AUTH-003 | Complete | Historical browser | Staff permissions followed the five membership roles in the harness |
| FR-AUTH-004 | Complete | Historical browser; current isolated SQL; current single-church browser | Donor A1 opened only authorized published PDFs. Donor A2 was denied. The SQL test denied another donor, a non-recipient household member, and an ended membership. The Saco portal showed that donor only |
| FR-AUTH-005 | Complete | Schema; historical browser | Membership and audit rows store Clerk user and organization ids. The harness required those ids |
| FR-AUTH-006 | Complete | Historical browser | `ORG_ADMIN`, `TREASURER`, `DATA_ENTRY`, `REPORT_VIEWER`, and `DONOR` each signed in |
| FR-AUTH-007 | Deferred | Specification | Platform administration, custom roles, and MFA policy stay future work |
| FR-DONOR-001 | Complete | Historical browser | An organization administrator created an accountless donor. Deactivation that leaves gifts unchanged is mocked and was not in that browser case |
| FR-DONOR-002 | Complete | Schema; mocked | The named donor fields exist. The November 11 browser case saved a first and last name. Other field writes are service tests with mocked persistence |
| FR-DONOR-003 | Complete | Schema | The portal link is `Donor.userAccountId`. Donations are a separate relation. No recorded case linked an account to a donor who already had gifts |
| FR-HH-001 | Complete | Historical browser | One household settings save conflicted after another staff save. Directory create was not a Playwright case. `/households` remains the later member system |
| FR-HH-002 | Complete | Earlier isolated SQL; schema | Core 12 observed one open membership under lock contention. Partial unique index `household_memberships_one_open_per_donor` |
| FR-HH-003 | Complete | Earlier isolated SQL | Link, move, and end keep start and end history, including audit rollback. Those screens were not in the Playwright suite. Clerk was stubbed |
| FR-HH-004 | Complete | Current isolated SQL; historical browser | Individual total 0.40 and household total 1.00. Membership start and end days count. The preferred recipient opened the published household PDF; the other donor did not |
| FR-TYPE-001 | Complete | Historical browser | Core 29: treasurer create, edit, deactivate, and reactivate. Data entry and report viewers could read and could not save |
| FR-TYPE-002 | Complete | Historical browser; mocked | Core 29 checked “Normally tax-deductible.” `onlineGivingEnabled` is on the form and in mocked service tests. That browser run did not toggle it. Checkout is Phase 2 |
| FR-TYPE-003 | Complete | Historical browser | Deactivating the fund left new entry, and the recorded $15.00 allocation kept that fund |
| FR-BATCH-001 | Complete | Historical browser | Data entry created a draft batch |
| FR-BATCH-002 | Complete | Historical browser; schema; current isolated SQL | The browser entered name, offering date, and expected total. Core 29 saved deposit reference `SLIP-1`, then replaced it with `SLIP-2`. The November 16 SQL test used `SLIP-LOCK-1`. Remaining fields are on `OfferingBatch` |
| FR-BATCH-003 | Complete | Historical browser; current isolated SQL | The 33-test run reached reconciled. Core 29 reached locked. The SQL matrix walked all four statuses and rejected out-of-order transitions |
| FR-BATCH-004 | Complete | Historical browser; current isolated SQL | The browser recorded one identified split gift. The SQL test recorded one identified check and one anonymous cash gift. The anonymous browser case was not played |
| FR-BATCH-005 | Complete | Current isolated SQL; mocked | The SQL total stayed equal to the gifts. A reconcile or lock confirmation of 0.00 was rejected. Expected-total warnings are mocked and do not rewrite totals |
| FR-BATCH-006 | Complete for the v1 rule. Formal adjustments deferred | Current isolated SQL | After lock, create, edit, delete, reconcile, deposit, and a second lock were rejected and left the batch unchanged. The specification allows a formal adjustment ledger to wait |
| FR-DON-001 | Complete | Historical browser; current isolated SQL | One check with two category amounts was one gift. The SQL test stored two gifts, one identified and one anonymous |
| FR-DON-002 | Complete | Schema; historical browser; current isolated SQL | Donation fields exist. The browser entered check number 441. The SQL test checked donor, amount, and the anonymous flag. The server does not trust client totals |
| FR-DON-003 | Complete for cash, check, stock/noncash, and other. Card and ACH deferred | Owner decision | Core 15 kept manual CARD/ACH rejection. ACH has no writer. See `docs/original-v1-payment-method-assessment.md` |
| FR-DON-004 | Complete | Current isolated SQL | The identified gift was eligible for the donor statement. Household inclusion used membership days |
| FR-DON-005 | Complete | Current isolated SQL | The anonymous cash gift has no donor, is in the $15.00 batch total, and is excluded from donor-statement selection. That case was not a browser pass |
| FR-DON-006 | Complete | Historical browser; mocked | The split gift saved two allocations. The negative case, a gift with no allocation, is mocked |
| FR-DON-007 | Complete | Current isolated SQL; mocked | A 0.30 gift held 0.10 and 0.20 allocations. Equality is also mocked |
| FR-DON-008 | Complete | Historical browser | The batch gift form presents category amount rows. The specification allows that presentation |
| FR-DON-009 | Complete | Current isolated SQL; earlier isolated SQL | Draft edit and delete were audited. Rejected stale and locked calls left gifts, allocations, totals, and audits unchanged. Core 11C recorded one concurrent create |
| FR-REPORT-001 | Complete | Historical browser | Donation detail and batch reconciliation opened for authorized roles. Church B’s amount stayed out of church A. The full filter matrix was not rechecked. Donation detail is the report plus the batch screen |
| FR-REPORT-002 | Complete | Historical browser; mocked | Authorized roles received scoped CSV, and the export was audited. Denied roles received 403. Holding CSV back when the audit write fails is mocked |
| FR-STMT-001 | Complete | Current isolated SQL | Individual and household statements used the period. The prior December 31, the next January 1, anonymous gifts, and a test gift were excluded. This was not a browser generation |
| FR-STMT-002 | Complete | Historical browser; current isolated SQL | Portal cases 4 and 5 passed on November 11. The SQL test allowed the linked donor and denied the other three callers without access events. Household access is the preferred-recipient rule |
| FR-STMT-003 | Complete for the snapshot and totals | Current isolated SQL | Generation audits recorded both totals. Local PDFs were written and then deleted with the test organization. Church-approved wording is unrecorded and stays with launch |
| FR-STMT-004 | Unfinished | Historical browser and current isolated SQL for local files; mocked for the provider. November 16 preflight is not a live rehearsal | Local keys and files exist. The `s3v1:` adapter tests are mocked. The November 16 live probe and same-bucket restore passed on `bits-statements-test-hrqzaa`. That does not prove independent durable retention or an authorized application download. The November 17 public GitHub repository has 0 workflows. The revised R2 proposal was not created |
| FR-STMT-005 | Complete | Current isolated SQL; historical browser | Generation audits and two `DOWNLOADED` events were written. Denied downloads wrote none. The harness exported statement-access CSV without storage keys |
| FR-STMT-006 | Complete | Schema | Deductible amount and goods/services fields exist, and the statement footer is configurable. Approved footer text is the launch wording check |
| FR-AUDIT-001 | Complete | Historical browser | The administrator and treasurer opened giving audit. The other church’s sentinel stayed there. Direct URLs were denied. One settings change wrote an audit. Opening the page does not write a row |
| FR-AUDIT-002 | Complete | Schema; historical browser | Audit rows carry organization, actor, action, entity, id, timestamp, and metadata. The pages showed those stored rows in UTC |
| FR-AUDIT-003 | Complete | Current isolated SQL; historical browser | Download audits and the statement-access CSV |
| FR-AUDIT-004 | Complete | Schema | The audit repository creates and reads. Ordinary screens have no editor. Test `deleteMany` is cleanup |
| FR-PAY-FUTURE-001 | Deferred | Phase 2 | Stripe ids on `Donation`. No `PaymentTransaction` table is required for v1 |
| FR-PAY-FUTURE-002 | Deferred | Phase 2 | One-time test checkout exists. Recurring giving does not. Neither blocks v1 |
| FR-PAY-FUTURE-003 | Deferred | Phase 2 | Test checkout can select a fund. Live checkout is not a v1 gate |
| FR-PAY-FUTURE-004 | Deferred | Phase 2 | No recurring-plan writer |
| FR-PAY-FUTURE-005 | Deferred | Phase 2 | Fee coverage is absent |
| FR-PAY-FUTURE-006 | Deferred | Phase 2 | Test-mode webhooks can persist a gift. Live-mode events are ignored |
| FR-PAY-FUTURE-007 | Deferred | Phase 2 | No refund writer |

## Acceptance criteria that finish version 1

Specification §18.4 is still open because the two launch criteria are unfinished. The other six are complete on the evidence named here. Live invitation acceptance is deferred and sits outside these eight bullets; it remains part of §18.3 case 1 and §21.3.

| Criterion | Mark | Evidence |
|---|---|---|
| Two organizations and isolation tests | Complete | Historical browser, 33 passed. Not a current pass. Do not recreate Northside to refresh it |
| Clerk authentication and role-protected routes | Complete | Historical browser role matrix. Invitation acceptance is deferred separately |
| Household, donor, and offering-type maintenance is usable | Complete | Historical browser for donor create, one household settings conflict, and offering-type maintenance. Link, move, and end are earlier isolated SQL, not Playwright |
| Identified and anonymous entry, totals, and lock rules | Complete | Historical browser for the identified split, reconcile, and one lock. Current isolated SQL for the anonymous gift and the lock matrix |
| Reports, CSV, and individual/household PDFs | Complete | Historical browser for CSV and local portal PDFs. Current isolated SQL for statement boundaries. Local files only |
| PDF artifacts and access audits persist durably | Unfinished | Local files and access rows are evidenced. Provider recovery has not run |
| Railway deployment and production configuration | Unfinished | TEST is deployed. Production is not. Backups are not validated |
| Automated financial and authorization tests | Complete | Historical browser suite plus the November 16 SQL tests. Not rerun as a release candidate |

§18.3 cases 2 through 7 are complete on that same split of historical browser and current isolated SQL. Case 1 is complete for offering types and one membership change. Its invitation step is deferred. §18.1 and §18.2 behaviors executed by the November 16 SQL tests are complete as current isolated SQL. Matching unit tests that do not touch `bits_e2e` stay mocked.

## Operations, seed, and routes

| Topic | Mark | Finding |
|---|---|---|
| §15.1–15.2 and §15.4 security, decimal money, transactions, immutability, service boundaries | Complete | Money uses `Decimal(12, 2)`. Statements are replaced by void/reissue. The November 16 SQL tests used those rules. A full deployment security review is part of launch, not a missing ledger rule |
| §15.3 usability | Complete for the signed-in keyboard batch path | November 16, 2026 keyboard session on isolated Southside Chapel. The skip link now focuses main content. Details are in the remaining-work checklist. A screen reader was not operated. The source review and public `/visit` are not this result |
| §15.5 and §21 backups and separate environments | Unfinished | Core 20 restored fictional rows locally. Run id `2026110502432060350d59`. That evidence stays. November 17 restored empty `bits-test-db` into local `bits_test_schema_recovery_2026111717161546d41ce7`: 52 migrations, 75 tables, and 0 church rows. That is schema recovery only. A separate R2 download restored that empty schema into `bits_test_r2_restore_202611172052c4e1`. Three encrypted TEST archives remain in `bits-independent-backups` and were not decrypted. PITR is disabled. Daily cron `15 11 * * *` UTC is enabled for TEST Postgres only. A read-only missed-backup watch is enabled for 11:45 UTC. Its first scheduled run, `2026-11-19T11:45:00.000Z`, was not yet due on November 18. Manual drill `44370727249` failed as expected on synthetic day `1900-01-01` and changed no archive. GitHub recorded an on-site failure notice; inbox delivery is pending. GitHub skipping this watch is not detected by this watch. Production scheduling and statement-object recovery remain open |
| §17 development seed | Complete | The opt-in command plans Grace Community Church. Core 26A passed 1 file / 2 tests on the separate integration namespace. The persistent Grace rows were not applied. Default `npm run db:seed` still loads Demo Community Church. That unrun apply is not remaining launch or functional work |
| §14 report catalog | Complete | Donor, household, offering-type, donation-detail, batch reconciliation, and statement-access outputs passed in the historical browser or exist as the same catalog. Bulk statement email stays a future enhancement |
| §6.3 audit page | Complete | `/reports/giving-audit` passed for the administrator and treasurer on November 11. Security Activity stayed administrator-only |
| §6.1 organization choice | Complete | `/select-organization` is present. The November 16 Saco session offered only that church and kept it after reload. The specification applies the page where a person has a choice |
| §21.1 and §21.3 Railway and pre-production | Unfinished | TEST exists and was inspected. Daily TEST Postgres backups are scheduled at 11:15 UTC. Point-in-time recovery, production scheduling, and durable statement restore are not validated. Church-approved statement wording is unrecorded |
| §21.2 environment names | Unfinished | The names are documented. Live Railway values were not read |
| Later member, event, volunteer, and care modules | Deferred | They are outside original v1 |

## Remaining work

Use the single checklist in `docs/BITS_ROADMAP_TRACKER.md`. The signed-in keyboard pass for weekly batch entry is complete. The watch email is pending one owner check, so that alert check stays open. The launch gaps remain durable statement-provider recovery, including application statement storage and copy scheduling, production deployment, and production backup scheduling. Hosted signed-in acceptance stays deferred. TEST Postgres now has a daily independent schedule. The empty TEST schema restore is recorded and is not church-data recovery. Live invitation acceptance stays deferred. Do not recreate Northside.
