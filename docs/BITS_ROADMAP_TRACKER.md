# BITS Roadmap Tracker

**Last updated:** November 16, 2026

**Current handoff:** November 16 reconciliation against the unchanged May 2026 specification. Original v1 is not complete. Live invitation acceptance stays deferred, and Northside stays retired. Anonymous gift entry, the ledger lock matrix, and individual/household statement boundaries are complete as current isolated SQL on `bits_e2e`, not as browser acceptance. The November 11 two-church browser result stays historical. The signed-in keyboard pass for weekly batch entry is recorded in the remaining-work checklist. No other original giving-workflow gap was found. Durable statement-provider recovery and Railway/deployment backups stay open. Working church data was unchanged. The reconciliation itself did not change application code. The later keyboard check changed only the staff skip-link target. The same day, the TEST app was deployed to `https://bits-test.up.railway.app` (deployment `7953e76b-25fe-41dd-b42e-34fcb3cf2747`, SUCCESS). Unsigned `/visit` returned 200, staff and portal routes redirected to `/sign-in`, and `/api/e2e/original-v1-target` returned 404. No signed-in TEST session was run.

**Prior handoff:** Live acceptance against isolated `bits_e2e` passed on November 11, 2026: `npm run test:e2e:acceptance` reported 33 passed in 6.5 minutes, including setup and cleanup. Later the same day, one authorized Church A Report Viewer invitation was submitted to Clerk Development from isolated `bits_e2e`. Clerk returned Forbidden and stored no invitation. No email was sent, received, or accepted. Church A’s own membership limit was then raised from 7 to 8; the instance default remains 7, all seven users remain, and no further invitation was sent. The live invitation server on port 3017 was stopped after the refusal. Core 29 then ran offering-type and batch-lock browser cases on a new isolated server: 10 passed in 2.7 minutes, including setup. That count does not include the earlier 33. Owned fixture rows were cleaned afterward, that server was stopped, and the working app on port 3000 was left running. Working-database fingerprints were unchanged. On November 13, 2026 the owner approved one new attempt. The failed local row was revoked through the product first; that revoke had no provider id and did not email. One Church A Report Viewer invitation was then submitted. Clerk Development has one pending invitation for Church A and none for Church B. The recipient has not accepted it. Local Railway TEST preparation is still written and not applied. Storage recovery has not been run. Original v1 is incomplete and is not launch-ready.
**Status basis:** Source and Git on November 16, 2026; HEAD `8621a9d` plus the existing uncommitted work. This update reconciles recorded evidence only. It did not rerun the Core 20 restore, the November 11 33-test suite, the Core 29 browser suite, the November 16 SQL tests, or the storage probe. `docs/bits-design-spec.md` was not edited. Requirement rows are in `docs/original-v1-requirement-closeout.md`.

## First UPC of Saco setup — November 15, 2026

Owner-confirmed clean church setup has been applied: a new First UPC of Saco organization, existing owner ORG_ADMIN membership, and Clerk Development mapping. All pre-existing records remain unchanged. Public church identity is explicitly configured; unresolved staff/portal sessions can choose their Clerk-linked church at `/select-organization`. The November 16 check confirmed the stored mapping and stopped at the unsigned Clerk sign-in screen. Railway was not changed. See `docs/first-upc-of-saco-setup.md`. This is not completion of original v1.

## Saco access verification — November 16, 2026

Read-only working `bits` still has three churches. First UPC of Saco is active, slug `first-upc-of-saco`, and its stored Clerk organization matches the owner’s only Clerk membership, role `org:admin`. The owner’s BITS membership is active `ORG_ADMIN`. One active Saco donor is linked to that account, with zero gifts and zero statements. First Community Church still has the same account as `ORG_ADMIN`, a different linked donor, and the four existing gifts. Demo Community Church is unchanged. No working row was written.

`BITS_PUBLIC_ORGANIZATION_SLUG` is `first-upc-of-saco`. Unsigned http://localhost:3000/, `/give`, and `/church-events` returned 200 and showed First UPC of Saco. The homepage prayer wall was empty, and public events showed the empty state rather than a legacy event. The existing dev server was reused. No migration ran.

After the owner signed in, `/select-organization` offered only First UPC of Saco. Choosing it opened `/dashboard`. A reload kept the header “First UPC of Saco · Organization Admin.” The staff donor list for Saco contained the owner’s linked donor, and the donor page said “Connected to a portal account.” `/portal` showed the same church and donor, zero gifts for 2026, and “No published statements are available yet.” The unconnected-record notice was absent. `/portal/gifts` showed no recorded gifts. The Saco contribution report for 2026-01-01 through 2026-11-16 showed 0 gifts, and its donor list contained only the Saco donor. First Community did not appear on these pages. Selecting the church changed the Clerk session only. No donor, gift, or church row was written.

Focused resolver, public-church, saved-choice, portal, and donor tests passed: 5 files / 45 tests. Typecheck and `git diff --check` passed. No application code changed, so no production build ran. The missing-Church-A suite was not run. Original v1 is not complete.

## Northside Chapel removal — November 15, 2026

The owner authorized removal of only fictional Northside Chapel. Its Clerk Development name was `E2E07 Northside Chapel`, and that id was the active Church A configuration. The personal account was a member of First UPC of Saco only. Working `bits` did not reference the Northside id. Southside remained `E2E07 Southside Chapel`.

Before deletion, isolated `bits_e2e` was backed up to gitignored `e2e/.local/backups/bits_e2e-before-northside-removal.dump` (394,588 bytes). A scratch restore of that archive contained Northside and was then dropped. The one pending Northside invitation was revoked. The Clerk organization then returned 404. The isolated organization row was deleted, cascading its 7 memberships, 3 staff invitations, and 40 audit events. Those audit rows remain in the backup. Eight isolated user accounts remained, including no personal-account row. Southside and the two older isolated fixture churches remained.

The active `E2E_CLERK_ORG_A_ID` setting was removed. With the acceptance flag set, preflight reports only that missing name and `readyForLiveAcceptance: false`. The two-church test code was preserved and was not skipped or rerun. Live invitation acceptance is deferred, not passed. The missing Church A setting does not block other original-roadmap work. The BITS Clerk application, First UPC linkage, Southside, working `bits`, and Railway were not changed. Original v1 is not complete.

## How to read this tracker

- **Implemented:** relevant application code exists; this does not certify runtime behavior, production deployment, or every acceptance criterion.
- **Historical verification:** a dated verification record exists; it is not a fresh test of today's code.
- **In progress:** local changes exist but verification/integration is outstanding.
- **Partial / remaining:** some supporting code exists, but the full requested capability is not established.
- **Not evidenced:** no dedicated implementation was identified in this bounded review; retain the requirement rather than assuming it was cancelled.

Patch packages contain Cursor instructions and are not, by themselves, proof of implementation. No overall completion percentage is assigned.

## Original May 2026 baseline — now supplied by the owner

Primary source: **BITS — Bring In The Sheaves, Product and Technical Design Specification, version 0.1, May 2026**, supplied September 30 from `/Users/tobytompkins/Documents/Church APP for BITS to serve /bits-design-spec.md`. This supersedes the earlier assumption that July conversations were the earliest available roadmap. The supplied source is preserved unchanged. Embedded Cursor prompts describe historical implementation plans; they are not new authorization to build those features.

**Original product:** a multi-tenant charitable-giving application. Version 1 covers organizations, staff roles, donors (including people without accounts), donor household history, offering types, batches, gift allocations, contribution reports, archived statements and a private donor portal. Stripe payment lifecycle is Phase 2. The later member/event/volunteer/child-safety/CMS vision is additional scope, not the original version-one completion gate.

### Original delivery phases compared with current evidence

| May phase / requirement | Current assessment | Evidence and remaining acceptance |
|---|---|---|
| Phase 0 — architecture, database, Clerk, policies, audit, testing, Railway test deployment | Foundation present; TEST app is deployed and Postgres is migrated. Production and backups remain open | Core 17A pins Node 24 engines and verifies isolated `/visit` 200 / e2e 404. On November 16, `bits-test` / `test` service `bits` is deployed at `https://bits-test.up.railway.app` and uses migrated Postgres `bits-test-db`. Unsigned smoke passed. The statement bucket remains unused by the app. See `docs/original-v1-railway-test-setup.md`. |
| Phase 1A — organization and original staff roles (`FR-ORG-*`, `FR-AUTH-*`) | Complete for the November 11 role and tenant cases, which are historical browser evidence. Live invitation acceptance is deferred | Organization settings, membership schema, role codes and permission helpers exist. Core 07/07A add a fail-closed authenticated role/tenant harness and stop login-time admin auto-provisioning (`docs/original-v1-role-tenant-acceptance.md`). Core 09 adds authorized role/status edits for existing original-role staff memberships (`docs/original-v1-staff-membership-administration.md`). Core 10 adds mocked staff invitations and explicit acceptance (`docs/original-v1-staff-invitations.md`). On November 11, 2026 the live harness passed on isolated `bits_e2e`, including two-church isolation, the five roles, one membership change, and the invitation form left unsent. A later authorized Church A Report Viewer send was refused by Clerk with Forbidden. On November 13 one new Church A Report Viewer invitation was submitted after the failed local row was revoked. On November 15 that pending invitation was revoked and fictional Northside Chapel was removed. On November 16 live invitation acceptance was deferred. It was not passed, and the missing Church A setting does not block other original-roadmap work. The two-church test code remains. It was not rerun. |
| Phase 1A — donors independent of accounts (`FR-DONOR-001–003`) | Complete. The November 11 browser run created an accountless donor. Field coverage beyond that name is schema and mocked service tests | `/donors`, `/donors/new` and `/donors/[id]` now provide paginated search, active/inactive filters, accountless creation, contact/address/preferences/notes editing and deactivation. Donor detail now shows giving-household history. Full workflow acceptance remains. See `docs/donor-management-core.md`. |
| Phase 1A — donor households/history (`FR-HH-001–004`) | Complete. Earlier isolated SQL covers link, move, and end. The November 11 browser run recorded one settings conflict and did not walk directory create, link, move, or end | `/giving-households` directory, create/edit, link/move/end, and donor-detail history. 03A adds atomic `updatedAt` settings writes, household-then-donor sorted locks, searchable 25-row donor/household pickers, and server-derived donor/household revalidation. Core 12/12A verify those writers under observed two-session lock contention on isolated `bits_e2e`. Partial unique index `household_memberships_one_open_per_donor` remains. Member-household screens at `/households` remain a separate system. The November 11 live run recorded one signed-in household conflict. Directory create, link, move, and end acceptance remains. See `docs/donor-household-history.md` and `docs/original-v1-household-concurrency.md`. |
| Phase 1A — offering-type administration (`FR-TYPE-001–003`) | Core maintenance implemented; one live browser path passed | `/offering-types`, `/offering-types/new` and `/offering-types/[id]` provide paginated name/code search, active/inactive/all filters, create/edit, tax/online flags, immutable nonempty codes, and deactivate/reactivate that preserves allocations. On November 11, Core 29 recorded a treasurer create, edit, deactivate, and reactivate on isolated `bits_e2e`. The deactivated fund left new gift entry and the recorded $15.00 allocation kept its fund. Data entry and report viewers could read and could not save. The donor and the other church were denied. Stripe checkout was not part of that run. See `docs/offering-type-administration.md`. |
| Phase 1B — batches, gift/allocation entry, reconcile/lock (`FR-BATCH-*`, `FR-DON-*`) | Complete for cash, check, stock/noncash, and other. Identified entry is historical browser evidence. Anonymous entry and the lock matrix are current isolated SQL. Manual CARD/ACH is deferred | Core 11/11A/11B review the existing ledger: snapshot-bound complete/reconcile/lock, monotonic `reviewVersion`, draft-only audited gift correction, durable create idempotency, and operator-facing schema-not-ready handling. Core 15 confirms manual CARD/ACH rejection is intentional and not an unambiguous v1 defect. Owner delegated the decision; current restrictions are retained for v1 and administrative external CARD/ACH is deferred. Core 11C keeps ledger concurrency on isolated `bits_e2e`. The November 11 live run recorded a Data Entry draft batch, a split gift, complete entry, and a treasurer reconcile. The donor could not open staff batch routes. Lock was not part of that 33-test run. Core 29 later recorded deposit, a rejected stale lock, one successful lock, an unchanged $18.00 allocation, one `LOCK_OFFERING_BATCH` audit, and a rejected deposit after lock. On November 16 an isolated SQL test covered create, edit, delete, reconcile, deposit, and lock against the existing role and status rules, including stale confirmations. That run was not Playwright. See `docs/original-v1-ledger-acceptance.md`, `docs/original-v1-payment-method-assessment.md`, and `docs/test-database-isolation.md`. |
| Phase 1C — giving reports and CSV (`FR-REPORT-001–002`, section 14) | Catalog views/exports implemented; live role checks passed for the harness cases | `/reports` provides donation-detail, donor, giving-household and offering-type views plus matching audited CSV. `/reports/batch-reconciliation` adds the batch worksheet, CSV and print view. `/reports/statement-access` adds the restricted access-event report and CSV. Attendance reports and church-data export remain separate. The November 11 live run recorded treasurer and report-viewer exports and denied the roles that must not export. The full catalog was not rechecked. See `docs/contribution-reports.md` and `docs/report-catalog-exports.md`. |
| Phase 1C — statements and donor portal (`FR-STMT-*`) | Local statement behavior is complete: historical portal PDFs plus current isolated SQL boundaries. Durable provider recovery is unfinished | Individual/household generation, publication, registry, void/reissue, gifts and authorized PDF access services exist. Local legacy PDF keys remain valid. New writes can use a private S3-compatible backend (`s3v1:` references) when configured. The November 11 live run recorded donor A1 opening only authorized published PDFs and donor A2 being denied those files. Core 08/14 add a fail-closed synthetic probe/restore against a designated test target, with bounded unsigned-privacy checks and run-owned cleanup manifests. Mocked adapter/probe tests passed. The November 16 live bucket rehearsal is recorded in the remaining-work list. No migration or production restore has been verified. On November 16 an isolated SQL test covered statement date boundaries, household membership days, anonymous and test exclusion, Decimal totals, donor download denials, and generation/download audits. It wrote local PDFs only. Durable provider recovery remains open. See `docs/private-statement-storage.md`, `docs/statement-storage-recovery.md`, and `docs/original-v1-storage-verification.md`. |
| Audit (`FR-AUDIT-001–004`) | Original giving workflows reviewed; November 11 live giving-audit and settings cases passed | Core 25 adds `/reports/giving-audit`. Security Activity stays administrator-only. Core 23 and 23A keep settings, the logo key, and the audit on one transaction. The November 11 live run recorded the administrator and treasurer giving-audit cases, the other church's sentinel, direct-URL denials, and one fictional organization-settings change with an isolated logo. See `docs/original-v1-audit-coverage.md`. |
| Phase 1D — hardening and launch | Not established complete | Core 16/17/17A document readiness, rollback, Railway TEST setup, and local unsigned HTTP smoke. Core 18 adds a staff handbook and bounded source accessibility review with narrow original-v1 repairs. On November 16 the TEST app deploy succeeded and unsigned `/visit`, sign-in redirects, and the e2e 404 were checked. Signed-in TEST use was not run. The November 11 live Clerk harness passed. Invitation send/accept and provider backups remain open. The signed-in keyboard pass for weekly batch entry is recorded in the remaining-work checklist. A screen reader was not operated. Formal locked-ledger adjustments and Phase 2 payments stay deferred. See `docs/original-v1-staff-handbook.md` and `docs/original-v1-accessibility-review.md`. |
| Phase 2 — one-time Stripe gifts | Implementation present; payment acceptance outstanding | Member checkout uses `mode: "payment"`; verified/idempotent webhook persists test gifts as CARD. Live-mode webhook events are ignored. Live deployment/payment success not verified here. See `docs/original-v1-payment-method-assessment.md`. |
| Phase 2 — recurring gifts, fee coverage, transactions/refunds (`FR-PAY-FUTURE-*`) | Remaining / not established | Weekly/monthly giving, optional fee coverage, payment lifecycle review, BITS-initiated refunds and statement impacts require implementation or evidence. Dedicated payment/recurring/refund models were not identified in the reviewed schema. Not original v1 blockers. |

