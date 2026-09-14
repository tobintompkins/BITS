# BITS Roadmap Tracker

**Last updated:** September 11, 2026

**Current handoff:** Restricted financial correction requests and two-person approvals
**Status basis:** Cursor reported 7.3V–7.3X complete in-repo. Prior items remain reported complete unless noted.

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

Event Check-In development is complete. Perform hands-on user acceptance
testing before selecting the next major BITS roadmap area.

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
| **Next increment** | **Restricted financial correction requests and two-person approvals** | **Next** |

Planned small increments after user testing:

1. Full personal giving-history page.
2. Limited self-service profile editing.

Statement generation and publishing remain a separate leadership workflow and
are not marked complete.

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
   and reconciled-batch locking is implemented.** Next: restricted financial
   correction requests and two-person approvals.
5. Individual and household statement generation, review, and publishing.
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

## Verification needed

To change prior entries from “reported complete” to “verified complete,” retain Cursor’s:

- Discovery/completion summary
- Exact changed-file list
- Migration results
- Focused and full test results
- Lint, typecheck, and build results
- Git commit identifier

Community-service time should reflect actual eligible work performed, not estimates or the number of patch files.
