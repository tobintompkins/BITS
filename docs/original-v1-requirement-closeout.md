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

Statuses mean:

- **implemented/acceptance pending** — the path exists; live browser, provider, or host evidence is still open.
- **partially implemented** — a required slice is absent or only some of the named behavior exists.
- **deferred by owner** — the owner has already parked the work, or a policy choice closed it for v1.
- **explicitly outside original v1** — Phase 2, a future enhancement, or later church-management scope.

A unit or mocked test is not live provider or browser evidence. Manual
CARD/ACH remains closed by the owner’s Core 15 decision. See
`docs/original-v1-payment-method-assessment.md`.

## Functional requirements

| ID | Original wording | Status | Where it lives | Recorded evidence | Still open |
|---|---|---|---|---|---|
| FR-ORG-001 | Multiple organizations in one deployment | implemented/acceptance pending | `Organization` in `prisma/schema.prisma` | Role/tenant harness, `docs/original-v1-role-tenant-acceptance.md` | Live two-church Clerk run |
| FR-ORG-002 | Tenant data stays inside one organization | implemented/acceptance pending | `findCurrentOrganizationForUser` in `lib/auth/current-organization.ts` (lines 10–31) refuses a missing or ambiguous membership | Isolated wrong-organization tests cited by the ledger and household docs | Same live two-church run |
| FR-ORG-003 | Name, address, EIN, contacts, logo, footer, time zone, locale, active flag | implemented/acceptance pending | `Organization` fields, `prisma/schema.prisma` lines 599–620 | Core 23 settings save | Signed-in settings save |
| FR-ORG-004 | Organization administrators manage statement settings | implemented/acceptance pending | `server/services/organization-settings.service.ts`; `/settings/organization` | Core 23A on November 5, 2026: 1 isolated file / 2 passed on `bits_e2e`. Logo bytes stay outside the database transaction | Browser save. File cleanup is still separate from commit |
| FR-ORG-005 | Store the Clerk organization id when Clerk Organizations are enabled | implemented/acceptance pending | `clerkOrganizationId` on `Organization`, schema line 601 | `lib/auth/current-organization.ts` lines 12–15 match that id | Live Clerk organizations. There is no `/select-organization` page; §6.1 marks that route “where applicable” |
| FR-AUTH-001 | Staff and portal users authenticate through Clerk | acceptance blocked | Clerk sign-in routes and server `auth()` | Core 28 on November 5, 2026: preflight exited 2. Organizations are disabled on the Development instance. See `docs/original-v1-live-acceptance-setup.md` | Two org IDs and seven emails in gitignored `e2e/.local/acceptance.env`, then a live acceptance run |
| FR-AUTH-002 | A user links to zero or one donor per organization | implemented/acceptance pending | Donor account link on the donor record; portal profile waits when unlinked | Donor and portal profile pages | Live link flow |
| FR-AUTH-003 | Staff permission follows organization membership role | implemented/acceptance pending | Membership role checks and permission helpers | Core 07/07A and Core 09 docs | Live role matrix |
| FR-AUTH-004 | A portal user sees only their own donor profile, gifts, and statements | implemented/acceptance pending | Portal gifts and statement PDF routes | Route tests deny another donor. Not a signed-in browser run | §18.3 cases 4 and 5 |
| FR-AUTH-005 | Membership and audit records keep Clerk user and organization ids | implemented/acceptance pending | `UserAccount`, `OrganizationMembership`, `AuditEvent` | Schema and audit repository | Live Clerk ids on those rows |
| FR-AUTH-006 | Roles `ORG_ADMIN`, `TREASURER`, `DATA_ENTRY`, `REPORT_VIEWER`, `DONOR` | implemented/acceptance pending | `prisma/seed.ts` lines 51–57 upsert those five role types | Core 09 staff membership administration | Live assignment of each role |
| FR-AUTH-007 | Platform administration, custom roles, and MFA policy are future | explicitly outside original v1 | Not a v1 gate | Specification §4.2 and future-enhancements list | Keep deferred |
| FR-DONOR-001 | Staff manage donors with or without accounts | implemented/acceptance pending | `/donors`, `/donors/new`, `/donors/[id]` | `docs/donor-management-core.md` | Signed-in donor workflow |
| FR-DONOR-002 | Name, address, email, phone, contact preference, active flag, deceased flag, notes | implemented/acceptance pending | Donor service and those screens | Donor service tests, including notes omitted from some audit metadata | Browser pass |
| FR-DONOR-003 | A later portal link does not rewrite gift history | implemented/acceptance pending | Account link is separate from donation rows | Donor docs | Live link |
| FR-HH-001 | Household address, primary contact, statement recipient, delivery method | implemented/acceptance pending | `/giving-households` | `docs/donor-household-history.md` | Browser pass. `/households` is the later member household system |
| FR-HH-002 | At most one active household membership | implemented/acceptance pending | Partial unique index `household_memberships_one_open_per_donor` | Core 12/12A isolated lock observation on `bits_e2e` | Browser pass |
| FR-HH-003 | Membership changes keep start and end history | implemented/acceptance pending | Link, move, and end services | Same isolated concurrency file, including audit rollback | Browser pass |
| FR-HH-004 | Individual or household statements | implemented/acceptance pending | Statement generation for both recipient types | Statement service tests | Live PDF generation |
| FR-TYPE-001 | Create, edit, deactivate, and list offering types | implemented/acceptance pending | `/offering-types` | `docs/offering-type-administration.md` | Browser pass |
| FR-TYPE-002 | Tax-deductible flag and future online availability | implemented/acceptance pending | Offering-type fields; checkout honors active online funds | Offering-type tests | Browser pass |
| FR-TYPE-003 | Deactivation keeps historical allocations | implemented/acceptance pending | Deactivate/reactivate services | Offering-type tests | Browser pass |
| FR-BATCH-001 | Create a batch for a collection or deposit group | implemented/acceptance pending | `/batches` and offering-batch service | `docs/original-v1-ledger-acceptance.md` | Browser pass |
| FR-BATCH-002 | Name, date, description, status, expected and recorded totals, deposit, notes, actor, timestamps | implemented/acceptance pending | `OfferingBatch` and batch screens | Ledger review | Browser pass |
| FR-BATCH-003 | Statuses `DRAFT`, `ENTERED`, `RECONCILED`, `LOCKED` | implemented/acceptance pending | Batch transition services | Snapshot-bound complete, reconcile, and lock | Browser pass. Core 19 stops the directory from advertising Reconcile or Lock off stored totals |
| FR-BATCH-004 | Identified and anonymous gifts | implemented/acceptance pending | Manual donation service | Ledger tests | Browser pass |
| FR-BATCH-005 | Totals come from allocations and warn on the expected amount | implemented/acceptance pending | Integrity checker | Integrity tests. Warnings do not rewrite totals | Browser pass |
| FR-BATCH-006 | A locked batch is not silently edited; formal adjustments may wait | implemented/acceptance pending | Draft-only gift edits. `FinancialCorrectionRequest` does not mutate locked gifts | Ledger tests | Formal locked adjustments stay a future enhancement |
| FR-DON-001 | One donation is one received gift | implemented/acceptance pending | `Donation` and manual batch entry | Ledger tests, including a split gift | Browser pass |
| FR-DON-002 | Organization, donor, batch, dates, method, amount, check number, note, anonymous flag, deductible amount | implemented/acceptance pending | `Donation`, schema lines 1021–1038 | Server ignores client Stripe, organization, and total values | Browser pass |
| FR-DON-003 | Six payment methods; card and ACH reserved until Phase 2 | deferred by owner | Enum at schema lines 59–66. Manual entry accepts cash, check, stock/noncash, and other | Core 15 assessment. The owner kept the manual CARD/ACH rejection | Administrative external CARD/ACH stays deferred. ACH has no writer |
| FR-DON-004 | Identified gifts link to a donor; household statements use membership history | implemented/acceptance pending | Donation `donorId`; statement inclusion uses household history | Household and statement tests | Browser pass |
| FR-DON-005 | Anonymous gifts have no donor and are marked anonymous | implemented/acceptance pending | Manual donation validation | Ledger tests | Browser pass |
| FR-DON-006 | At least one allocation | implemented/acceptance pending | Manual donation service | Service tests | Browser pass |
| FR-DON-007 | Allocation sum equals the donation total | implemented/acceptance pending | Server money check | Service tests, including `0.10 + 0.20 = 0.30` | Browser pass |
| FR-DON-008 | Entry may show category lines instead of the word allocation | implemented/acceptance pending | Batch gift form | Manual donation form | Browser pass |
| FR-DON-009 | No silent locked rewrite; material pre-lock edits are audited | implemented/acceptance pending | Draft update/delete plus `createAuditEvent` | Isolated ledger concurrency records one gift and one audit row for one concurrent create | Browser pass |
| FR-REPORT-001 | Reports by organization, date, donor, household, offering type, batch, and payment method | implemented/acceptance pending | `/reports`, `/reports/batch-reconciliation`, `/reports/statement-access` | `docs/contribution-reports.md`, `docs/report-catalog-exports.md` | Treasurer and report-viewer browser pass. There is no standalone `/donations` search page; donation detail is the report plus the batch screen |
| FR-REPORT-002 | CSV export of donor giving and report results | implemented/acceptance pending | Audited CSV routes for those reports | Report service tests reject an audit failure before releasing CSV | Browser pass |
| FR-STMT-001 | Annual or custom-range statements for a donor or household | implemented/acceptance pending | `/statements` generation and registry | Statement service tests | Live generation |
| FR-STMT-002 | Portal users download only authorized statements; household access follows an explicit rule | implemented/acceptance pending | Portal statement route and household contact rules | Route denial tests | Signed-in portal download. Open decision §22.2 is implemented as the current authorization rule, not left blank |
| FR-STMT-003 | Organization identity, recipient, period, gifts, total, generation date, disclaimer | implemented/acceptance pending | Statement PDF content | Statement tests | Church-approved wording on a real PDF |
| FR-STMT-004 | Archive metadata and an immutable PDF or durable storage reference | partially implemented | Local keys and optional `s3v1:` adapter | Core 21 on November 4, 2026: read-only probe exit 2, `targetKind=unconfigured`, `executionKind=none` | Owner designates the isolated target. `--apply` was not run |
| FR-STMT-005 | Record generation, viewing, and download | implemented/acceptance pending | Statement audit actions and `statement_access_events` | `docs/original-v1-audit-coverage.md`, November 4, 2026 source review | Live download |
| FR-STMT-006 | Deductibility and goods/services acknowledgment | implemented/acceptance pending | Donation deductible and goods/services fields, schema lines 1033–1038; statement footer | Manual gift form includes the exceptional goods/services fields | Church-approved footer text |
| FR-AUDIT-001 | Log create, update, and status changes for organizations, donors, households, offering types, batches, donations, and statements | implemented/acceptance pending | `createAuditEvent` in `server/repositories/audit-event.repository.ts`, called inside the saving transaction. `/reports/giving-audit` reviews those stored rows | Core 22 matrix. Core 23 and 23A covered settings. Core 25 on November 5, 2026 added the read-only review page | Signed-in review. The page does not write a new audit row |
| FR-AUDIT-002 | Organization, actor, action, entity, id, timestamp, change metadata | implemented/acceptance pending | `AuditEvent` create payload, repository lines 33–41. `occurredAt` is the database default | Core 22 | Browser review |
| FR-AUDIT-003 | Statement views and downloads are auditable | implemented/acceptance pending | Staff PDF audit and portal access events; `/reports/statement-access` | Route tests | Live download |
| FR-AUDIT-004 | Ordinary screens cannot edit audit rows | implemented/acceptance pending | Repository has create and read functions and no update or delete | Core 22. Test `deleteMany` is cleanup only | Database roles beyond the application are not required by this sentence |
| FR-PAY-FUTURE-001 | Reserve a donation-to-payment relationship | explicitly outside original v1 | `stripeCheckoutSessionId` and `stripePaymentIntentId` on `Donation`. No `PaymentTransaction` table | Payment assessment | Dedicated payment tables were optional |
| FR-PAY-FUTURE-002 | Phase 2 Stripe one-time and recurring gifts | explicitly outside original v1 | One-time test checkout exists. Recurring plans do not | Payment assessment | Recurring giving is missing and is not a v1 blocker |
| FR-PAY-FUTURE-003 | Donor chooses an offering type at checkout | explicitly outside original v1 | Test checkout fund selection | Payment assessment | Live checkout |
| FR-PAY-FUTURE-004 | Weekly and monthly recurring giving | explicitly outside original v1 | No recurring-plan writer | Payment assessment | Phase 2 |
| FR-PAY-FUTURE-005 | Optional fee coverage | explicitly outside original v1 | Not present | Payment assessment | Phase 2 |
| FR-PAY-FUTURE-006 | Finalize a gift only after a verified Stripe webhook | explicitly outside original v1 | Test webhook persist; live mode is ignored | Payment assessment | Live settlement |
| FR-PAY-FUTURE-007 | BITS-initiated refunds and statement impact | explicitly outside original v1 | No refund writer | Payment assessment | Phase 2 |