### Version-one completion gate (original section 18.4)

Original version 1 is **not complete**. Launch items 6 and 7 are unfinished. Live invitation acceptance is deferred and is not a pass.

1. **Complete — historical browser.** Two organizations coexisted and isolation passed on November 11 (`npm run test:e2e:acceptance`, 33 passed in 6.5 minutes, including setup and cleanup, on isolated `bits_e2e`). Church A was removed on November 15. That result is not a current pass. Northside stays retired, so this reconciliation does not require a replacement church.
2. **Complete — historical browser, with invitation acceptance deferred.** The same run passed staff and donor authentication and the five original roles. The invitation form was left unsent. Explicit provider acceptance was not completed and is deferred.
3. **Complete — mixed evidence.** The November 11 run created an accountless donor and recorded one giving-household settings conflict. Core 29, the same day, created, edited, deactivated, and reactivated one offering type (10 passed, including setup). Directory create, link, move, and end were not in those browser runs. Those writers passed earlier as isolated SQL on `bits_e2e` (Core 12, Clerk stubbed).
4. **Complete — historical browser plus current isolated SQL.** The 33-test run recorded one identified split gift through reconcile. Core 29 locked one reconciled batch and kept its $18.00 allocation. On November 16, `anonymous-gift.integration.test.ts` and `ledger-lock.integration.test.ts` each passed 1 file / 1 test on `bits_e2e`. Those runs stubbed Clerk and were not Playwright. Manual CARD/ACH stays deferred.
5. **Complete — historical browser plus current isolated SQL.** The November 11 run passed the harness CSV exports and local portal PDFs. On November 16, `statement-coverage.integration.test.ts` passed 1 file / 1 test for individual and household boundaries, Decimal totals, donor denials, and generation/download audits. It wrote local PDFs only.
6. **Unfinished — launch.** Local PDF files and access audits are evidenced. Durable statement-provider recovery has not run (`executionKind=none`).
7. **Unfinished — launch.** November 17 empty-schema recovery passed for `bits-test-db` into local `bits_test_schema_recovery_2026111717161546d41ce7`. It restored 52 migrations and 75 tables, with every church count at 0. Railway point-in-time recovery is still disabled, and no backup bucket is wired. Production scheduling, real church-record recovery, and statement-object recovery are not validated. Core 20 was one local synthetic restore and is not this rehearsal.
8. **Complete — historical browser plus current isolated SQL.** The November 11 suite and the November 16 SQL tests cover the recorded financial and authorization cases. They were not rerun as a release candidate, and no Railway release candidate exists.

### Original v1 requirement reconciliation — November 16, 2026

The May 2026 specification is unchanged. Each original functional requirement is marked **Complete**, **Unfinished**, or **Deferred**. Mocked tests do not by themselves complete a requirement. Detailed wording and citations are in `docs/original-v1-requirement-closeout.md`.

Evidence classes:

- **Historical browser** — November 11 acceptance suite, 33 passed including setup and cleanup; Core 29 offering-type and batch-lock suite, 10 passed including setup. Both used isolated `bits_e2e`. Church A no longer exists. Not a current pass.
- **Current single-church browser** — November 16 First UPC of Saco check on working `bits`. One signed-in church. Not the two-church suite.
- **Current isolated SQL** — November 16 anonymous-gift, ledger-lock, and statement-coverage tests. Clerk was stubbed. No Playwright browser was opened.
- **Earlier isolated SQL** — Core 11C ledger concurrency, Core 12 household link/move/end, Core 23A organization settings, and Core 26A fixture integration. Not rerun on November 16.
- **Mocked** — unit or service tests with fake persistence, the mocked invitation provider, or the mocked storage adapter.
- **Schema** — a database constraint or stored fields. Not a runtime walkthrough.

| ID | Mark | Evidence |
|---|---|---|
| FR-ORG-001 | Complete | Historical browser: two churches and cross-church denial |
| FR-ORG-002 | Complete | Historical browser: church A could not read or change church B. Earlier isolated SQL also rejects the wrong organization |
| FR-ORG-003 | Complete | Schema fields. Historical browser: one fictional settings save, including an isolated logo |
| FR-ORG-004 | Complete | Historical browser: only the organization administrator could save. Earlier isolated SQL: Core 23A, 1 file / 2 passed. File cleanup remains separate from the database commit and is not a second product workflow |
| FR-ORG-005 | Complete | Historical browser used Clerk organization ids. Current single-church browser: Saco’s stored Clerk id matched the owner’s only Clerk membership, and `/select-organization` opened that church |
| FR-AUTH-001 | Complete | Historical browser Clerk sign-in. Current single-church browser: Saco sign-in reached the dashboard and portal |
| FR-AUTH-002 | Complete | Schema unique `(organizationId, userAccountId)`. Current single-church browser: the owner has one linked Saco donor and a different linked donor at First Community |
| FR-AUTH-003 | Complete | Historical browser role matrix |
| FR-AUTH-004 | Complete | Historical browser: donor A1 opened only authorized published PDFs and donor A2 was denied. Current isolated SQL: other donors, a non-recipient household member, and an ended membership were denied. Current single-church browser: the Saco portal showed that donor and no other church |
| FR-AUTH-005 | Complete | Schema links Clerk user and organization ids. The historical browser run required those stored ids |
| FR-AUTH-006 | Complete | Historical browser exercised `ORG_ADMIN`, `TREASURER`, `DATA_ENTRY`, `REPORT_VIEWER`, and `DONOR` |
| FR-AUTH-007 | Deferred | Specification future work: platform administration, custom roles, and MFA policy |
| FR-DONOR-001 | Complete | Historical browser: an organization administrator created an accountless donor. Deactivation behavior is mocked and was not part of that browser case |
| FR-DONOR-002 | Complete | Schema holds the named fields. The November 11 browser case saved a first and last name. The remaining field writes are mocked service tests |
| FR-DONOR-003 | Complete | The portal link is `Donor.userAccountId`. Donation rows are a separate relation. No recorded case linked an account to a donor who already had gifts |
| FR-HH-001 | Complete | Historical browser: one household settings save and a stale-form conflict. Directory create was not a Playwright case |
| FR-HH-002 | Complete | Earlier isolated SQL: one open membership under observed lock contention. Partial unique index `household_memberships_one_open_per_donor` |
| FR-HH-003 | Complete | Earlier isolated SQL: link, move, and end keep start and end history, including audit rollback. Those screens were not in the Playwright suite |
| FR-HH-004 | Complete | Current isolated SQL: individual total 0.40 and household total 1.00, with membership start and end days included. Historical browser opened a published household PDF for the preferred recipient only |
| FR-TYPE-001 | Complete | Historical browser, Core 29: treasurer create, edit, deactivate, and reactivate. Data entry and report viewers could read and could not save |
| FR-TYPE-002 | Complete | Historical browser set “Normally tax-deductible.” The online-availability flag is on the form and in mocked offering-type service tests; that browser run did not toggle it. Checkout is Phase 2 |
| FR-TYPE-003 | Complete | Historical browser: a deactivated fund left new entry, and the recorded $15.00 allocation kept that fund |
| FR-BATCH-001 | Complete | Historical browser: data entry created a draft batch |
| FR-BATCH-002 | Complete | Historical browser entered name, offering date, and expected total. The remaining batch fields are schema and ledger service coverage |
| FR-BATCH-003 | Complete | Historical browser walked draft, entered, and reconciled. Core 29 reached locked. Current isolated SQL walked draft, entered, reconciled, deposited, and locked, and rejected out-of-order transitions |
| FR-BATCH-004 | Complete | Historical browser recorded one identified split gift. Current isolated SQL recorded one identified check and one anonymous cash gift |
| FR-BATCH-005 | Complete | Current isolated SQL kept the batch total equal to the gifts and rejected a reconcile or lock confirmation that submitted 0.00. Expected-total warnings are mocked integrity tests and do not rewrite totals |
| FR-BATCH-006 | Complete for the v1 rule. Formal adjustments are deferred | Current isolated SQL rejected create, edit, delete, reconcile, deposit, and a second lock after the batch was locked. The specification allows formal adjustment entries to wait |
| FR-DON-001 | Complete | Historical browser: one check with two category amounts became one gift. Current isolated SQL: one identified gift and one anonymous gift |
| FR-DON-002 | Complete | Schema fields. Current isolated SQL checked donor, amount, and anonymous flag. Check number 441 was entered in the historical browser split gift |
| FR-DON-003 | Complete for cash, check, stock/noncash, and other. Card and ACH recording is deferred | The owner kept manual CARD/ACH rejection in Core 15. ACH has no writer. This is not a v1 defect |
| FR-DON-004 | Complete | Current isolated SQL included the identified gift and excluded the anonymous gift from donor-statement selection. Household inclusion follows membership days in the same statement test |
| FR-DON-005 | Complete | Current isolated SQL: the anonymous cash gift has no donor, counts in the $15.00 batch total, and is excluded from donor-statement selection |
| FR-DON-006 | Complete | Service validation requires one allocation. The historical browser split gift saved two rows. This invariant’s negative case is mocked |
| FR-DON-007 | Complete | Current isolated SQL kept a 0.10 plus 0.20 allocation pair inside a 0.30 gift. The equality check is also mocked |
| FR-DON-008 | Complete | Historical browser used category amount rows on the batch gift form. The specification permits that presentation |
| FR-DON-009 | Complete | Current isolated SQL: draft edit and delete were audited, and every rejected locked or stale call left gifts, allocations, totals, and audits unchanged. Earlier isolated SQL covers one concurrent create |
| FR-REPORT-001 | Complete | Historical browser opened donation detail and batch reconciliation and kept church B’s sentinel out of church A. The full filter matrix was not rechecked |
| FR-REPORT-002 | Complete | Historical browser: authorized roles received scoped CSV, the export was audited, and denied roles received 403. A failed audit holding back CSV is mocked |
| FR-STMT-001 | Complete | Current isolated SQL generated individual and household statements for the period and excluded the prior day, the next day, anonymous gifts, and a test gift |
| FR-STMT-002 | Complete | Historical browser portal authorization. Current isolated SQL: the linked donor downloaded the published individual statement; another donor, a non-recipient member, and an ended preferred recipient were denied and wrote no access event |
| FR-STMT-003 | Complete for the generated snapshot and totals | Current isolated SQL recorded the two totals. Church-approved wording has not been recorded and stays with launch, not as a missing generator |
| FR-STMT-004 | Unfinished | Local PDF keys and files are evidenced by the historical browser and the November 16 SQL test. The optional `s3v1:` adapter is mocked only. The read-only probe before the bucket existed returned `targetKind=unconfigured`, `executionKind=none`, exit 2. On November 16 the live probe `--apply` and restore `--apply` passed against `bits-statements-test-hrqzaa`. That same-bucket rehearsal is not durable independent recovery |
| FR-STMT-005 | Complete | Current isolated SQL wrote generation audits and `DOWNLOADED` for the two successful downloads. Denied downloads wrote nothing. Historical browser exported statement-access CSV without storage keys |
| FR-STMT-006 | Complete | Schema deductible and goods/services fields, and the statement footer. Church-approved footer text is the launch wording check, not a missing field |
| FR-AUDIT-001 | Complete | Historical browser: giving-audit pages for the administrator and treasurer, the other church’s sentinel, direct-URL denials, and one settings change with an audit. The page does not write a new audit row |
| FR-AUDIT-002 | Complete | Schema and repository payload. The historical giving-audit pages showed the stored rows with UTC labels |
| FR-AUDIT-003 | Complete | Current isolated SQL download audits. Historical browser statement-access CSV |
| FR-AUDIT-004 | Complete | The repository exposes create and read, not update or delete. Ordinary screens have no audit editor. Test cleanup deletes are not a product screen |
| FR-PAY-FUTURE-001 | Deferred | Phase 2. Stripe ids exist on `Donation`. No `PaymentTransaction` table is required for v1 |
| FR-PAY-FUTURE-002 | Deferred | Phase 2. One-time test checkout exists. Recurring giving does not. Neither is a v1 blocker |
| FR-PAY-FUTURE-003 | Deferred | Phase 2 |
| FR-PAY-FUTURE-004 | Deferred | Phase 2 |
| FR-PAY-FUTURE-005 | Deferred | Phase 2 |
| FR-PAY-FUTURE-006 | Deferred | Phase 2. Test-mode webhook persistence exists. Live-mode events are ignored |
| FR-PAY-FUTURE-007 | Deferred | Phase 2. No refund writer |

