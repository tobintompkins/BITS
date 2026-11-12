# BITS Roadmap Tracker

**Last updated:** November 11, 2026

**Current handoff:** Live acceptance against isolated `bits_e2e` passed on November 11, 2026: `npm run test:e2e:acceptance` reported 33 passed in 6.5 minutes, including setup and cleanup. Later the same day, one authorized Church A Report Viewer invitation was submitted to Clerk Development from isolated `bits_e2e`. Clerk returned Forbidden and stored no invitation. No email was sent, received, or accepted. Church A’s own membership limit was then raised from 7 to 8; the instance default remains 7, all seven users remain, and no further invitation was sent. The live invitation server on port 3017 was stopped after the refusal. The working app on port 3000 was left running. Local Railway TEST preparation is still written and not applied. Storage recovery has not been run. Original v1 is incomplete and is not launch-ready.
**Status basis:** Source and Git on November 11, 2026; HEAD `7787b2f` plus uncommitted work. This update records that live run. It did not rerun the Core 20 restore or the storage probe.

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
| Phase 0 — architecture, database, Clerk, policies, audit, testing, Railway test deployment | Foundation present; TEST host prepared, not linked | Core 17A pins Node 24 engines and verifies isolated `/visit` 200 / e2e 404. Owner must still create a separate Railway TEST project. See `docs/original-v1-railway-test-setup.md`. |
| Phase 1A — organization and original staff roles (`FR-ORG-*`, `FR-AUTH-*`) | Partial. Live role/tenant run passed; invitation delivery open | Organization settings, membership schema, role codes and permission helpers exist. Core 07/07A add a fail-closed authenticated role/tenant harness and stop login-time admin auto-provisioning (`docs/original-v1-role-tenant-acceptance.md`). Core 09 adds authorized role/status edits for existing original-role staff memberships (`docs/original-v1-staff-membership-administration.md`). Core 10 adds mocked staff invitations and explicit acceptance (`docs/original-v1-staff-invitations.md`). On November 11, 2026 the live harness passed on isolated `bits_e2e`, including two-church isolation, the five roles, one membership change, and the invitation form left unsent. A later authorized Church A Report Viewer send was refused by Clerk with Forbidden. No email was sent, received, or accepted. |
| Phase 1A — donors independent of accounts (`FR-DONOR-001–003`) | Core maintenance implemented; acceptance pending | `/donors`, `/donors/new` and `/donors/[id]` now provide paginated search, active/inactive filters, accountless creation, contact/address/preferences/notes editing and deactivation. Donor detail now shows giving-household history. Full workflow acceptance remains. See `docs/donor-management-core.md`. |
| Phase 1A — donor households/history (`FR-HH-001–004`) | Core maintenance implemented; isolated concurrency verified; live browser pending | `/giving-households` directory, create/edit, link/move/end, and donor-detail history. 03A adds atomic `updatedAt` settings writes, household-then-donor sorted locks, searchable 25-row donor/household pickers, and server-derived donor/household revalidation. Core 12/12A verify those writers under observed two-session lock contention on isolated `bits_e2e`. Partial unique index `household_memberships_one_open_per_donor` remains. Member-household screens at `/households` remain a separate system. The November 11 live run recorded one signed-in household conflict. Directory create, link, move, and end acceptance remains. See `docs/donor-household-history.md` and `docs/original-v1-household-concurrency.md`. |
| Phase 1A — offering-type administration (`FR-TYPE-001–003`) | Core maintenance implemented; acceptance pending | `/offering-types`, `/offering-types/new` and `/offering-types/[id]` now provide paginated name/code search, active/inactive/all filters, create/edit, tax/online flags, immutable nonempty codes, and deactivate/reactivate that preserves allocations. Stripe checkout honors active/online flags for matching allowlisted funds without rewriting existing types on settlement. Authenticated browser acceptance remains. See `docs/offering-type-administration.md`. |
| Phase 1B — batches, gift/allocation entry, reconcile/lock (`FR-BATCH-*`, `FR-DON-*`) | Core implemented; one live ledger path passed; lock remains open; CARD/ACH scope resolved | Core 11/11A/11B review the existing ledger: snapshot-bound complete/reconcile/lock, monotonic `reviewVersion`, draft-only audited gift correction, durable create idempotency, and operator-facing schema-not-ready handling. Core 15 confirms manual CARD/ACH rejection is intentional and not an unambiguous v1 defect. Owner delegated the decision; current restrictions are retained for v1 and administrative external CARD/ACH is deferred. Core 11C keeps ledger concurrency on isolated `bits_e2e`. The November 11 live run recorded a Data Entry draft batch, a split gift, complete entry, and a treasurer reconcile. The donor could not open staff batch routes. Lock was not part of that run. See `docs/original-v1-ledger-acceptance.md`, `docs/original-v1-payment-method-assessment.md`, and `docs/test-database-isolation.md`. |
| Phase 1C — giving reports and CSV (`FR-REPORT-001–002`, section 14) | Catalog views/exports implemented; live role checks passed for the harness cases | `/reports` provides donation-detail, donor, giving-household and offering-type views plus matching audited CSV. `/reports/batch-reconciliation` adds the batch worksheet, CSV and print view. `/reports/statement-access` adds the restricted access-event report and CSV. Attendance reports and church-data export remain separate. The November 11 live run recorded treasurer and report-viewer exports and denied the roles that must not export. The full catalog was not rechecked. See `docs/contribution-reports.md` and `docs/report-catalog-exports.md`. |
| Phase 1C — statements and donor portal (`FR-STMT-*`) | Substantial implementation; local portal authorization passed; storage adapter not production-verified | Individual/household generation, publication, registry, void/reissue, gifts and authorized PDF access services exist. Local legacy PDF keys remain valid. New writes can use a private S3-compatible backend (`s3v1:` references) when configured. The November 11 live run recorded donor A1 opening only authorized published PDFs and donor A2 being denied those files. Core 08/14 add a fail-closed synthetic probe/restore against a designated test target, with bounded unsigned-privacy checks and run-owned cleanup manifests. Mocked adapter/probe tests passed; no emulator, live bucket, migration, or production restore has been verified. See `docs/private-statement-storage.md`, `docs/statement-storage-recovery.md`, and `docs/original-v1-storage-verification.md`. |
| Audit (`FR-AUDIT-001–004`) | Original giving workflows reviewed; November 11 live giving-audit and settings cases passed | Core 25 adds `/reports/giving-audit`. Security Activity stays administrator-only. Core 23 and 23A keep settings, the logo key, and the audit on one transaction. The November 11 live run recorded the administrator and treasurer giving-audit cases, the other church's sentinel, direct-URL denials, and one fictional organization-settings change with an isolated logo. See `docs/original-v1-audit-coverage.md`. |
| Phase 1D — hardening and launch | Not established complete | Core 16/17/17A document readiness, rollback, Railway TEST setup, and local unsigned HTTP smoke. Core 18 adds a staff handbook and bounded source accessibility review with narrow original-v1 repairs. Remote Railway is not linked. The November 11 live Clerk harness passed. Invitation send/accept, provider backups, and a signed-in keyboard/AT pass remain open. Formal locked-ledger adjustments and Phase 2 payments stay deferred. See `docs/original-v1-staff-handbook.md` and `docs/original-v1-accessibility-review.md`. |
| Phase 2 — one-time Stripe gifts | Implementation present; payment acceptance outstanding | Member checkout uses `mode: "payment"`; verified/idempotent webhook persists test gifts as CARD. Live-mode webhook events are ignored. Live deployment/payment success not verified here. See `docs/original-v1-payment-method-assessment.md`. |
| Phase 2 — recurring gifts, fee coverage, transactions/refunds (`FR-PAY-FUTURE-*`) | Remaining / not established | Weekly/monthly giving, optional fee coverage, payment lifecycle review, BITS-initiated refunds and statement impacts require implementation or evidence. Dedicated payment/recurring/refund models were not identified in the reviewed schema. Not original v1 blockers. |

