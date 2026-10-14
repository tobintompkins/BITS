# BITS Roadmap Tracker

**Last updated:** October 14, 2026

**Current handoff:** Original Core 11 ledger acceptance repairs stale transition snapshots and adds draft-only gift correction on the existing batch/donation path. Isolated ledger concurrency is implemented against `bits_e2e` when that database is dedicated. Live Clerk browser acceptance, invitation send/accept, storage/restore, household concurrency, and launch gates stay open. Do not treat this as original v1 completion.
**Status basis:** Source and Git on October 14, 2026; HEAD `1fef2d0` plus uncommitted Core 02–11 and earlier local work. Core 11 readiness check: 221 files / 1,642 tests passed, including configured isolated ledger concurrency. Lint, typecheck, `git diff --check`, Prisma validate, and production build passed. See `docs/original-v1-ledger-acceptance.md`.

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
| Phase 0 — architecture, database, Clerk, policies, audit, testing, Railway test deployment | Foundation present; deployment unverified | App/service/repository structure and Prisma schema exist. Current two-organization tests and Railway configuration were not exercised. |
| Phase 1A — organization and original staff roles (`FR-ORG-*`, `FR-AUTH-*`) | Partial / live acceptance blocked | Organization settings, membership schema, role codes and permission helpers exist. Core 07/07A add a fail-closed authenticated role/tenant harness and stop login-time admin auto-provisioning (`docs/original-v1-role-tenant-acceptance.md`). Core 09 adds authorized role/status edits for existing original-role staff memberships (`docs/original-v1-staff-membership-administration.md`). Core 10 adds mocked staff invitations and explicit acceptance (`docs/original-v1-staff-invitations.md`). Live two-church Clerk execution is not evidenced. |
| Phase 1A — donors independent of accounts (`FR-DONOR-001–003`) | Core maintenance implemented; acceptance pending | `/donors`, `/donors/new` and `/donors/[id]` now provide paginated search, active/inactive filters, accountless creation, contact/address/preferences/notes editing and deactivation. Donor detail now shows giving-household history. Full workflow acceptance remains. See `docs/donor-management-core.md`. |
| Phase 1A — donor households/history (`FR-HH-001–004`) | Core maintenance implemented; acceptance pending | `/giving-households` directory, create/edit, link/move/end, and donor-detail history. 03A adds atomic `updatedAt` settings writes, household-then-donor sorted locks, searchable 25-row donor/household pickers, and server-derived donor/household revalidation. Partial unique index `household_memberships_one_open_per_donor` remains. Member-household screens at `/households` remain a separate system. Authenticated browser acceptance and live two-session lock tests remain. See `docs/donor-household-history.md`. |
| Phase 1A — offering-type administration (`FR-TYPE-001–003`) | Core maintenance implemented; acceptance pending | `/offering-types`, `/offering-types/new` and `/offering-types/[id]` now provide paginated name/code search, active/inactive/all filters, create/edit, tax/online flags, immutable nonempty codes, and deactivate/reactivate that preserves allocations. Stripe checkout honors active/online flags for matching allowlisted funds without rewriting existing types on settlement. Authenticated browser acceptance remains. See `docs/offering-type-administration.md`. |
| Phase 1B — batches, gift/allocation entry, reconcile/lock (`FR-BATCH-*`, `FR-DON-*`) | Core implemented; live acceptance outstanding | Core 11 reviews the existing ledger and adds snapshot-bound complete/reconcile/lock plus draft-only audited gift correction. CARD/ACH stay Stripe-reserved. Isolated `bits_e2e` concurrency is implemented. Live Clerk browser acceptance remains blocked. See `docs/original-v1-ledger-acceptance.md`. |
| Phase 1C — giving reports and CSV (`FR-REPORT-001–002`, section 14) | Catalog views/exports implemented; acceptance pending | `/reports` provides donation-detail, donor, giving-household and offering-type views plus matching audited CSV. `/reports/batch-reconciliation` adds the batch worksheet, CSV and print view. `/reports/statement-access` adds the restricted access-event report and CSV. Attendance reports and church-data export remain separate. Authenticated treasurer/report-viewer acceptance remains. See `docs/contribution-reports.md` and `docs/report-catalog-exports.md`. |
| Phase 1C — statements and donor portal (`FR-STMT-*`) | Substantial implementation; storage adapter present, not production-verified | Individual/household generation, publication, registry, void/reissue, gifts and authorized PDF access services exist. Local legacy PDF keys remain valid. New writes can use a private S3-compatible backend (`s3v1:` references) when configured. Core 08 adds a fail-closed synthetic probe/restore against a designated test target. Mocked adapter/probe tests passed; no live bucket, migration, or production restore has been verified. See `docs/private-statement-storage.md`, `docs/statement-storage-recovery.md`, and `docs/original-v1-storage-verification.md`. |
| Audit (`FR-AUDIT-001–004`) | Helpers/workflows present; complete coverage unverified | Verify all original entities and protected export/view/download operations, safe metadata and append-only behavior. |
| Phase 1D — hardening and launch | Not established complete | Core 07/07A implement the role/tenant acceptance harness. Core 08 implements synthetic storage verification and a recovery rehearsal; live provider and disaster recovery are not evidenced. Live two-tenant execution is still blocked on Clerk identities. Accessibility, production runbook, and staff documentation remain required. |
| Phase 2 — one-time Stripe gifts | Implementation present; payment acceptance outstanding | Member checkout uses `mode: "payment"`; verified/idempotent webhook service exists. Live deployment/payment success not verified here. |
| Phase 2 — recurring gifts, fee coverage, transactions/refunds (`FR-PAY-FUTURE-*`) | Remaining / not established | Weekly/monthly giving, optional fee coverage, payment lifecycle review, BITS-initiated refunds and statement impacts require implementation or evidence. Dedicated payment/recurring/refund models were not identified in the reviewed schema. |

### Version-one completion gate (original section 18.4)

Original version 1 is **not established complete**. Require evidence for all of these before marking it complete:

1. Two organizations coexist with passing isolation tests. Harness exists; live two-tenant run is blocked on Clerk identities and an isolated database.
2. Staff/donor authentication and the five original roles pass authorization tests. Harness exists; live authenticated execution is pending configuration.
3. Donor, donor-household and offering-type maintenance is usable.
4. Identified and anonymous gift entry preserves allocation totals and lock rules.
5. Required contribution reports/CSV and individual/household PDFs work.
6. PDF artifacts and access audit records persist durably.
7. Railway production configuration/runbook and recovery procedures are documented and validated.
8. Financial-invariant and authorization tests pass on the release candidate.

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
| Read-only storage probe | Blocked: `BITS_STATEMENT_S3_TEST_*` is not designated |
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

1. Finish Clerk development identities, start `npm run test:e2e:acceptance:server`, rerun preflight, then run `npm run test:e2e:acceptance`. Record that live result separately from the harness implementation.
2. Designate `BITS_STATEMENT_S3_TEST_*` and run `statements:storage-probe -- --apply` plus `statements:storage-restore -- --apply`. Record emulator vs live-provider results separately.
3. Preserve patches 80–81 and Core 02–11 work. Do not treat Core 11 as original v1 completion.
4. Remaining original v1 gaps: live Clerk two-tenant acceptance, authorized live invitation send/accept against isolated `bits_e2e`, live object-store/restore, two-session household locking, and deployment readiness.
5. Keep later church-management expansion and Phase 2 payments visible as separate workstreams. Reaching expanded Phase 6 does not establish completion of original v1.

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