Section 18.3 browser cases 2 through 7 are complete on the evidence above. Case 1 is complete for offering-type administration and one membership change, and its invite step is deferred. Section 18.1 and 18.2 invariants that the November 16 SQL tests executed are complete as current isolated SQL. The same invariants covered only by unit tests remain mocked and are not a second pass. Section 17 is complete as the opt-in Grace fixture command plus the Core 26A isolated integration test (1 file / 2 passed). The persistent Grace rows were not applied. Default `npm run db:seed` still loads Demo Community Church. That unrun apply is not a functional gap or a launch requirement.

### Remaining work

This is the only remaining-work list. Functional work is separate from launch work. Deferred work is not counted as unfinished.

| Item | Mark | Next action |
|---|---|---|
| Signed-in keyboard pass for weekly batch entry (§15.3, Phase 1D) | Complete | November 16, 2026, real Clerk session as the existing Church B administrator on isolated Southside Chapel (`bits_e2e`, `http://127.0.0.1:3017`). Keys only: Tab, Enter, Escape, Shift+Tab, Space, typeahead, and date typing. Exercised skip link, empty batch validation, offering date `2026-11-16`, expected total `12.00`, Add Donation, empty-gift alerts, anonymous cash, KB Sunday Fund `$8.00` plus Plate Fund `$4.00`, recorded-donation status, Complete Entry and Reconcile confirm, deposit date `2026-11-16` and reference `KB-SLIP`, and Lock opened then cancelled. Focus was a visible 3px gold outline. One defect fixed and rechecked: Enter on “Skip to main content” now focuses `<main>`. The batch-name error is inside its label. Gift errors are alerts, and the fund select is `aria-invalid` and described. Dialogs opened on Cancel, showed their titles, and returned focus to the invoking button. Lock was not confirmed. A screen reader was not operated. The Next.js dev overlay was hidden only while tabbing the deposit form and Lock. Working `bits` stayed 3 organizations, 3 memberships, 4 donations, `187.00`, 0 batches, 338 audits. Named isolated rows were deleted. This is not the November 11 suite, the November 16 SQL tests, or the source review |
| Durable statement-provider recovery (FR-STMT-004, §15.5, §21.3) | Unfinished launch | November 16 live rehearsal on `bits-statements-test-hrqzaa` in `bits-test` / `test` passed. `statements:storage-probe` was preflight only (`targetKind=designated-test`). `statements:storage-probe -- --apply` run `a633b294-bfbe-41fd-b336-31c3bb27cf4d` and `statements:storage-restore -- --apply` run `203d5e3c-f8da-4179-943c-17d8d003884f` were `executionKind=live-provider`: conditional create, rejected overwrite, SHA-256 match, unsigned denial, 60-byte restore match, and owned-key cleanup. Bucket afterward: 0 objects, 0 B. No failed manifest. This is not independent durable backup, provider-loss recovery, a PostgreSQL-plus-PDF restore, or an authorized app download. November 17 wrote an independent-backup proposal only: Cloudflare R2 bucket `bits-independent-backups`, not created. FR-STMT-004 stays unfinished. `stellar-abundance` / Matrix was not changed |
| Railway TEST and production deployment (§18.4, §21.1) | Unfinished launch | November 16: `npm run db:migrate` applied 52 migrations to empty `bits-test-db` (`0d062a65-540b-419e-a6b6-98773ef9991c`). Church tables remained at 0 rows. Service `bits` (`86ec2fbf-3c85-44f7-99d7-94a96039feba`) then deployed from HEAD `8621a9d` plus the uncommitted working tree. Deployment `7953e76b-25fe-41dd-b42e-34fcb3cf2747` is SUCCESS at `https://bits-test.up.railway.app`. The first upload, `9500e617-dd8e-4010-ab0c-61e30fe745c3`, failed during `next build` after an unanchored `storage/` ignore excluded `lib/storage`. Unsigned `/visit` was 200, `/batches`, `/dashboard`, `/donors`, `/portal`, and `/portal/gifts` returned 307 to `/sign-in`, and `/api/e2e/original-v1-target` returned 404. Invitations stayed `mock`. No signed-in TEST session ran. Railway volume backup is unavailable on Hobby; the pre-migration archive is the gitignored logical dump. Do not copy working `bits`. Production remains out of scope |
| PostgreSQL and deployment backups (§15.5, §21.3) | Unfinished launch | November 17 actual result: empty-database schema recovery passed. Fresh custom dump of `bits-test-db` (`0d062a65-540b-419e-a6b6-98773ef9991c`), 384,921 bytes, SHA-256 `9429863446c929ef21d5151c916ed85cfe7cc1a2f8fa3fecdd75749e4fa9e50f`, restored only into new local `bits_test_schema_recovery_2026111717161546d41ce7` on Postgres.app 18.7 at `127.0.0.1:5432`. Restored schema matches TEST: 52 finished migration names and checksums, 75 public tables, both recovery indexes, six checked foreign keys, and 0 church or role rows. `pg_restore` used `--no-owner --no-acl --exit-on-error --single-transaction`. The first attempt rolled back because the archive named role `postgres`. TEST stayed database `railway` at `/var/lib/postgresql/data/pgdata`. Working `bits` stayed 3 organizations, 3 memberships, 4 donations, `187.00`, 0 batches, and 338 audits. Core 20 databases were not reused. Deployment `7953e76b-25fe-41dd-b42e-34fcb3cf2747` stayed SUCCESS. Bucket `bits-statements-test` stayed 0 objects. This is not real church-data recovery. PITR remains disabled. The dump is one gitignored file on this Mac. November 17 proposed, and did not create, a daily age-encrypted copy to Cloudflare R2 outside Railway. Church-approved statement wording is still unrecorded |
| Live invitation acceptance (§18.3 case 1, §21.3) | Deferred | Leave it deferred. Do not recreate Northside, restore its invitation, or send a replacement. The missing Church A setting does not block the other rows |

The original specification also defers live and recurring Stripe, refunds, formal locked-batch adjustments, advanced accounting integration, data deletion, custom and platform roles, and additional MFA policy. Those stay deferred. Operational backups and tenant isolation were original v1 requirements: isolation is complete on historical browser evidence, and backups stay open above.

### Original future enhancements retained

MFA policy enforcement; bulk statement generation/email delivery; formal adjustment ledger for locked batches; bank/accounting integration; privacy/deletion workflows; advanced goods/services and noncash workflows; platform tenant provisioning/billing. Some later patches supply foundations, but this review does not mark these complete.

## Later July scope and expanded church-management roadmap

Secondary sources: **Bits** July conversation, **Guest Home Page Design** July 27 redesign, and the expanded phase plan below. Small groups, worship planning, livestream, mobile app and AI assistant came from later discussions; they are not requirements in the supplied May specification. Expanded phase numbers below must not be confused with May phases 0, 1A–1D and 2.

| Later scope | September 30 position | Evidence / remaining work |
|---|---|---|
| Organization settings | Implemented | `server/services/organization-settings.service.ts`; settings page. Current acceptance testing remains. |
| Members, households, profiles, photos, emergency contacts, milestones, import/export | Implemented foundations | Member, household, photo, emergency-contact, lifecycle, engagement and import/export services; member and household routes. Full original acceptance checklist not rerun. |
| Attendance, event calendar, registration, check-in/out | Implemented; historical verification | `docs/event-check-in-final-verification.md` records July 27 checks; September 30 kiosk commit adds newer work requiring current acceptance testing. |
| Giving and online donations | Implemented core; partial overall | Stripe giving/webhook, offering batches, reconciliation, deposits, correction requests, statement generation/publishing and member receipts exist. Live payment exception handling and financial acceptance remain. |
| Ministries and volunteer management | Implemented core; partial overall | Scheduling, availability, time off, substitutes, confirmations, training and resources exist. Background-check enforcement and automated reminders are not established. |
| Follow-ups, pastoral care, prayer and communication logs | Implemented foundations | `server/services/care-engagement.service.ts` and `/pastoral-care`, `/follow-ups`, `/prayer-requests` routes. Do not describe pastoral care as wholly unbuilt; review expanded confidentiality/reminder requirements. |
| Email and SMS communications | Partial | Announcements, audience previews, service alerts, preferences and history exist. These do not prove external email/SMS delivery, retries or delivery tracking. |
| Reporting and executive dashboards | Partial | Dashboard, attendance reporting, the four operational contribution views, batch-reconciliation export/print, and restricted statement-access export exist. Advanced analytics remains. |
| Children's check-in | In progress | Kiosk committed; approved pickup list and verified checkout code/migrations uncommitted. Labels, safety alerts, ratios, incidents and background-check enforcement remain. |
| Small groups | Not evidenced as dedicated module | Ministry features are not proof of the full small-group workflow. Retain in backlog. |
| Worship planning | Not evidenced as dedicated module | Volunteer scheduling is not a complete worship/service planning module. Retain in backlog. |
| Livestream integration | Not evidenced as dedicated integration | Retain in backlog; public links/content alone would not establish integration. |
| Mobile app | Not evidenced as standalone app | Responsive web pages do not establish a native/mobile app deliverable. |
| AI ministry assistant | Not evidenced | Retain as future scope; no completion claim. |

