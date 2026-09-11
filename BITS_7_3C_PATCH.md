# BITS Blueprint 7.3C — Transaction-Safe Staff Check-In Service

Prerequisites: Blueprints 7.2, 7.3A, and 7.3B must already be implemented and passing.

## Cursor instruction

Implement this patch in the existing BITS repository now. Inspect the repository first, follow its actual architecture, make the changes, and run the required checks. Do not stop after producing a plan.

If Blueprint 7.3B is incomplete or failing, stop and report that prerequisite rather than creating replacement models.

## Discovery

Before editing, identify:

1. The actual 7.3A check-in settings and validation.
2. The actual 7.3B attendance and attendance-action models, constraints, repositories, and tests.
3. Existing tenant context, authorization, transaction, locking, idempotency, domain-error, audit, clock, and fixture conventions.
4. Registration and attendee statuses that determine check-in eligibility.
5. Exact baseline commands and results for the focused Blueprint 7.2–7.3B tests.

Do not assume a historical test count.

## Scope

Add one internal application service that checks in one registered attendee for an authorized staff actor.

The service must:

- Take authenticated tenant context, actor, event or occurrence ID, and attendee ID.
- Accept an idempotency key only if BITS already has an idempotency facility.
- Enforce server-side authorization.
- Apply tenant scope before every lookup.
- Validate check-in configuration and time window.
- Validate registration and attendee eligibility.
- Atomically create or lock the attendance row.
- Transition an eligible attendee to `PRESENT`.
- Append exactly one `CHECKED_IN` attendance action using source `STAFF_SEARCH`.
- Update timestamps and `checkInCount`.
- Record the material staff operation through the existing general audit system.
- Return a safe internal result.
- Remain correct under duplicate and simultaneous requests.

Add focused service, authorization, tenant-isolation, transaction, concurrency, idempotency, audit, and regression tests.

## Out of scope

Do not add:

- Public API routes, controllers, GraphQL operations, or RPC endpoints
- Staff or member UI
- QR passes or scanning
- Party or bulk check-in
- Stations
- Walk-ins
- Self check-in
- Check-out or re-entry
- Corrections or undo
- No-show processing
- Exports, dashboards, notifications, or background jobs
- New third-party dependencies

Do not refactor unrelated Blueprint 7.1–7.3B code.

## Authorization and tenant isolation

1. Require the existing event check-in operate permission. If 7.3A intentionally reused an event-management permission, follow and document that decision.
2. Derive tenant context through the established authenticated mechanism.
3. Scope event, registration, attendee, member, attendance, and action lookups by tenant before resolving IDs.
4. Cross-tenant IDs must produce the repository-standard not-found response without revealing that the resource exists.
5. Authorization must be enforced in the established server policy/application layer.
6. Never treat a tenant ID supplied by an untrusted client as authoritative.

## Eligibility

Reject check-in when:

- Event check-in is disabled.
- The current time is before the configured opening or after the configured closing time.
- The attendee does not belong to the event or occurrence.
- The attendee or registration is cancelled or inactive.
- The registration is pending, waitlisted, offered, declined, expired, or otherwise not confirmed under the real Blueprint 7.2 status model.
- Any linked object crosses tenant boundaries.

Use the existing injected clock. Test the exact opening and closing boundaries according to established BITS time-window conventions. Do not add an administrative override in this patch.

## Atomic transition

For the first eligible check-in:

1. Start the repository-standard database transaction.
2. Lock or atomically create/read the uniquely constrained attendance row.
3. Recheck eligibility inside the transaction where race conditions could matter.
4. Set status to `PRESENT`.
5. Set `firstCheckedInAt` only when it is null.
6. Set `lastCheckedInAt` to the authoritative current time.
7. Set `checkInCount` to one for this first transition.
8. Append one `CHECKED_IN` attendance action with source `STAFF_SEARCH`, actor, and occurrence time.
9. Record the general audit event using the existing guaranteed transactional or post-commit pattern.
10. Commit and return a safe result.

Do not change registration status, attendee details, waitlist history, or event capacity.

## Safe result

Return only:

