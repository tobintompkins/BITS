# BITS Blueprint 7.3F — Selected Party Check-In Service

Prerequisites: Blueprints 7.2 through 7.3E must be implemented and passing.

## Cursor instruction

Implement this patch in the existing BITS repository now. Inspect the repository first, follow its actual architecture, make the changes, and run the required checks. Do not stop after producing a plan.

If Blueprint 7.3E is incomplete, or if the single-attendee 7.3C service is not transaction-safe and passing, stop and report the prerequisite. Do not replace completed foundations.

## Discovery

Before editing:

1. Locate the 7.3C single-attendee check-in service and its transaction, locking, audit, eligibility, clock, and idempotency patterns.
2. Locate the actual registration-to-attendee aggregate and attendee status rules from Blueprint 7.2.
3. Confirm the 7.3E selector and whether it exposes registration/party identity safely.
4. Identify established bulk-operation result, validation, transaction, and error conventions.
5. Run the focused Blueprint 7.2–7.3E tests and report the exact baseline result.

Do not assume filenames, status names, or test counts.

## Scope

Add one internal application service that checks in an explicitly selected subset of attendees from one confirmed registration.

The service must:

- Take trusted tenant context, authenticated staff actor, event/occurrence ID, registration ID, and a bounded list of attendee IDs.
- Require the established check-in operation permission.
- Require at least one selected attendee.
- Verify every selected attendee belongs to that exact registration and event/occurrence.
- Apply the same configuration, time-window, registration, attendee, tenant, and permission rules as 7.3C.
- Perform all selected attendee transitions atomically.
- Reuse shared 7.3C domain logic without calling a separately committing transaction once per attendee.
- Append one attendance action per newly checked-in attendee.
- Preserve already-present attendees without incrementing counts or duplicating actions.
- Produce safe per-attendee results and a safe aggregate summary.
- Remain correct under repeated and concurrent party requests.
- Add focused service, transaction, concurrency, tenant-isolation, authorization, audit, and regression tests.
- Add a short Blueprint 7.3F release note.

## Out of scope

Do not add:

- API routes or controller changes
- UI changes
- A “check in everyone” implicit action
- QR codes or scanning
- Stations
- Walk-ins or self check-in
- Check-out, re-entry, corrections, or undo
- No-show processing
- Search, exports, dashboards, notifications, or background jobs
- New dependencies

## Input contract

Follow repository typing and naming conventions. The logical input is:

- Trusted tenant context
- Authenticated actor
- Event or occurrence opaque ID
- Registration opaque ID
- A list of attendee opaque IDs
- Optional idempotency key only if BITS already supports service-level idempotency
- Server-controlled source `STAFF_SEARCH`

The selected attendee list must:

- Contain at least one ID.
- Have a conservative maximum matching existing bulk-operation limits. If no convention exists, use 25 and document it.
- Reject duplicates or normalize them deterministically according to existing validation conventions.
- Never accept tenant ID, actor ID, statuses, counts, timestamps, or audit metadata from the caller.

## Authorization and tenant isolation

1. Require authentication and the established check-in operation permission.
2. Derive tenant and actor from trusted context.
3. Resolve the event/occurrence and registration within that tenant.
4. Resolve all selected attendees through the tenant + event/occurrence + registration relationship.
5. If any supplied attendee does not belong to the party, reject the entire operation without revealing whether it exists elsewhere.
6. Never partially process a mixed-tenant or mixed-registration list.
7. Use repository-standard not-found or validation masking behavior.

## Eligibility

The registration must be confirmed and active under the real Blueprint 7.2 status model.

Each selected attendee must:

- Belong to the registration and event/occurrence.
- Be active and not cancelled.
- Satisfy the same eligibility rules used by 7.3C.

The event must have check-in enabled and the authoritative server time must be within the configured window.

Do not silently omit ineligible attendees. Reject the entire operation atomically with a safe, useful error that follows existing conventions.

## Atomic behavior

Use one repository-standard database transaction for the complete selected set:

1. Resolve and lock the necessary registration/attendance records in deterministic attendee-ID order to reduce deadlock risk.
2. Recheck party membership and eligibility within the transaction where races could matter.
3. For each attendee not already present:
   - Create or lock the unique attendance row.
   - Transition it to `PRESENT`.
   - Set first/last timestamps correctly.
   - Set first check-in count to one.
   - Append exactly one `CHECKED_IN` action.
4. For each attendee already present:
   - Preserve timestamps and count.
   - Append no duplicate action.
5. Record material audit data using the established guaranteed audit pattern.
6. Commit all selected transitions together.

Any validation, persistence, action-history, or required audit failure must roll back the entire request. Do not leave a partially checked-in party.