### July six-part visual redesign

| Original milestone | Current position |
|---|---|
| 1. Navy/gold design foundation | Implemented foundation: global styles and leadership shell; see `docs/leadership-visual-overhaul-1.md`. |
| 2. Leadership Portal redesign | Implemented foundation: `docs/leadership-visual-overhaul-1.md`; later dashboard organization changes in commit `0d78a47`. |
| 3. Guest Portal | Public home, giving, prayer, visit and church-event pages exist. Full visual/content/contact acceptance remains; future CMS is separate. |
| 4. Member Portal | Extensive routes and services exist for profile, household, gifts, statements, events, announcements, volunteering and resources. Integration and visual acceptance remain. |
| 5. Role-based permissions | Permission helpers and protected services exist. Every originally named role and cross-portal access combination still needs an acceptance matrix. |
| 6. Polish and animations | Partial: responsive foundation and accessibility display work exist; comprehensive mobile, keyboard, loading/error and animation review remains. |

## Current expanded-phase status

The detailed phase lists below preserve requested scope; they are not all completion claims.

| Phase | Status and next gap |
|---|---|
| 1 — Giving | Core implementation present, including individual/household statement generation and publication. Correction requests enforce a second reviewer, but approval is not evidence that ledger corrections are automatically applied. Webhook currently supports `checkout.session.completed`; failed-payment/refund/dispute workflows need further work and validation. |
| 2 — Member Portal | Extensive implementation present: history/receipts, profile/preferences, household, events, schedules, resources, announcements, help and privacy requests. End-to-end account recovery, consent/export fulfillment and ownership tests remain to be confirmed. |
| 3 — Security/data protection | Access directory, idle timeout, security activity, export, retention-policy and backup-readiness features exist. Readiness log is not automated backup/restore. MFA, recovery, operational backups, monitoring and full permission review remain unverified. |
| 4 — Communications | Announcements, audience previews, celebrations, service alerts, preferences and history present. External delivery and automated reminders remain unverified. |
| 5 — Volunteers | Scheduling, availability, time off, substitutes, calendar, confirmations, readiness, print, training and resources present. Full training/background-check enforcement and reminders remain unverified. |
| 6 — Children/families | Kiosk committed; pickup lists and checkout in progress locally. Remaining safety scope listed below. |
| 7 — Pastoral care | Existing foundation, not an untouched phase. Audit original and expanded care requirements before adding duplicate functionality. |
| 8 — Operations | Facilities/conflicts, inventory/checkout, maintenance, purchase requests and document library present. Approval completeness, meeting minutes and protected board-document workflow need confirmation. |
| 8B — Reliability/usability | Help, display options and kiosk present. Offline contingency, monitoring, broad device testing and staging validation remain. |
| 9 — Website/CMS | Public pages exist; full editorial CMS, revision/publish workflow and media management not established. |
| 10 — Launch | Not verified. Pastor/board review, production configuration, test accounts, backup/rollback rehearsal, training and acceptance remain. |

### Core 08 storage verification (October 14, 2026)

| Check | Result |
|---|---|
| Full `npx vitest run` | 207 files / 1,546 tests passed |
| Lint, typecheck, `git diff --check`, production build | Passed |
| Mocked adapter/probe/restore tests | Passed; not live-provider proof |
| Read-only storage probe | Blocked November 4, 2026: `executionKind=none`, `targetKind=unconfigured`, exit 2 |
| Live `--apply` probe/restore | Not executed |
| Live Clerk two-tenant acceptance | Unchanged blocker on identities |

### Core 09 staff membership administration (October 14, 2026)

| Check | Result |
|---|---|
| Full `npx vitest run` | 210 files / 1,572 tests passed, 1 skipped |
| Isolated `bits_e2e` two-session membership serialization | Passed against dedicated `bits_e2e` (not the working `bits` database) |
| Lint, typecheck, `git diff --check`, production build | Passed |
| Playwright Staff Access scenarios | Added to the Core 07 harness; live run still blocked on Clerk identities |
| Invitations / first-admin bootstrap | Not implemented |
| Live Clerk two-tenant acceptance | Unchanged blocker on identities |

### Core 13 live role/tenant acceptance (October 23, 2026)

| Check | Result |
|---|---|
| Harness follow-up | `runWithObservedLockContention` now cleans up timers/barriers and reaps started writers on every path. Unit regressions cover first-writer auth/setup failure and a missing after-locks hook |
| Live preflight | Failed closed. Isolated database `bits_e2e` on loopback is present. Missing: `E2E_CLERK_ORG_A_ID`, `E2E_CLERK_ORG_B_ID`, and the seven `E2E_CLERK_*_EMAIL` names. Dedicated acceptance server was not started because identities are absent |
| Live browser cases | Not executed. Missing configuration is a blocker, not a skip-pass |
| Unit `npm test` | 221 files / 1,572 passed, 62 skipped |
| Isolated `npm run test:isolated` | 19 files / 176 passed; working fingerprints unchanged |
| Lint, typecheck after build, `git diff --check`, Prisma validate, production build | Passed. Prisma retains the pre-existing SetNull warning |
| Owner step | Complete the names in `e2e/.local/acceptance.env`. Do not paste values into chat. Then rerun preflight, start `npm run test:e2e:acceptance:server`, preflight again, and `npm run test:e2e:acceptance` |
| Original v1 | Still incomplete |

### Staff usability polish — nav and batch entry (October 30, 2026)

| Check | Result |
|---|---|
| Scope | Header church/role; Giving vs Statements nav; Leadership Home church + batches link; batch directory/detail next step; gift-form context and sections |
| Church / role | Same `findPrimaryOrganization` + membership access as the page. No invented fallback |
| Next step | Role-aware eligibility flags, not status alone |
| Branding | Existing navy/gold, BITS title, and logo unchanged |
| Financial / 18A | Totals, idempotency, lock rules, and gift-form field associations unchanged |
| Demo records | None created in the working database |
| Focused tests | Role label, next-step helper, nav current page, and directory eligibility. Combined with storage PDF re-run: 5 files / 41 passed when `NODE_ENV=test` |
| Unit `npm test` | 229 files / 1,610 passed, 62 skipped (`NODE_ENV=test`; leftover production env fails local statement PDF writes closed) |
| Lint, `git diff --check` | Passed |
| Production build + typecheck after | Passed. Member-document NFT warning remains |
| Signed-in browser | Pending — Clerk setup still deferred. `/dashboard` and `/batches` redirect to `/sign-in` |
| Original v1 | Still incomplete |

### Core 19 batch guidance (November 2, 2026)

| Check | Result |
|---|---|
| Scope | Directory and detail next-step copy. Same navy/gold, logo, and type. No new transition, reopen, or adjustment workflow |
| Directory | Paginated batch list still does not load gifts. Entered rows and deposited reconciled rows that the role could reconcile or lock say **Review batch** and link to the existing detail page. Stored expected/recorded equality is not treated as permission to reconcile or lock |
| Detail | `getOfferingBatchReview` remains the integrity source. An authorized user blocked by gifts, totals, or deposit dates sees that message. A role that cannot act on the stage sees view-only guidance. Locked rows say locked history |
| Report link | Batch detail uses `canViewBatchReconciliationReports`. Data Entry does not see the link. The report route still enforces the same helper |
| Server guards | Complete, reconcile, and lock rejection tests kept. No financial write path changed |
| Focused tests | Next-step helper, offering-batch directory, review/transition, deposit, integrity, and giving permissions: 6 files / 93 passed |
| Unit `npm test` | 229 files / 1,625 passed, 62 skipped |
| Lint, `git diff --check` | Passed |
| Production build + typecheck after | Passed. Member-document NFT warning remains |
| Signed-in browser | Not run. `/batches` remains behind Clerk. Unit and build success does not certify the staff workflow |
| Original v1 | Still incomplete. Next gate is live two-church Clerk acceptance. Invitations, private storage restore, and Railway stay open |

### Core 20 local database recovery (November 4, 2026)

| Check | Result |
|---|---|
| Scope | One dry-run-by-default operator command. `--apply` may create only `bits_e2e_recovery_<runId>_source` and `bits_e2e_recovery_<runId>_restored`. No UI, no working `bits` or `bits_e2e` restore, no production attestation |
| Tools | Postgres.app `pg_dump` / `pg_restore` 18.6. No software was installed. The local cluster was stopped; this run started it and stopped it afterward |
| Safety tests | `lib/ops/local-database-recovery.test.ts`: 5 passed. Refuses raw URLs, hostaddr, service, options, sockets, multi-host, reserved names, and `--clean` / `--create` |
| Rehearsal | Apply once. Source `bits_e2e_recovery_2026110502432060350d59_source`. Restored `bits_e2e_recovery_2026110502432060350d59_restored`. Server `18.6 (Postgres.app)`, loopback port 5432. Checked-in migrations applied to the new source only |
| Dump | Custom format, 390,300 bytes, SHA-256 `8fdfcdb23c31472f2f5538e023c2d4f8fac70b278c40212447fe1c885070aa9e`. Restore exit 0. Snapshot match true, including Decimal `10.30`, household dates, audit, and idempotency |
| Constraints | On the restored database, a second open household membership and a duplicate idempotency token returned `23505`. A missing offering-type allocation returned `23503`. Those writes were rolled back |
| Artifacts | `e2e/.local/database-recovery/2026110502432060350d59/` mode 0700; dump and manifest mode 0600. Databases left for later reviewed cleanup. Nothing was dropped |
| Limits | This is local synthetic logical backup/restore only. Production scheduling, role coverage beyond the archive, point-in-time recovery, post-backup writes, provider resilience, and statement-object recovery stay open |
| Original v1 | Still incomplete |

### Core 18B local Geist fonts (October 30, 2026)

| Check | Result |
|---|---|
| Official assets | Geist release v1.9.0 zip SHA-256 matches GitHub digest. Variable roman webfonts + OFL only. See `docs/geist-font-provenance.md` |
| Layout | `next/font/local`; `--font-geist-sans` / `--font-geist-mono` unchanged. No remaining `next/font/google` import |
| Historical Google Fonts failure | Core 18 fetch failure retained. Core 18A cached-build success retained. Neither rewritten |
| Focused / unit / lint / build | Working-tree: focused helper/a11y/schema tests passed; `npm test` 227 files / 1,601 passed, 62 skipped; lint and `git diff --check` passed; production build + typecheck after passed. Member-document NFT warning remains |
| Isolated cold-cache build | `/tmp` copy of the current working tree without `.next`, `.env`, or `node_modules`. `npm ci` used install-network (577 packages). Isolated `npm run build` on Node v24.13.1 with `HTTP(S)_PROXY=http://127.0.0.1:9` compiled successfully. Bundled Geist `.woff2` sizes match source. No `fonts.googleapis` / `fonts.gstatic` in the build log or isolated `.next`. Working `.next/cache` was not deleted. Install was not fully offline |
| Public `/visit` render | Isolated task-owned `next start` on loopback port 3031. `GET /visit` 200 with “Plan Your Visit”. Local Geist/Geist Mono assets 200 (`wOF2`, 69,576 / 71,272 bytes). HTML/CSS have no Google Fonts URLs. `/batches` 307 to sign-in; `/e2e` 404. Browser computed `font-family` is `geistSans` / `--font-geist-sans`; `geistSans` status `loaded`. Public `/visit` is not a staff a11y pass |
| Clerk / invitations / storage / Railway | Unchanged blockers |
| Original v1 | Still incomplete |

### Core 18A gift-form validation accessibility (October 30, 2026)

| Check | Result |
|---|---|
| Nested allocation errors | Rendered per row. Zod `flatten()` had collapsed `allocations.n.field` into `allocations[]` |
| Field associations | Unique `useId` + field-array identity; `aria-invalid` only when that field is invalid |
| Date override | Confirmation checkbox moved out of the offering-date label; same server copy |
| Empty donor search | Status, not a donor-input validation failure |
| Token / ledger | Failed save does not clear the create token. CARD/ACH, Decimal totals, `reviewVersion`, tenant checks unchanged |
| Evidence | Helper/schema tests, not a signed-in browser pass. No RTL added |
| Focused tests | 5 files / 57 passed (field-error helper, donation schema, create token, a11y source contracts, donation service) |
| Unit `npm test` | 227 files / 1,601 passed, 62 skipped |
| Lint, Prisma validate, `git diff --check` | Passed. Prisma retains the pre-existing SetNull warning |
| Production build + typecheck after | Passed. Member-document NFT warning remains. Geist fetch was not reproduced; Next font cache from the prior successful build was reused. Cold-cache Google Fonts dependency remains; `next/font/local` is a proposed later option, not applied |
| Protected-screen browser | Blocked: no live Clerk |
| Isolated SQL | Not required |
| Clerk / invitations / storage / Railway | Unchanged blockers |
| Original v1 | Still incomplete |