## Acceptance criteria that finish version 1

Specification §18.4 is the completion gate. None of these eight items is
closed.

| Criterion | Status | What is already recorded | What closes it |
|---|---|---|---|
| Two organizations and isolation tests | implemented/acceptance pending | Harness and isolated tests | Live two-church run |
| Clerk authentication and role-protected routes | deferred by owner | Server checks and unsigned redirects | The seven identities and two organizations |
| Household, donor, and offering-type maintenance is usable | implemented/acceptance pending | Screens and services | Signed-in use |
| Identified and anonymous entry, totals, and lock rules | implemented/acceptance pending | Ledger tests and Core 11C isolated SQL | Signed-in batch entry |
| Reports, CSV, and individual/household PDFs | implemented/acceptance pending | Report and statement services | Signed-in report and PDF |
| PDF artifacts and access audits persist | partially implemented | Local files and access-event code | Designated object storage and a restore |
| Railway deployment and production configuration | partially implemented | `docs/original-v1-launch-runbook.md`, `docs/original-v1-deployment-readiness.md`, `docs/original-v1-railway-test-setup.md` | A linked TEST project. This review does not create it |
| Automated financial and authorization tests | implemented/acceptance pending | Suites recorded through Core 23A. Not rerun on November 5 for this review | A release-candidate run after the gates above |