### Version-one completion gate (original section 18.4)

Original version 1 is **not established complete**. Require evidence for all of these before marking it complete:

1. Two organizations coexist with passing isolation tests. The November 11 live run on isolated `bits_e2e` passed the two-church cases. That run does not finish version 1.
2. Staff/donor authentication and the five original roles pass authorization tests. The same live run passed those harness cases. Real invitation delivery and explicit acceptance remain open.
3. Donor, donor-household and offering-type maintenance is usable. The live run covered signed-in donor and household cases in the harness. Offering-type administration was not the subject of that run.
4. Identified and anonymous gift entry preserves allocation totals and lock rules. The live run recorded one identified split gift through reconcile. Lock was not exercised.
5. Required contribution reports/CSV and individual/household PDFs work. The live run passed the harness export and local PDF cases.
6. PDF artifacts and access audit records persist durably. The live PDFs were local files. Object storage and restore remain unverified.
7. Railway production configuration/runbook and recovery procedures are documented and validated. Core 16 documents the plan. Core 20 practiced one local synthetic logical restore. Remote Railway, production backup scheduling, point-in-time recovery, and statement-object recovery are not validated.
8. Financial-invariant and authorization tests pass on the release candidate. The November 11 harness passed. That is the acceptance suite, not a release-candidate certification.

### Original v1 remaining work (Core 24, November 5, 2026)

Source review only. Detailed requirement rows are in `docs/original-v1-requirement-closeout.md`. This table does not mark version 1 complete and does not promise a fixed number of later patches.