### Core 18 staff workflow handbook and accessibility (October 30, 2026)

| Check | Result |
|---|---|
| Handbook | `docs/original-v1-staff-handbook.md` from current routes, labels, roles, and conflict copy. Not signed-in acceptance |
| Accessibility review | `docs/original-v1-accessibility-review.md` with screen/control matrix, W3C citations, repairs, remaining live checks. No WCAG conformance claim |
| Narrow repairs | Skip link; header heading demotion; unique action names; donation-form labels/alerts; picker/nav names; toast/org/backup alerts; idle-timeout DOM order; display-options and mobile-nav focus return; report `aria-current`; keyboard logo upload |
| Authorization / ledger | Unchanged: roles, Decimal totals, idempotency, `reviewVersion`, tenant checks |
| Focused a11y source contracts | 1 file / 4 passed (`lib/testing/original-v1-staff-accessibility.test.ts`) |
| Unit `npm test` | 226 files / 1,594 passed, 62 skipped |
| Lint, Prisma validate, `git diff --check` | Passed. Prisma retains the pre-existing SetNull warning |
| Production build + typecheck after | Passed. Member-document NFT warning remains |
| Protected-screen browser | Blocked: no live Clerk. Public `/visit` is not a substitute |
| Isolated SQL | Not required |
| Clerk / invitations / storage / Railway | Unchanged blockers |
| CARD/ACH | Owner option 1 retained |
| Original v1 | Still incomplete |

### Core 14 statement storage recovery (October 23, 2026)

| Check | Result |
|---|---|
| Confirmed repairs | Bounded unsigned-object privacy (URL inspect, abort, cancellable body); run-owned exclusive cleanup manifests; restore reports SHA-256 and byte length and persists failed cleanup; storage-test env overlay cannot retarget the database or Clerk; dedicated TEST bucket names no longer match substrings such as `contest` |
| Focused storage tests | 4 files / 29 passed (adapter, config, env overlay, probe/restore) |
| Unit `npm test` | 222 files / 1,579 passed, 62 skipped |
| Isolated SQL | Not required for this increment |
| Read-only `npm run statements:storage-probe` | Blocked: `BITS_STATEMENT_S3_TEST_*` unset, `e2e/.local/storage-test.env` absent. `executionKind=none`. No secrets printed |
| Emulator `--apply` | Not run. minio, LocalStack, rclone, and `mc` are absent; Docker is unavailable |
| Live-provider `--apply` | Not run. No designated isolated TEST bucket. Application bucket is not inherited |
| Fake SDK sender | Mocked evidence only. Not emulator or live-provider execution |
| Clerk live acceptance | Deferred by owner. Not restarted for this increment |
| Lint, typecheck after build, `git diff --check`, Prisma validate, production build | Passed. Prisma retains the pre-existing SetNull warning. Build keeps the existing middleware-to-proxy and member-document NFT warnings |
| Original v1 | Still incomplete |

### Core 23 organization-settings audit (November 5, 2026)

| Check | Result |
|---|---|
| Repair | Settings update, logo key, and `UPDATE` audit share one transaction. Missing church does not create a church or grant `ORG_ADMIN`. New logos use a unique exclusive file; the prior owned file is deleted only after commit |
| Focused unit tests | Logo staging, denial, no-op, audit rollback, write failure, and cleanup failure. Mocked transaction rollback is separate from SQL |
| Isolated SQL | `npm run test:isolated -- server/services/organization-settings.concurrency.test.ts`: 1 file / 2 passed on `bits_e2e`. Audit failure kept the prior row, key, and `logo.png` bytes. Competing replacements serialized. Working fingerprints unchanged |
| Unit suite, lint, build | `npm test`: 233 files / 1,646 passed, 62 skipped. ESLint passed on the Core 23 files. `npm run build` passed, then `tsc --noEmit` passed. The existing member-document NFT warning remains. `git diff --check` passed |
| Still separate | Database commit and file cleanup are not one atomic operation. Clerk role revocation is not globally serialized. Live Clerk, invitations, storage restore, and Railway stay open |
| Original v1 | Still incomplete |

### Core 25 giving audit review (November 5, 2026)

| Check | Result |
|---|---|
| Route | `/reports/giving-audit`. Leadership Security Activity remains `canEdit`, which is organization administrator only. Opening that catalog to treasurers would include privacy, documents, purchases, maintenance, and equipment |
| Readers | Organization administrator and treasurer, for the session church. Data entry, report viewer, donor, signed-out, inactive membership, and an ambiguous church are denied before audit rows are read |
| History | Exact persisted giving actions for donors, giving households, offering types, batches, gifts, organization settings, statements, report exports, and financial corrections. Pages of 25 use timestamp-then-id order. Summaries use field labels and omit addresses, emails, notes, check numbers, storage keys, and other values |
| Links | Record links require a same-church row. Missing rows and treasurer access to organization settings omit the link. Statement access detail stays on `/reports/statement-access`; the registry stays authoritative for statement files |
| Tests | Focused filter, query, service, existing security-activity denial, and giving-permission tests: 4 files / 38 passed. `npm test`: 235 files / 1,666 passed, 62 skipped. ESLint, `npm run build`, and `tsc --noEmit` passed. The existing member-document NFT warning remains. No isolated SQL. Opening the page does not write an audit row |
| Still open | Signed-in Clerk walkthrough. Statement-storage target, Railway, invitations, and production backups stay owner gates |
| Original v1 | Still incomplete |

### Core 25A giving-audit usability (November 5, 2026)

| Check | Result |
|---|---|
| UTC labels | From, Through, and Date & Time on `/reports/giving-audit` say UTC. Help text says From and Through are UTC calendar days. Query bounds and cursors stay UTC. The shared Security Activity formatter was left unchanged |
| Gift links | A same-church gift links to `/batches/[batchId]` with the label “View gift's batch”. The link is omitted when the gift, its batch, or a same-church batch row is missing. The draft edit route is not used |
| Tests | Focused giving-audit validation, service, and UTC label render tests: 3 files / 16 passed. ESLint on the changed files and `tsc --noEmit` passed. No isolated SQL, full suite, production build, or signed-in browser review |
| Original v1 | Still incomplete |

### Core 26 isolated development fixtures (November 5, 2026)

| Check | Result |
|---|---|
| Command | `npx tsx prisma/seed.ts --original-v1-fixtures` prints the Grace Community Church inventory and does not write. `npm run db:seed` remains Demo Community Church. Apply is a separate `--apply` and is limited to loopback `bits_e2e` |
| Dataset | Smith Household, Jordan Taylor with a local portal identifier, Morgan Lee without an account, inactive Riley Quinn, four offering types, a zero draft batch, and a locked `100.00` batch with a check, one split envelope, and an anonymous cash gift. Statement rows are `GENERATED` synthetic placeholders, not tax statements or restore proof |
| Ownership | Deterministic ids, slug, and local identifiers. A matching church or account that this fixture does not own stops the apply. Drift is reported and is not reset. A repeated apply does not insert duplicates |
| Dry run | Exit 0. `applyPerformed` is false. The report contains no database URL |
| Apply | Not run. The persistent set was not written to `bits_e2e` |
| Isolated SQL | Not run during Core 26. Core 26A later ran the integration namespace on `bits_e2e`. See the Core 26A section |
| Tests | Focused fixture tests: 1 file / 10 passed. `npm test`: 237 files / 1,677 passed, 62 skipped. ESLint on the changed files and `tsc --noEmit` passed. No production build |
| Still separate | Local identifiers do not sign anyone in. The seed does not finish Clerk, invitations, durable statement recovery, signed-in use, or a Railway launch |
| Original v1 | Still incomplete |

### Core 26A isolated fixture SQL (November 5, 2026)

| Check | Result |
|---|---|
| Service | Postgres.app 18 was stopped. This verification started the existing `var-18` service on port 5432. It was left running. No cluster was initialized and no configuration was changed |
| Schema | Loopback `bits_e2e` already had the fixture tables. No migration, reset, create, or drop |
| SQL | `npm run test:isolated -- lib/ops/original-v1-development-fixtures.integration.test.ts`: 1 file / 2 passed. The integration church is separate from Grace Community Church. Creation, repeat with the same three gifts, Decimal totals, household and statement relations, a foreign-church collision, a drifted gift amount, and a different placeholder were checked on `bits_e2e` |
| Rejected rows | The colliding church row kept its address. The drifted gift stayed at the edited amount. The different placeholder bytes stayed in place |
| Files | A failed second placeholder removed only the file that attempt had created. An unrelated sentinel file remained. The database rows from the committed insert stayed, and the following apply added the missing files without a second set of gifts |
| Cleanup | The test deleted its own integration ids and one test-owned foreign organization id. The persistent Grace set was not applied |
| Working data | Working-database fingerprints were unchanged. Counts and hashes are not repeated here |
| Mocked tests | The 1 file / 10 unit tests remain mocked evidence. They are separate from the SQL result above |
| Original v1 | Still incomplete |

### Core 27 Railway TEST storage handoff (November 5, 2026)

| Check | Result |
|---|---|
| Scope | Setup sheet only. No application code, bucket, project, deploy, or probe |
| Account | Railway CLI is absent. No `.railway` link and no Railway token in the shell. No TEST bucket could be inventoried |
| Local config | `e2e/.local/storage-test.env` is absent and ignored by `/e2e/.local/`. The seven `BITS_STATEMENT_S3_TEST_*` names, the application bucket names, and `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` are unset. Acceptance env keeps `BITS_STATEMENT_PDF_BACKEND=local` and is not the probe overlay |
| Provider fit | Current Railway buckets are S3-compatible and virtual-hosted. The installed client supports that with `forcePathStyle` left off, an HTTPS endpoint, and region `auto`. Path-style remains available when a bucket's Credentials tab requires it. Railway does not offer object versioning or automatic bucket snapshots |
| Proposed resource | Storage Bucket display name `bits-statements-test` in a TEST-only project, separate from `BITS_STATEMENT_S3_BUCKET`. Not created. Setup sheet: `docs/statement-storage-recovery.md` |
| Commands | `statements:storage-probe`, its `--apply`, and `statements:storage-restore -- --apply` are proposed and were not run |
| Original v1 | Still incomplete. No further code patch is needed until the owner creates the bucket |

### Core 28 Clerk acceptance resume (November 5, 2026)

| Check | Result |
|---|---|
| Scope | Existing harness only. No second auth system, no new Playwright cases, no Railway or storage work |
| Local target | Gitignored `e2e/.local/acceptance.env`, target token, and `e2e/.local/statement-storage` are present. Loopback database name is `bits_e2e`. Fixture tables are present. No migration, reset, seed, or persistent Grace apply |
| Clerk | Development key prefixes are present. Read-only organizations call returned `organization_not_enabled_in_instance`. One existing Development user was counted and not inspected. The two organization IDs and seven emails are absent |
| Preflight | `npm run test:e2e:acceptance:preflight` exited 2. `readyForFixtures=false`, `readyForLiveAcceptance=false`, missing those nine names, and `server_unreachable`. The acceptance server was not started |
| Live run | Not run. No pass is claimed. Giving-audit and organization-settings browser cases are not in this harness and were not added |
| Railway and storage | Deferred by owner. The Core 27 bucket was not created and the storage probe was not repeated |
| Original v1 | Still incomplete |

### Core 28A missing browser acceptance (November 9, 2026)

| Check | Result |
|---|---|
| Cases added | Giving Audit: administrator and treasurer page through one church, equal timestamps, UTC labels, redacted field names, same-church batch links, a missing target with no link, and the other church's sentinel stays there. Data entry, report viewer, and donor are denied by direct URL. Treasurer is denied Security Activity by direct URL and category query. Organization settings: one fictional footer change, one no-op with no new audit, unauthorized roles have no submit button, and logo replacement only when the acceptance root is inside `e2e/.local` |
| Discovery | `npx playwright test -c playwright.acceptance.config.ts --list` listed 33 tests in 10 files, including setup and teardown. It did not execute setup or any test. The 11 new cases are in `e2e/acceptance/giving-audit.spec.ts` and `e2e/acceptance/organization-settings.spec.ts` |
| Live run | Not run. The two organization IDs and seven emails are still absent. Preflight was not repeated. No pass is claimed |
| Focused checks | Fixture, cleanup, and logo-root tests: 3 files / 13 passed. ESLint on the changed files and `tsc --noEmit` passed. No full suite and no production build |
| Logo root | The isolated acceptance storage root resolves under `e2e/.local`. The logo case writes there only. It was not executed |
| Railway and storage | Deferred by owner. No probe, bucket, or deploy |
| Original v1 | Still incomplete |