Do not nest independently committing 7.3C transactions. Extract/reuse a transaction-bound domain helper only if needed, preserving the public 7.3C behavior and tests.

## Result

Return a safe aggregate containing:

- Event/occurrence opaque ID
- Registration opaque ID
- Requested attendee count
- Newly checked-in count
- Already-present count
- Ordered per-attendee results containing:
  - attendee opaque ID
  - attendance opaque ID
  - status
  - first and last check-in timestamps
  - check-in count
  - `CHECKED_IN` or `ALREADY_PRESENT` outcome

Preserve request order unless the repository has an established stable bulk-result ordering convention.

Do not return contact information, notes, household details, internal IDs, database versions, tokens, or raw audit metadata.

## Duplicate and concurrency rules

Repeating the same request must not increment counts or append duplicate actions.

Overlapping simultaneous requests, such as `[A, B]` and `[B, C]`, must produce:

- One effective first check-in per attendee.
- One `CHECKED_IN` action per newly present attendee.
- Count one for every first-time attendee.
- No duplicate attendance row.
- Safe, deterministic results consistent with committed state.

Use database constraints and supported locking/upsert/transaction behavior. Do not rely on an in-process mutex.

Handle deadlock/serialization retry only through an existing repository retry facility. Do not add unbounded custom retry loops.

## Audit

Follow established BITS audit conventions. Prefer one safe aggregate audit event for the party operation plus the required per-attendee attendance actions, unless existing audit policy requires one audit event per material attendee transition.

Audit metadata may include opaque event, registration, attendance, attendee, and actor IDs; requested/new/already-present counts; and safe source. It must not include personal details, sensitive notes, or full request/response objects.

An idempotent repeat must not create misleading new material-success audit entries.

## Required tests

Add tests proving:

1. Authorized staff can check in two selected eligible attendees from one registration.
2. An unselected attendee in the same registration remains unchanged.
3. An empty list and an over-limit list are rejected.
4. Duplicate input IDs follow the selected validation convention.
5. Mixed registration, event, occurrence, or tenant IDs reject the entire operation.
6. Unauthorized actors are rejected.
7. Disabled and outside-window check-in is rejected.
8. Cancelled/inactive attendee or non-confirmed registration rejects the entire operation.
9. One already-present plus one new attendee returns correct outcomes without double-counting.
10. Repeating the request is idempotent.
11. Overlapping simultaneous requests create one effective check-in per attendee.
12. A failure on the final selected attendee rolls back all earlier transitions in that request.
13. Attendance actions and general audit behavior are correct.
14. Results exclude sensitive fields.
15. The existing 7.3C single-attendee service still behaves identically.
16. Existing Blueprint 7.2–7.3E tests continue to pass.

Use a real test database for transaction and concurrency assertions when supported.

## Verification order

Run and report:

1. Focused baseline tests for Blueprints 7.2–7.3E
2. Formatting/check
3. Focused 7.3F service tests
4. Real-database atomic rollback test
5. Real-database overlapping-concurrency test
6. Blueprint 7.2–7.3E regression tests
7. Full suite when feasible
8. Lint/static analysis
9. Type checking
10. Production build when normally required

Report exact commands and actual outcomes. Identify skipped, unavailable, or failing checks.

## Definition of done

- One internal selected-party check-in service exists.
- At least one explicit attendee must be selected.
- Every attendee is verified against the same tenant, event, and registration.
- The selected set succeeds or rolls back as one transaction.
- Already-present and concurrent requests cannot double-count.
- Unselected party members remain unchanged.
- Results and audit data are safe.
- The 7.3C single-attendee behavior remains intact.
- No API or UI is added.
- Documentation identifies Blueprint 7.3G as the future thin selected-party API.

## Required final response from Cursor

Provide:

1. Discovery summary and exact baseline result.
2. Exact changed files grouped by service/domain, data access, tests, and documentation.
3. Input limits and duplicate-ID behavior.
4. Transaction, deterministic locking, rollback, concurrency, and idempotency approach.
5. Tenant-isolation, eligibility, and audit behavior.
6. Exact verification commands and results.
7. Genuine limitations or unexecuted checks.
8. Confirmation that no API or UI was added.

## Deployment

This patch should not require a schema migration unless an essential constraint discovered in 7.3B is genuinely missing. Do not change the schema for naming preferences.

After review:

1. Back up the database under normal BITS procedures.
2. Apply a migration only if genuinely required and documented.
3. Deploy the internal service code.
4. Run focused same-tenant, cross-tenant, rollback, and concurrency smoke tests.
5. Confirm there is no new route or UI.

Record only the actual time spent on work allowed by the community-service program.