| Open item | What is missing | Code or owner/provider | Evidence that closes it |
|---|---|---|---|
| Two-church Clerk acceptance (§18.3–18.4) | The November 11 live harness passed. Invitation delivery is a separate open item | Development Organizations are enabled, membership is optional, and the fictional identities are in gitignored `e2e/.local/acceptance.env`. See `docs/original-v1-live-acceptance-setup.md` | `npm run test:e2e:acceptance` on November 11, 2026: 33 passed in 6.5 minutes against isolated `bits_e2e`. This does not finish version 1 |
| Staff invitation delivery | A real provider send and explicit accept | The owner approved one isolated Church A Report Viewer send. Clerk Development refused it with Forbidden while that organization allowed 7 memberships. Church A’s limit is now 8; the instance default remains 7. No provider invitation was stored | No email was sent or accepted. Another send still needs a separate approval. Still open |
| Durable statement PDFs (FR-STMT-004, §15.5, §21.3) | Deferred by owner. The Railway Storage Bucket `bits-statements-test` is still unconfigured | Owner, later. See `docs/statement-storage-recovery.md`. Core 28 did not resume it | `statements:storage-probe`, then `--apply`, then `statements:storage-restore -- --apply`, with `executionKind` other than `none`. Those commands were not run |
| PostgreSQL backups (§15.5, §21.3) | Scheduled production backup and a restore that is not the local synthetic pair | Owner and Railway, the chosen host. Core 20 already rehearsed one local fictional restore on November 4, 2026 | A host backup schedule plus a restore exercise that leaves working `bits` unchanged |
| Railway TEST and production (§18.4, §21.1) | Local file prepared. Railway remains the chosen host. No remote project is linked | Owner approval before `railway config apply`, then a separate migrate approval. See `docs/original-v1-railway-test-setup.md` | A separate empty `bits-test` project. Do not copy working `bits` |
| Signed-in original workflows | The November 11 harness covered the signed-in donor, household, ledger, report, local PDF, and portal cases it contains | Screens and services already exist | `npm run test:e2e:acceptance`, 33 passed. Offering-type administration and batch lock were outside that run |
| Development seed (§17) | The opt-in command exists and the dry run was reviewed on November 5, 2026. The persistent Grace set was not applied. Default `npm run db:seed` still loads Demo Community Church | Code, only against loopback `bits_e2e`. See `docs/original-v1-development-fixtures.md` | The owner runs the explicit apply against loopback `bits_e2e` and checks the fictional rows. That apply was not run in Core 26 |
| Giving audit review | Signed-in cases passed in the November 11 live run | Code is in the Core 07 harness | `npm run test:e2e:acceptance` on November 11, 2026 included the giving-audit and organization-settings cases |

**One next action:** Church A’s Development membership limit is now 8, the instance default remains 7, and all seven users remain. No further invitation has been sent. A later Church A Report Viewer send still needs a separate approval. Railway `bits-test` remains an unapplied plan. Storage probe and restore remain unrun. No launch is claimed.

The original v1 explicitly deferred live/recurring Stripe, refunds/reversals, advanced accounting integration, data deletion, custom/platform roles and additional MFA policy work. Preserve these as Phase 2/future or later-added requirements; do not present them as original v1 blockers. Operational backups and tenant security were original v1 requirements.

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

1. Owner: create a separate Railway TEST project and empty TEST Postgres using `docs/original-v1-railway-test-setup.md`. Approve migrate separately. Do not deploy from this chat. Do not copy working `bits`.
2. Clerk Development organizations and the seven fictional identities are in place. The November 11 live harness passed. Do not paste those values into chat. Church A’s membership limit is now 8 and the instance default remains 7. Do not send another invitation until the owner approves it again.
3. Owner: provision or designate the isolated TEST statement-storage target. Railway is the chosen host. No object-storage target is configured here, and this workspace will not create a bucket, purchase a service, or install an emulator. After an isolated bucket exists, set only `BITS_STATEMENT_S3_TEST_*` in the shell or gitignored `e2e/.local/storage-test.env`, then run `statements:storage-probe`, `statements:storage-probe -- --apply`, and `statements:storage-restore -- --apply`. See `docs/statement-storage-recovery.md`.
4. Preserve patches 80–81 and Core 02–11A work. Do not treat Core 11A as original v1 completion.
5. Apply `npm run ledger:review-local-migrate` to loopback working `bits` before using `npm run dev` for batch writes. Do not apply production automatically.
6. Remaining original v1 gaps: a Clerk invitation that is actually delivered and explicitly accepted against isolated `bits_e2e`, designated emulator or live-provider object-store/restore, provider backups, and a real Railway deployment. The November 11 harness passed. The later authorized invitation was refused while Church A allowed 7 members. That organization’s limit is now 8, and no replacement invitation has been sent. Manual CARD/ACH stay closed.
7. Do not expand later church-management roadmap work from this green isolated suite. Invitation delivery, live storage recovery, and launch remain the original v1 gates.
8. Keep later church-management expansion and Phase 2 payments visible as separate workstreams. Reaching expanded Phase 6 does not establish completion of original v1.

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