### Railway TEST local preparation (November 10, 2026)

| Check | Result |
|---|---|
| Scope | One unapplied `.railway/railway.ts`. SDK `railway@3.16.0` typechecks it. CLI 5.71.0 loads it locally. No login, link, remote plan, apply, deploy, remote migration, or database copy |
| Health check | `/visit`, the existing unsigned page with no database read. `/` remains unsuitable |
| Start | `npm start` stays `next start`. Installed Next 16.2.10 reads `PORT` and binds `0.0.0.0`. Migrations stay in `npm run db:migrate` |
| Storage and backups | Bucket `bits-statements-test` is still a separate approval. Railway buckets do not version or snapshot objects. Probe and restore were not run |
| Original v1 | Still incomplete. Clerk acceptance and storage recovery remain unfinished |

### Live acceptance run (November 11, 2026)

| Check | Result |
|---|---|
| Command | `npm run test:e2e:acceptance` against the already running isolated server at `http://127.0.0.1:3017` |
| Result | 33 passed in 6.5 minutes. Exit 0. Setup, the acceptance cases, and cleanup all passed. No test was skipped |
| Database | Isolated `bits_e2e` on loopback. Working `bits` was not migrated, copied, or written |
| What passed | Donor PDF authorization, giving audit, a Data Entry split gift through treasurer reconcile, multi-organization CSV, organization settings and an isolated logo, signed-out denials, the five staff and donor roles, one membership change, one household conflict, and two-church isolation |
| Invitation | The staff-invitation case confirmed the form and the send button, and did not click send. `BITS_STAFF_INVITATION_PROVIDER` was unset, so the runtime stays on the mock provider. `BITS_STAFF_INVITATION_ALLOW_LIVE` was not set and the allowlist was empty |
| Clerk invitations | After the run, both fictional organizations had zero pending, accepted, revoked, and expired Clerk invitations. Isolated `staff_invitations` had zero rows and zero `acceptedAt` values |
| Personal Development user | Counted once, separate from the seven fictional accounts, with zero organization memberships. No invitation was sent to that inbox |
| Servers | The acceptance server on port 3017 was stopped after this review. The working app on port 3000 was left running |
| Railway and storage | Unchanged. No login, link, apply, deploy, bucket, probe, or restore |
| Original v1 | Still incomplete. Real invitation delivery and explicit acceptance, storage recovery, backups, and Railway remain open |

### Authorized invitation attempt (November 11, 2026)

| Check | Result |
|---|---|
| Scope | One Clerk Development invitation for fictional Church A, BITS role Report Viewer, on isolated `bits_e2e`. The recipient was the existing personal Development user. Working `bits` and Railway were not changed |
| Earlier local failure | The first product create stored one local FAILED row and no provider invitation. Clerk pending and accepted counts stayed at zero. A product retry did not call Clerk because that row had no provider reference. Revoking that row cleared the local email lock and did not send mail |
| Authorized create | One later product create submitted the same church and role. Clerk returned `ClerkAPIResponseError: Forbidden`. The new local row is FAILED, with no provider invitation id. Church A and Church B still have zero pending and zero accepted Clerk invitations |
| Cause | Church A had 7 memberships. Its limit was `max_allowed_memberships: 7`. Clerk counts current members toward that cap, so the eighth invitation was refused |
| Limit change | After that refusal, only Church A’s limit was changed from 7 to 8. A fresh read shows Church A at 8, the instance default at 7, Church B at 7, 7 members, and 0 pending invitations. Billing was not changed and no invitation was sent |
| Acceptance | No email was sent. There is no invitation to open or accept, and no Report Viewer membership was created for the recipient |
| Servers | The isolated server that had live invitation delivery enabled was stopped after the refusal. Port 3000 was left running |
| Original v1 | Still incomplete |

### Core 29 offering types and batch lock (November 11, 2026)

| Check | Result |
|---|---|
| Command | `npx playwright test -c playwright.acceptance.config.ts e2e/acceptance/offering-types.spec.ts e2e/acceptance/batch-lock.spec.ts` against `http://127.0.0.1:3017` |
| Result | 10 passed in 2.7 minutes. Setup plus 4 batch-lock cases and 5 offering-type cases. This is not the earlier 33-test run, and the filtered command did not schedule teardown |
| Offering types | Treasurer created a run-owned fund, edited display order and description, and left the integration code unchanged. A $15.00 check stayed allocated to that fund after deactivation, while a new gift form omitted the fund. Reactivation put the fund back on the form. Data entry and report viewers could read and had no save or deactivate control. The donor received the permission alert. The other church received “Offering type not found in this church.” |
| Batch lock | Treasurer entered an $18.00 check, completed entry, reconciled, and saved a deposit dated with the current UTC date helper. A second deposit made the open lock confirmation stale, and the batch stayed reconciled at $18.00. After reload, lock succeeded. The page showed locked history and no edit or deposit controls. A deposit form opened before the lock was rejected with “This batch is not in the required status.” The edit URL returned to the locked batch. Report viewer could see the lock and could not change it. The donor and the other church could not open it. The other church’s donation total was unchanged |
| Persisted lock | Status `LOCKED`, expected and recorded totals `18.00`, one allocation at `18.00`, and one `LOCK_OFFERING_BATCH` audit from `RECONCILED` to `LOCKED` |
| Database | Isolated `bits_e2e`. Working `bits` fingerprints were unchanged. Prefix-owned rows were removed with the fixture cleanup CLI after the browser run |
| Invitations, Railway, storage | Unchanged. No invitation was sent. No Railway or storage command was run |
| Servers | The isolated server started for this run was stopped. The working app on port 3000 was left running |
| Original v1 | Still incomplete. Invitation receipt and acceptance, storage recovery, backups, and Railway remain open |

### Core 30 invitation reconciliation (November 13, 2026)

| Check | Result |
|---|---|
| Scope | The first check was read-only. After the owner approved one attempt, the product revoked the failed local row and submitted one invitation. No seat limit, billing, Railway, or storage change was made. The 33-test suite and the Core 29 suite were not rerun |
| Before the send | Two local rows, one REVOKED and one FAILED, neither with a provider id. Clerk had zero invitations for both fictional churches. Church A allowed 8 memberships and had 7. The personal user had no membership |
| Local `bits_e2e` after the send | Three Church A Report Viewer rows: one SENT and two REVOKED. The SENT row matches the confirmed inbox and has one provider invitation id. One local email lock remains, on that sent row |
| Authorized send | The owner approved one new attempt. The product revoked the failed local row first. That row had no provider id, so the revoke did not call Clerk. One new Church A Report Viewer create returned sent, with one provider invitation id. Clerk now has one pending invitation for Church A and zero for Church B. No second create was submitted |
| Inviter | The fictional Church A inviter was temporarily `org:admin` for that create, then restored. Church A again has seven `org:member` memberships. The limit remains 8 and the instance default remains 7 |
| Servers | Live invitation delivery was enabled only for the create, then that process was stopped. The later isolated server on port 3017 was stopped when the invitation test was paused. The working app on port 3000 was left running |
| Paused | The owner paused the invitation test before accepting. The pending invitation was left in place. The isolated server on port 3017 was stopped. Working `bits` still has no fictional chapel rows and its November 11 fingerprint still matches |
| Original v1 | Still incomplete |

### Core 23A organization-settings verification (November 5, 2026)

| Check | Result |
|---|---|
| Lock observation | Competing replacements use `runWithObservedLockContention`. Writer A holds the organization lock; writer B is observed through `pg_blocking_pids` before A is released. The prior `logo.png` bytes were still present while that lock was held |
| Logo interruption | Exclusive `open` precedes the write. A failed write removes only that attempt. A failed cleanup logs `staged-logo-leftover` with the key and error code, leaves that partial file, and keeps the original save error. An `EEXIST` collision and the current logo stay in place |
| Isolated runner | With Postgres stopped, the same isolated command exits 2 and prints `Local database service is unavailable (ECONNREFUSED). Isolated tests were not run. No database was migrated or reset.` Connection text is redacted |
| Isolated SQL | After Postgres.app 18 was started, `npm run test:isolated -- server/services/organization-settings.concurrency.test.ts`: 1 file / 2 passed on `bits_e2e`. Working fingerprints, including organization count and logo-key hash, were unchanged. Postgres was stopped afterward. This is separate from the mocked unit transaction |
| Focused unit tests | Logo, settings service, settings action, isolated-runner text, and the lock helper: 5 files / 37 passed |
| Unit suite, lint, build | `npm test`: 233 files / 1,651 passed, 62 skipped. ESLint passed on the Core 23A files. `npm run build` passed, then `tsc --noEmit` passed. The existing member-document NFT warning remains |
| Still separate | Database commit and file cleanup are not one atomic operation. No signed-in browser save. Clerk, invitations, storage restore, and Railway stay open |
| Original v1 | Still incomplete |

### Core 22 original audit-trail review (November 4, 2026)

| Check | Result |
|---|---|
| Scope | FR-AUDIT-001–004 for organization settings, donors, giving households, offering types, batches, gifts, and statements. No new audit table |
| Confirmed | Those giving and statement mutations call `createAuditEvent` with the same transaction client. Portal views/downloads use `statement_access_events`. CSV exports audit before return. Repository reads filter by church. No production update/delete |
| Real SQL already in tree | Giving-household audit injection rolls back link, move, end, and settings. Ledger concurrency records one audit row for one concurrent gift. Not rerun |
| Finding | On November 4, settings committed before the audit. Core 23 applied the transaction repair |
| Commands | Source and existing tests reviewed. `git diff --check` on the Core 22 docs. No suite, build, isolated SQL, Clerk, storage, or Core 20 restore |
| Original v1 | Still incomplete |

### Core 21 statement-storage gate (November 4, 2026)

| Check | Result |
|---|---|
| Configuration | Shell and `e2e/.local/storage-test.env` (absent) have no `BITS_STATEMENT_S3_TEST_*` names. `.env` has no application bucket, region, endpoint, or AWS credential names. Acceptance env backend is local and is not the probe overlay |
| Read-only `npm run statements:storage-probe` | Exit 2. `mode=preflight`, `targetKind=unconfigured`, `executionKind=none`. No secrets printed. Preflight is not connectivity |
| `--apply` probe and restore | Not run. No designated isolated target and no evidenced provider |
| Code / suite / build | Unchanged. Docs only |
| Still separate | Independent durable backups, provider disaster recovery, version retention, staff/portal authorization, and live Clerk acceptance |
| Original v1 | Still incomplete |

### Core 17A runtime smoke (October 23, 2026)

| Check | Result |
|---|---|
| Railpack Node order | Official: `RAILPACK_NODE_VERSION` > `devEngines.runtime` > `engines.node` > `.nvmrc`. Engines beat `.nvmrc`. Remote selection not verified |
| App engines pin | `>=24 <25` in `package.json` and root lock metadata. `.nvmrc` remains `24`. Optional host env `RAILPACK_NODE_VERSION=24` documented only |
| Isolated copy | `/tmp` copy of the current working tree. Root `/storage/` excluded; `lib/storage` kept. No working `.env` in the copy |
| Isolated `npm ci` / build / start | Passed on Node v24.13.1. `NODE_ENV=production`. Existing Development Clerk keys in the child only |
| `GET /visit` | **200** |
| `GET /api/e2e/original-v1-target` | **404** flag-off and flag-on + synthetic token. No fingerprint |
| Unsigned `GET /batches` | **307** `/sign-in` |
| Next 16 request boundary | Deprecated `middleware.ts` caused production start to HTTP-proxy public routes to the same port (500). Same `clerkMiddleware` now lives in `proxy.ts` |
| Working-tree `npm test` | 225 files / 1,590 passed, 62 skipped |
| Lint, Prisma validate, `git diff --check` | Passed. Prisma retains the pre-existing SetNull warning |
| Working-tree build + typecheck after | Passed. Member-document NFT warning remains. Middleware-to-proxy warning is gone |
| Railway | Not created. Not a launch |
| Clerk / storage / invitations | Unchanged blockers. Signed-in acceptance still deferred |
| CARD/ACH | Owner option 1 retained |
| Original v1 | Still incomplete |

### Core 17 runtime and TEST-host preparation (October 23, 2026)