§18.1 and §18.2 unit and integration items for totals, household dates,
statement recipient, batch transitions, permissions, tenant scope, and audit
have code and tests. They are not Playwright acceptance. §18.3’s seven
browser cases have not been executed with live Clerk.

## Operations, seed, and routes

| Topic | Status | Finding |
|---|---|---|
| §15.1–15.4 security, decimal money, transactions, immutability, usability, service boundaries | implemented/acceptance pending | Money uses `Decimal(12, 2)`. Statement PDFs are replaced by void/reissue rather than silent edits. Accessibility source review is in `docs/original-v1-accessibility-review.md`. A signed-in keyboard pass is still open |
| §15.5 and §21 backups and separate environments | partially implemented | Core 20 on November 4, 2026 restored fictional rows locally. Run id `2026110502432060350d59`. Production scheduling, point-in-time recovery, and statement-object recovery are not done. Do not repeat that restore |
| §17 development seed | implemented/acceptance pending | The opt-in command `npx tsx prisma/seed.ts --original-v1-fixtures` plans Grace Community Church and the named giving fixtures. Default `npm run db:seed` still loads Demo Community Church. Core 26A verified the separate integration namespace on loopback `bits_e2e` (1 file / 2 passed) and did not apply the persistent Grace set. Local identifiers do not sign anyone in, and the statement files are synthetic placeholders rather than restore proof. See `docs/original-v1-development-fixtures.md` |
| §14 report catalog | implemented/acceptance pending | Donor, household, offering-type, donation-detail, batch reconciliation, and statement-access outputs exist. Bulk statement email is a future enhancement |
| §6.3 audit page | implemented/acceptance pending | `/reports/giving-audit` is the administrator and treasurer giving history. Dates and times are labeled UTC. A gift link opens its same-church batch. `/administration/security-activity` stays administrator-only. Statement registry and the statement access report remain the detailed statement history |
| §6.1 organization switcher | partially implemented | Current church comes from the Clerk organization id or exactly one membership. No BITS switcher page was found. The specification applies that page “where applicable” |
| §21.2 environment names | partially implemented | Categories exist in the deployment docs. Live values were not read for this review |
| Later member, event, volunteer, and care modules | explicitly outside original v1 | They are tracked separately and do not finish version 1 |

## One next action

Core 28A added Giving Audit and Organization Settings cases to the existing
harness and listed them. It did not run them. Organizations are still
disabled on the Development instance, and the two organization IDs and seven
emails are absent. The next owner action is to complete that Development
setup in `docs/original-v1-live-acceptance-setup.md` so the new and existing
signed-in cases can run. These tests do not create the accounts, and no live
pass is claimed. Local Railway TEST configuration is prepared and not
applied. Live storage recovery and the remote project remain unfinished.