- Opaque attendance ID
- Event or occurrence ID
- Opaque attendee ID
- Resulting attendance status
- First and last check-in timestamps
- Check-in count
- Whether a new transition occurred or an idempotent already-present result was returned

Do not return contact details, sensitive notes, raw audit metadata, credentials, tokens, or internal lock/version fields.

## Duplicate and concurrency rules

A repeated request for an attendee already `PRESENT` must not:

- Increment `checkInCount`
- Change `firstCheckedInAt`
- Append another `CHECKED_IN` action
- Create another material success audit event

Return the repository-standard idempotent success or already-completed result.

Two simultaneous first requests must result in:

- One attendance row
- One effective transition to `PRESENT`
- `checkInCount` equal to one
- One `CHECKED_IN` action
- One material success audit event

Use the database unique constraint plus the repository’s supported lock, upsert, serializable transaction, or compare-and-swap technique. Do not rely only on an in-process lock or preflight existence query.

If BITS already supports request idempotency, scope and validate keys using its established rules. Do not create a new generic idempotency subsystem solely for this patch.

## Audit and history

Preserve both:

- The attendance action as domain history
- The general audit log as the record of a privileged staff operation

Audit metadata may contain safe tenant, event/occurrence, attendance, attendee, actor, source, and result identifiers. It must not contain tokens, credentials, unrelated personal data, dietary notes, accommodation notes, or full attendee payloads.

Rejected or rolled-back operations must not create misleading success actions or audit entries.

## Required tests

Add tests proving:

1. Authorized staff can check in a confirmed, active, same-tenant attendee.
2. The first transition produces `PRESENT`, count one, correct timestamps, one action, and one audit event.
3. Disabled check-in is rejected.
4. Before-open and after-close requests are rejected.
5. Exact time boundaries follow existing conventions.
6. Unauthorized actors are rejected.
7. Tenant A cannot check in or infer Tenant B’s attendee.
8. Cross-tenant linked references are rejected.
9. Cancelled/inactive attendees and non-confirmed registrations are rejected.
10. A sequential duplicate is idempotent.
11. Two simultaneous requests create one effective check-in and one action.
12. A transaction failure rolls back attendance and history together.
13. Audit behavior follows the established guaranteed-audit policy.
14. The result excludes sensitive attendee fields.
15. Existing 7.2, 7.3A, and 7.3B tests still pass.

Use a real test database for concurrency and database-constraint assertions when supported. Mocks alone do not prove concurrency safety.

## Verification order

Run and report:

1. Focused baseline tests for Blueprints 7.2–7.3B
2. Formatting/check
3. Focused 7.3C service tests
4. Real-database concurrency test
5. Blueprint 7.2–7.3B regression tests
6. Full suite when feasible
7. Lint/static analysis
8. Type checking
9. Production build when normally required

Give exact commands and actual results. Clearly identify anything skipped or unavailable.

## Definition of done

- One internal staff check-in service exists.
- It enforces tenant scope, permission, settings, time window, and eligibility.
- The first check-in atomically produces one `PRESENT` state and one history action.
- Sequential and concurrent duplicates cannot double-count.
- Audit behavior follows existing BITS conventions.
- Failure cannot leave partial attendance/history state.
- No public check-in endpoint or UI is exposed.
- Existing Blueprint 7.2–7.3B behavior remains intact.
- Documentation identifies Blueprint 7.3D as the future thin staff API layer.

## Required final response from Cursor

Provide:

1. Discovery summary and exact baseline results.
2. Exact files changed, grouped by service/domain, data access, tests, and documentation.
3. Eligibility and authorization rules.
4. Transaction, locking, concurrency, and idempotency approach.
5. Attendance-history and audit behavior.
6. Exact verification commands and results.
7. Genuine limitations or unexecuted checks.
8. Confirmation that no public endpoint or UI was added.

## Deployment

This patch should not need a new migration unless the real 7.3B implementation omitted an essential constraint or index. Do not alter the schema for naming preferences.

After review:

1. Back up the database using normal BITS procedures.
2. Apply a migration only if genuinely required and documented.
3. Deploy the service code.
4. Run focused tenant-isolation and concurrency smoke tests.
5. Confirm no public check-in route or UI exists.

Operational check-in remains unavailable until a later patch adds a reviewed API and UI.