| Check | Result |
|---|---|
| Runtime pin | `engines.node` `>=20.9.0` from Next 16.2.10 and Clerk 7.5.12. `.nvmrc` `24`. Verified Node v24.13.1 / npm 11.8.0. `@types/node` `^20` did not choose the pin |
| Isolated `npm ci` | Passed on a copy of the current working tree without `.env`, `node_modules`, `.next`, `e2e/.local`, or root `/storage/` |
| Isolated `prisma generate` | Passed with a dummy unused `DATABASE_URL`. No migrate/seed |
| Isolated `npm run build` | Passed after correcting the copy exclude so `lib/storage` was included |
| Isolated `npm start` | Ready on `127.0.0.1:3018`. `/visit` and `/api/e2e/original-v1-target` returned 500: Clerk keys missing. Process stopped. Not a 200/404 proof |
| Working-tree `npm test` | 222 files / 1,579 passed, 62 skipped |
| Lint, Prisma validate, `git diff --check` | Passed |
| Working-tree build + typecheck after | Passed. Existing middleware-to-proxy and NFT warnings remain |
| Railway | October 23 review: `railway.json` selected Railpack and `npm start`, with no health check on `/`. No remote project created. The current unapplied file is `.railway/railway.ts` |
| Rollback docs | Launch runbook no longer auto-restores the active database |
| Clerk / storage / invitations | Unchanged blockers |
| Original v1 | Still incomplete |

### Core 16 deployment-readiness review (October 23, 2026)

| Check | Result |
|---|---|
| Review | `docs/original-v1-deployment-readiness.md` and `docs/original-v1-launch-runbook.md`. No deploy, migrate, seed, purchase, or remote write |
| Railway on disk | No `railway.toml`, Dockerfile, Nixpacks file, or Procfile. Hosting plan is inferred from `npm run build` / `npm start` |
| Health endpoint | None. Existing `/` would be the only smoke URL. A second health route was not added |
| Secrets | Names reviewed from `.env.example` and loaders. Values not printed |
| CARD/ACH | Owner option 1 retained. No payment features added |
| Clerk / storage / invitations | Unchanged blockers. Live two-church acceptance, TEST storage apply, and live invitation send/accept remain open |
| Isolated SQL | Not required |
| `npm test` / lint / build | Not rerun; historical Core 14/15 results are not a release-candidate recertification |
| `git diff --check` | Passed |
| Launch-ready claim | Not made. Original v1 still incomplete |

### Core 15 payment-method scope review (October 23, 2026)

| Check | Result |
|---|---|
| Assessment | `docs/original-v1-payment-method-assessment.md`. FR-DON-003 lists six methods and reserves Card/ACH until Phase 2. Manual CARD/ACH rejection is intentional. External card/ACH cannot be recorded without OTHER or Stripe ids |
| Application change | None. Current restrictions preserved. No charges, refunds, emails, or webhooks |
| Owner decision | Option 1 recorded: retain Stripe-only CARD/ACH for v1. External administrative CARD/ACH deferred |
| Clerk / storage / invitations | Unchanged: Clerk deferred; storage blocked without TEST target; invitation delivery and deployment open |
| Formal locked-ledger adjustments | Still deferred |
| Isolated SQL | Not required |
| Focused payment/ledger/report tests | 8 files / 97 passed |
| Unit `npm test` | 222 files / 1,579 passed, 62 skipped |
| `git diff --check` | Passed |
| Production build | Not run; not claimed |
| Original v1 | Still incomplete |

### Core 12A household concurrency verification (October 19, 2026)

| Check | Result |
|---|---|
| Confirmed repairs | Async-local test seams; in-transaction backend PIDs plus `pg_blocking_pids` before release; scoped clock for same-ms `updatedAt`; catalog-shaped open-membership index inspection; audit rollback for link/move/end/settings |
| Isolated household suite | 13 passed on `bits_e2e` with observed lock waits. No skipped household tests |
| Unit `npm test` | 220 files / 1,570 passed, 62 skipped database describes in mixed files |
| Isolated `npm run test:isolated` | 19 files / 176 passed against `bits_e2e`; 0 skipped |
| Working fingerprints | Unchanged: 336 audits, 24 events, 0 attendance actions, 2 memberships, 4 donations totaling 187.00, 0 batches, 0 households, 0 household memberships. Prior hashes unchanged; household hashes are empty-md5 `d41d8cd98f00b204e9800998ecf8427e` |
| Working residue | Eight earlier check-in audits left in place. Not deleted |
| Lint, typecheck after build, `git diff --check`, Prisma validate, production build | Passed. Prisma retains the pre-existing SetNull warning. Typecheck was run after the production build |
| Playwright stale-form case | Present in `staff-roles.spec.ts`; not executed with live Clerk identities |
| Original v1 | Still incomplete. Isolated household concurrency criteria are satisfied; live Clerk/invitations/storage/deployment remain |

### Core 11D test connection guard (October 19, 2026)

| Check | Result |
|---|---|
| Confirmed repairs | Child runtime requires flag + explicit `BITS_WORKING_DATABASE_URL` + live `DATABASE_URL` equal to isolated `bits_e2e` and unequal to working. Shared acquire guard runs before create and before cached reuse. Isolated config fails instead of skip-passing |
| Guard tests (fake URLs) | Reproduction, missing working URL, late retarget, flag removal, cached working client, destination change, credential-only working dest, aliases/overrides: rejected before constructor |
| Unit `npm test` | 218 files / 1,560 passed, 62 skipped database describes in mixed files |
| Isolated `npm run test:isolated` | 18 files / 163 passed against `bits_e2e`; 0 skipped |
| Working fingerprints | Unchanged counts and content hashes: 336 audits, 24 events, 0 attendance actions, 2 memberships, 4 donations totaling 187.00, 0 batches. `audit_fp=0273d9542ea9ed36203f7745d03eb18b` `event_fp=02707b64498da9553ed5537d8b247e78` `membership_fp=2ac1c16d89d392d286f38ef92452461c` `donation_fp=58bdf9184a35c1bd7ff79b0b84833021` `batch_fp=d41d8cd98f00b204e9800998ecf8427e` |
| Working residue | Eight earlier check-in audits left in place. Not deleted |
| Lint, typecheck, `git diff --check`, Prisma validate, production build | Passed |
| Live gift edits / invitations / storage / charges | Not executed |
| Original v1 | Still incomplete. Isolated household concurrency is verified; live Clerk/invitations/storage/deployment remain |

### Core 11C test database isolation (October 19, 2026)

| Check | Result |
|---|---|
| Confirmed repairs | Fail-closed isolated preflight; Prisma blocked in Vitest without `BITS_ISOLATED_DATABASE=1`; run-owned attendance fixtures; unit/isolated Vitest split; `BITS_WORKING_DATABASE_URL` preserved for Core 07 comparisons |
| Commands | `npm test` is unit-only. `npm run test:isolated` is the real-SQL command and fails when `bits_e2e` is missing or equivalent to working `bits` |
| Working-app `bits` | Not migrated, not reset, not used for fixtures. Eight recent check-in audits left in place pending explicit review |
| Isolated `bits_e2e` | Schema presence checked; 18 files / 163 tests passed (event/check-in plus membership/invitation/ledger concurrency) |
| Unit `npm test` | 217 files / 1,543 passed, 62 skipped database describes in mixed files |
| Working fingerprints | Unchanged across isolated run: 336 audits, 24 events, 0 attendance actions, 2 memberships, 4 donations totaling 187.00, 0 batches |
| Working residue | 336 audits includes the eight earlier check-in audits. Inventory only; not deleted |
| Lint, typecheck, `git diff --check`, Prisma validate, production build | Passed |
| Live gift edits / invitations / storage / charges | Not executed |
| Original v1 | Still incomplete |

### Core 11B ledger review and local migration (October 19, 2026)

| Check | Result |
|---|---|
| Confirmed repairs | Missing `reviewVersion` / `ledger_create_idempotency` no longer looks like a form error; operator copy is fail-closed and runtime never applies DDL. Create tokens survive reload via session storage. Local migrate reports already-ready instead of refusing a completed database |
| Isolated `bits_e2e` | Already ready; not reapplied |
| Working-app `bits` | Loopback `bits` received `20261014200000_add_ledger_review_and_idempotency` after backup. Pre-existing counts unchanged: 0 batches, 4 donations, 5 allocations, 2 memberships, 328 audits. Claim table empty |
| Local backup | `e2e/.local/backups/bits-core11b-before-ledger-review.dump` (gitignored, mode 600). `pg_restore -l` inventory verified; this is not a restore rehearsal |
| Full `npx vitest run` | 226 files / 1,681 tests passed, including isolated concurrent same-token create, replay after complete-entry, and same-total delete-and-replace |
| Unsigned batch routes | Temporary production server returned 307 to sign-in for `/batches`, `/batches/new`, and `/batches/corrections`; that process was stopped. Not signed-in acceptance |
| Live gift edits / invitations / storage / charges | Not executed |
| Original v1 | Still incomplete |

### Core 11A ledger retry and review (October 19, 2026)

| Check | Result |
|---|---|
| Confirmed repairs | Complete/Reconcile/Lock and draft gift edit/delete bind `reviewVersion`; same-total donor/allocation/date changes invalidate review. Manual CREATE uses a durable `(organizationId, action, operationToken)` claim |
| Isolated `bits_e2e` | `20261014200000_add_ledger_review_and_idempotency` applied with `npm run ledger:review-schema-setup` |
| Working-app `bits` | Not migrated automatically. Run `npm run ledger:review-local-migrate` on loopback `bits` when ready |
| Full `npx vitest run` | 224 files / 1,670 tests passed, including isolated concurrent same-token create, replay after complete-entry, same-total delete-and-replace, increment, add-versus-complete, and competing reconcile |
| Playwright ledger journeys | Core 07 spec covers create, complete, and treasurer reconcile; live run still blocked on Clerk identities |
| Live gift edits / invitations / storage / charges | Not executed |
| Original v1 | Still incomplete |

### Core 11 ledger acceptance (October 14, 2026)

| Check | Result |
|---|---|
| Ledger code | Existing batch/donation/transition/deposit/report paths reviewed in place |
| Confirmed repairs | Stale transition snapshot rejected; DRAFT manual gift update/delete with audit and `recordedTotal` adjustment |
| Isolated `bits_e2e` ledger serialization | Passed against dedicated `bits_e2e` (not working `bits`) |
| Full `npx vitest run` | 221 files / 1,642 tests passed |
| Lint, typecheck, `git diff --check`, Prisma validate, production build | Passed |
| Playwright ledger journeys | Added to the Core 07 harness; live run still blocked on Clerk identities |
| New migration | None |
| Live gift edits / invitations / storage / charges | Not executed |
| Original v1 | Still incomplete |

### Core 10 staff invitations and onboarding (October 14, 2026)

| Check | Result |
|---|---|
| Invitation/onboarding code | Implemented on Staff Access + `OrganizationMembership`; mock provider by default |
| Working-app `bits` invitation table | Applied October 14 after full custom-format dump; 2 memberships unchanged; invitation table empty |
| Local backup | `e2e/.local/backups/bits-core10-before-invitations.dump` (gitignored). Archive inventory verified; restore rehearsal not performed |
| Isolated `bits_e2e` | `20261014180000_add_staff_invitations` applied with `npm run staff:invitation-schema-setup` |
| Isolated invitation serialization | Passed against dedicated `bits_e2e` (not working `bits`) |
| Live Clerk invitation send | Not executed |
| First-admin apply | Dry-run tool only; no working-app/production grant |
| Full `npx vitest run` | 219 files / 1,625 tests passed after the review repairs |
| Live Clerk two-tenant acceptance | Unchanged blocker on identities |

### Core 10 review and local migration (October 14, 2026)

Preview hides invitation details from wrong recipients, invalid IDs, and revoked/expired intents. Retry claims the submitted version and does not send another provider invitation on missing references, failed lookups, or unknown outcomes. First-admin still requires a matching verified provider identity and was not executed. Working `bits` is schema-ready for invitations; that is not signed-in acceptance.

### Core 10 readiness check (October 14, 2026)

Bounded source review plus local automated/runtime check. No new invitation blocker found. This is not exhaustive certification of every app feature and is not production sign-off.

| Check | Result |
|---|---|
| Full `npx vitest run` | 219 files / 1,625 tests passed, including configured isolated membership/invitation concurrency |
| Lint, typecheck, `git diff --check`, production build | Passed |
| Prisma validate | Passed; existing SetNull/required-field relation warning remains |
| Local `bits` (read-only) | Zero pending or unresolved migrations; both memberships match the pre-invitation snapshot; `staff_invitations` has 0 rows |
| Unsigned Staff Access and accept routes | Temporary production-mode local server returned 307; stopped afterward. Not signed-in acceptance |
| Login-time admin grants | Still absent |
| Application source / migrate / live send / first-admin | Unchanged during this check |

Live two-church Clerk acceptance remains blocked on two organization IDs and seven test identities. Live invitation delivery and explicit recipient acceptance were not run. Unknown provider delivery still needs operator reconciliation. Live statement-storage/restore and other original-roadmap financial/concurrency/launch gates remain pending.

### Core 09A review and migration (October 14, 2026)

| Check | Result |
|---|---|
| Local working `bits` (loopback) | Schema-ready: `20261014130000_add_organization_membership_version` applied; 2 memberships unchanged, `version=1` |
| Recoverable snapshot | `e2e/.local/backups/bits-2026-10-14-staff-membership-version.json` (gitignored; 2 rows). `pg_dump` was not on PATH |
| Isolated `bits_e2e` | Column had existed from test DDL without history; reconciled with `prisma migrate resolve --applied` after shape check. Now ready |
| Full `npx vitest run` | 211 files / 1,577 tests passed (no skipped fallback) |
| Isolated two-session serialization | Ran against `bits_e2e` after migration history was confirmed |
| Staff Access unsigned GET | 307 to `/sign-in`, not a missing-column 500 |
| Lint, typecheck, `git diff --check`, `prisma validate`, production build | Passed. Prisma still warns about a SetNull/required-field relation |

## Immediate next steps

The remaining-work table in the original-v1 reconciliation is the current list. The November 13 Church A invitation is not pending: it was revoked on November 15 when Northside was removed. Do not accept it, send a replacement, or recreate that church. Core 11B already applied the ledger review migration to loopback working `bits`. Later church-management phases and Phase 2 payments stay separate workstreams and do not finish original v1.

## Earlier work

| Blueprint | Description | Status |
|---|---|---|
| 1–7.1 | Earlier BITS foundations and event work | Previously reported complete; not independently verified |
| 7.2 | Event registration, attendees, capacity, and waitlists | Previously reported complete; not independently verified |

## Blueprint 7.3 progress

| Patch | Description | Status |
|---|---|---|
| 7.3A | Check-in configuration foundation | Reported complete; not independently verified |
| 7.3B | Attendance data foundation | Reported complete; not independently verified |
| 7.3C | Transaction-safe single-attendee check-in service | Reported complete; not independently verified |
| 7.3D | Single-attendee staff check-in API | Reported complete; not independently verified |
| 7.3E | Minimal staff check-in screen | Reported complete; not independently verified |
| 7.3F | Selected-party check-in service | Reported complete; not independently verified |
| 7.3G | Selected-party check-in API | Reported complete; not independently verified |
| 7.3H | Selected-party check-in UI | Reported complete; not independently verified |
| 7.3I | Check-in station data foundation | Reported complete; not independently verified |
| 7.3J | Station lifecycle service | Reported complete; not independently verified |
| 7.3K | Station lifecycle API | Reported complete; not independently verified |
| 7.3L | Station management UI | Reported complete; not independently verified |
| 7.3M | Station attribution in check-in services | Reported complete; not independently verified |
| 7.3N | Station attribution in check-in APIs | Reported complete; not independently verified |
| 7.3O | Station selection in staff check-in UI | Reported complete; not independently verified |
| 7.3P | Secure QR pass data foundation | Reported complete; not independently verified |
| 7.3Q | Secure QR issuance, rotation, and revocation service | Reported complete; not independently verified |
| 7.3R | Secure QR pass API | Reported complete; not independently verified |
| 7.3S | Authorized QR pass display and management UI | Reported complete; not independently verified |
| 7.3T | Secure QR token resolution and eligibility service | Reported complete; not independently verified |
| 7.3U | Authorized QR resolution and staff check-in API | Reported complete; not independently verified |
| 7.3V | Staff QR scanner and fallback-entry UI | Reported complete (Cursor); see `docs/blueprint-7-3v.md` |
| 7.3W | Transaction-safe check-out / re-entry service | Reported complete (Cursor); see `docs/blueprint-7-3w.md` |
| 7.3X | Thin check-out / re-entry API | Reported complete (Cursor); see `docs/blueprint-7-3x.md` |
| 7.3Y | Staff check-out / re-entry UI | Implemented; verification in `docs/blueprint-7-3y.md` |
| Next increment | Corrections, undo, and no-show staff workflow | Implemented; verification in `docs/blueprint-attendance-corrections.md` |
| Next increment | Attendance reporting and dashboard polish | Implemented; verification in `docs/blueprint-attendance-reporting.md` |
| Final verification | Security, accessibility, schema, regression, and production build | Verified; see `docs/event-check-in-final-verification.md` |

## Planned next groups

The original Event Check-In increment has historical completion evidence. Later kiosk and child-pickup additions need current verification and hands-on acceptance testing.

## Member Portal progress

| Increment | Description | Status |
|---|---|---|
| Foundation | Private `/portal`, account ownership boundary, dashboard, safe pending state | Implemented; see `docs/member-portal-foundation.md` |
| Account linking | Admin/treasurer donor connection and create-and-connect workflow | Implemented |
| Statement PDF access | Secure view/download of published individual statement PDFs | Implemented; see `docs/member-portal-statement-pdf-access.md` |
| Household statement authorization | Preferred-recipient household PDF list/view/download | Implemented; see `docs/member-portal-household-statement-authorization.md` |
| Stripe webhook security | Signature verification and duplicate-event protection | Implemented; see `docs/stripe-webhook-security.md` |
| Unmatched gift review | Staff donor matching for unmatched Stripe gifts | Implemented; see `docs/unmatched-online-gift-review.md` |
| Offering Batch Foundation and Directory | Draft create, directory, details, and draft-only edit | Implemented; see `docs/offering-batch-foundation.md` |
| Manual batch donation entry | Secure create and fund allocation inside DRAFT batches | Implemented; see `docs/manual-batch-donation-entry.md` |
| Batch entry completion and reconciliation | DRAFT → ENTERED and ENTERED → RECONCILED | Implemented; see `docs/offering-batch-entry-and-reconciliation.md` |
| Deposit tracking and reconciled-batch locking | Record one deposit on RECONCILED batches and lock permanently | Implemented; see `docs/offering-batch-deposit-and-locking.md` |
| Financial correction requests | Restricted request/review workflow with second-person check | Implemented in `server/services/financial-correction.service.ts`; ledger execution and runtime acceptance are separate |

Later increments now present in source include giving history/receipts, limited profile editing, preferences, household, events, volunteering, documents and announcements. Individual and household statement generation/publishing services also exist. These supersede the September 11 next-step notes; current end-to-end verification is still required.

## Recommended implementation order

The remaining work should be delivered as small, reviewed milestones in this
order. Security, privacy, accessibility, audit history, and backups are
requirements throughout every phase rather than one-time finishing tasks.

### Phase 1 — Giving, Stripe, and statements

1. Leadership Statements and Online Giving management screen. **Implemented
   as a read-only first increment.**
2. Stripe webhook signature verification and duplicate-event protection.
   **Implemented.** See `docs/stripe-webhook-security.md`.
3. Match online gifts to donors and provide staff review for unmatched gifts.
   **Implemented.** See `docs/unmatched-online-gift-review.md`.
4. Offering batches, reconciliation, deposit tracking, corrections, and
   approvals. **Offering Batch Foundation and Directory is implemented.**
   **Manual donation entry inside DRAFT batches is implemented.** **Batch
   entry completion and reconciliation is implemented.** **Deposit tracking
   and reconciled-batch locking is implemented.** Restricted financial correction requests and second-person review are now implemented; execution of approved corrections needs separate confirmation.
5. Individual and household statement generation, review, and publishing. **Implementation present; current acceptance remains.**
6. Secure member statement viewing and PDF downloads.
7. Failed-payment, refund, and dispute handling before live payments.
8. Immutable financial audit history and restricted exports.
9. Two-person review for sensitive corrections, refunds, and final statements.
10. Year-end statement review and approval.

### Phase 2 — Member Portal completion

1. Full personal giving history with filters and receipts.
2. Limited contact and communication-preference editing.
3. Household information and explicit household-statement authorization.
4. Personal event registrations and volunteer schedules.
5. Member resources, documents, announcements, and account help.
6. Privacy, consent, export, and account-recovery workflows.

### Phase 3 — Security, administration, and data protection

1. Staff invitations, role changes, deactivation, and account recovery.
2. Permission templates for pastors, teachers, board members, financial staff,
   sound booth teams, and ministry leaders.
3. Two-factor authentication requirements for senior and financial roles.
4. Login/security history and automatic timeout on shared church computers.
5. Emergency-access procedure with tightly controlled recovery permissions and
   an audit trail.
6. Automated database, document, and photograph backups.
7. Restore testing, data-retention rules, and full church-data export that does
   not lock the church into BITS.
8. Member privacy, consent, and communication-permission controls.
9. Error monitoring, performance monitoring, and security review.

### Phase 4 — Communications

1. Email and text announcements.
2. Ministry and group mailing lists.
3. Weather and service-cancellation alerts.
4. Birthday, anniversary, follow-up, and service reminders.
5. Communication preferences, opt-out controls, and delivery history.

### Phase 5 — Ministries and volunteers

1. Volunteer schedules, availability, time-off, and substitute requests.
2. Ministry-team assignments and service reminders.
3. Training and background-check expiration alerts.
4. Nursery, security, sound booth, and ministry-team check-in.
5. Ministry documents and resources.

### Phase 6 — Children and family safety

1. Secure child check-in and matching pickup labels.
2. Approved pickup-person lists.
3. Allergy, medical, custody, and safety alerts with strict permissions.
4. Nursery ratio monitoring.
5. Incident reports.
6. Background-check requirements and expiration enforcement.

### Phase 7 — Pastoral care

1. Hospital and home visits.
2. Counseling and prayer follow-ups.
3. Bereavement and family-support workflows.
4. Care assignments, reminders, and confidential pastoral notes.
5. Privacy levels and restricted pastoral audit access.

### Phase 8 — Church operations

1. Facility and room scheduling with conflict warnings.
2. Equipment inventory and maintenance requests.
3. Purchase requests and approvals.
4. Church document library.
5. Meeting minutes and protected board documents.

### Phase 8B — Reliability and usability

1. Mobile-friendly verification for every primary workflow.
2. Large-text and accessibility display options.
3. Simple kiosk mode for approved shared-device workflows.
4. Offline contingency procedures for attendance, giving entry, and emergency
   contact needs.
5. In-app help, guided instructions, and role-based training materials.
6. Error and performance monitoring.
7. Staging environment validation before production updates.

## Phase 9 — Future Website and CMS

This phase is recorded for future development after the core BITS member,
giving, statement, ministry, pastoral-care, reporting, and permission workflows
are stable.

1. Public First UPC of Saco website branding and navigation.
2. Website pages with draft, preview, publish, archive, and scheduling states.
3. Structured page sections for headings, text, images, buttons, Scripture,
   service times, events, ministries, and video.
4. Posts and announcements assigned to public pages.
5. Homepage content management.
6. Navigation and menu management.
7. Media library for approved church-owned images and files.
8. One-click church logo, browser icon, colors, name, and slogan management.
9. Sermon, livestream, ministry, pastor, leadership, and contact content.
10. Website Editor, Publisher, and Administrator permissions.
11. Revision history and restoration of previous page and branding versions.
12. Optional moderated public comments with approval and spam protection.
13. Search-engine, accessibility, privacy, mobile, backup, and deployment work.

The public site will use **First UPC of Saco** branding. BITS branding remains
inside the private Leadership Portal. CMS work must preserve the separation
between public content, each member's private portal information, and
role-protected leadership data.

### Phase 10 — Launch readiness

1. Pastor and board review.
2. Financial, privacy, security, and accessibility review.
3. Production hosting, domain, email, and database configuration.
4. Staging environment and test accounts.
5. Backup and rollback rehearsal.
6. User instructions and role-based training.
7. Mobile, browser, performance, and recovery testing.
8. Controlled launch followed by monitoring and support.

## Later expanded future scope retained

The later July vision also includes dedicated small groups, worship planning, livestream integration, a mobile app, executive dashboards/advanced analytics, and an AI ministry assistant. These remain tracked above; their omission from later phase numbering does not cancel them. Sequence and acceptance criteria must be agreed before implementation.

## Verification needed

To change prior entries from “reported complete” to “verified complete,” retain Cursor’s:

- Discovery/completion summary
- Exact changed-file list
- Migration results
- Focused and full test results
- Lint, typecheck, and build results
- Git commit identifier

Community-service time should reflect actual eligible work performed, not estimates or the number of patch files.
