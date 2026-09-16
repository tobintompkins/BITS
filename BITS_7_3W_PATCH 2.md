# BITS Blueprint 7.3W — Transaction-Safe Check-Out and Re-Entry Service

Prerequisites: Blueprints 7.2 through 7.3V must be implemented and passing.

## Cursor instruction

Implement this patch in the existing BITS repository now. Inspect the repository first, follow its actual architecture, make the changes, and run the required checks. Do not stop after producing a plan.

If the attendance/action foundation, event check-out/re-entry settings, station model, or transaction-safe check-in service is missing or failing, stop and report the prerequisite. Do not add API or UI changes in this patch.

## Discovery

Before editing:

1. Locate attendance statuses, actions, timestamps, count semantics, and current-state projection.
2. Locate 7.3A settings for `allowCheckOut` and `allowReentry`.
3. Locate single check-in transaction, locking, station attribution, audit, clock, and idempotency patterns.
4. Identify exact meaning of `checkInCount`, `firstCheckedInAt`, `lastCheckedInAt`, and `checkedOutAt`.
5. Identify authorization permissions for operating check-in versus correction.
6. Identify database constraints and real-concurrency test setup.
7. Run focused Blueprint 7.2–7.3V tests and report the exact baseline result.

## Scope

Add internal application services for:

- Checking out one currently present attendee.
- Re-entering one previously checked-out attendee.

The services must:

- Use trusted tenant and actor context.
- Require the established check-in operation permission.
- Enforce event check-in configuration and check-out/re-entry settings.
- Resolve/lock attendance through tenant + event/occurrence scope.
- Preserve registration/attendee eligibility rules.
- Support optional active-station attribution when established service inputs allow it.
- Update attendance state and append immutable actions atomically.
- Follow existing general audit conventions.
- Be sequentially and concurrently idempotent.
- Return safe internal DTOs.
- Add focused state-transition, authorization, tenant-isolation, settings, station, transaction, concurrency, audit, and regression tests.
- Add a short Blueprint 7.3W release note.

## Out of scope

Do not add:

- API routes or controllers
- UI controls
- QR-specific check-out/re-entry
- Party/bulk check-out or re-entry
- Automatic check-out
- Undo or administrative correction
- Walk-ins
- No-show processing
- Dashboards, exports, notifications, or background jobs
- New dependencies

## Authorization

1. Require authentication and the standard check-in operation permission.
2. Do not require correction permission for a normal configured check-out or re-entry.
3. Derive tenant and actor from trusted context.
4. Apply tenant/event scope before resolving attendance, attendee, registration, or station.
5. Cross-tenant/nonexistent resources use safe repository-standard not-found behavior.
6. Do not add an override path.

## Check-out eligibility

Allow check-out only when:

- Event check-in is enabled.
- `allowCheckOut` is true.
- Current time is inside any applicable operational window according to established policy.
- Attendance belongs to the active tenant/event/occurrence.
- Current attendance status is `PRESENT`.
- Registration and attendee remain valid under established cancellation rules.
- Optional station, when supplied, is active and belongs to the same tenant/event.

Reject or return an idempotent already-completed result for `CHECKED_OUT` according to existing service conventions.

Expected, no-show, cancelled, or otherwise non-present attendance cannot use normal check-out.

## Check-out transition

Within one transaction:

1. Lock attendance and optional station in documented deterministic order.
2. Recheck eligibility.
3. Set status to `CHECKED_OUT`.
4. Set `checkedOutAt` to authoritative current time.
5. Preserve first/last check-in timestamps and `checkInCount`.
6. Append exactly one `CHECKED_OUT` attendance action with actor, source, optional station, and time.
7. Update station activity once only for an effective transition if that matches completed station semantics.
8. Record one material general audit event.
9. Commit and return safe result.

Do not alter registration or attendee status.

## Re-entry eligibility

Allow re-entry only when:

- Check-in and check-out are enabled.
- `allowReentry` is true.
- Attendance status is `CHECKED_OUT`.
- Existing registration/attendee eligibility remains valid.
- Operational time window permits it.
- Optional station is active and in scope.

`PRESENT` returns idempotent already-present behavior. Expected/no-show/cancelled attendance cannot use re-entry as a substitute for first check-in or correction.

## Re-entry transition

Within one transaction:

1. Lock attendance and optional station consistently.
2. Recheck eligibility.
3. Set status to `PRESENT`.
4. Preserve `firstCheckedInAt`.
5. Set `lastCheckedInAt` to authoritative current time.
6. Clear `checkedOutAt` only if the current-state model defines it as current checkout; otherwise preserve history according to established schema and document the meaning.
7. Increment `checkInCount` by exactly one.
8. Append exactly one `REENTERED` action.
9. Update optional station attribution/activity according to completed semantics.
10. Record one material audit event.
11. Commit and return safe result.

Do not append a normal `CHECKED_IN` action for re-entry unless existing action policy explicitly requires both; prefer the dedicated `REENTERED` action.

## State semantics

Document and test:

- Whether `checkedOutAt` represents current/most recent checkout.
- Whether attendance’s current station field represents the most recent entry station.
- `checkInCount`: initial check-in is one; every effective re-entry increments by one; check-out does not increment.
- First check-in timestamp never changes.
- Last check-in timestamp changes only on effective re-entry.
- Immutable action history is the authoritative transition history.

Do not add new columns merely to avoid documenting existing semantics unless a genuine correctness gap requires a migration.

## Idempotency and concurrency

Sequential duplicate check-out:

- One effective transition/action/audit.
- Original checkout time/actor preserved.

Sequential duplicate re-entry:

- One effective re-entry/action/audit/count increment.
- No repeated increment.

Concurrent check-out/check-out and re-entry/re-entry requests must produce one effective transition.

Opposing simultaneous check-out and re-entry must follow documented locking/serialization behavior and end in a state consistent with one valid committed order. Do not leave action history inconsistent with current state.

Use database transactions/locks/version checks, not in-process mutexes.

## Safe result

Return only:

- Attendance opaque ID
- Event/occurrence opaque ID
- Attendee opaque ID
- Status
- First/last check-in time
- Current/most recent checkout time according to documented semantics
- Check-in count
- `CHECKED_OUT`, `REENTERED`, `ALREADY_CHECKED_OUT`, or `ALREADY_PRESENT` outcome
- Optional safe station ID if existing check-in DTOs expose it

Do not return sensitive attendee data, internal versions, raw audit metadata, or tracking details.

## Audit

Audit effective:

- Check-out
- Re-entry

Safe metadata may include opaque attendance/event/attendee/actor/station IDs, outcome, timestamps, and count. Do not include personal data, notes, device details, tokens, or full payloads.

Duplicate/idempotent calls must not create misleading new material audit events.

## Required tests

Add tests proving:

1. Authorized staff can check out one present attendee when enabled.
2. Disabled check-out is rejected.
3. Only `PRESENT` can normally check out.
4. Effective check-out changes status/time, preserves count/check-in times, and adds one action/audit.
5. Duplicate sequential and simultaneous checkout is idempotent.
6. Authorized staff can re-enter one checked-out attendee when enabled.
7. Disabled re-entry is rejected.
8. Only `CHECKED_OUT` can normally re-enter.
9. Effective re-entry preserves first time, updates last time, increments count once, and adds one `REENTERED` action/audit.
10. Duplicate sequential/simultaneous re-entry does not increment again.
11. Opposing concurrent operations produce consistent state/history.
12. Cancelled/inactive/cross-tenant/cross-event resources fail safely.
13. Optional active station attribution/activity works; closed/cross-scope station fails.
14. A transaction/audit failure rolls back state, action, and station activity.
15. Safe DTO excludes sensitive/internal data.
16. First-time check-in behavior remains unchanged.
17. Existing Blueprint 7.2–7.3V tests continue to pass.

Use a real test database for locking and opposing-operation concurrency.

## Verification order

Run and report:

1. Focused baseline tests for Blueprints 7.2–7.3V
2. Formatting/check
3. Focused 7.3W service tests
4. Real-database duplicate checkout/re-entry tests
5. Real-database opposing-operation test
6. Station and audit rollback tests
7. Existing check-in/QR regression tests
8. Blueprint 7.2–7.3V regression tests
9. Full suite when feasible
10. Lint/static analysis
11. Type checking
12. Production build

Report exact commands and outcomes. Identify skipped, unavailable, or failing checks.

## Definition of done

- Internal single-attendee check-out and re-entry services exist.
- Settings, permission, tenant, event, eligibility, and station rules are enforced.
- State/timestamp/count semantics are documented and tested.
- Actions and audits are atomic and immutable.
- Duplicate/concurrent operations cannot double-transition or double-increment.
- Opposing operations preserve consistent state/history.
- No API or UI is added.
- Existing tests remain passing.
- Documentation identifies Blueprint 7.3X as the future thin check-out/re-entry API.

## Required final response from Cursor

Provide:

1. Discovery summary and exact baseline result.
2. Exact files changed grouped by services/domain, data access, tests, and documentation.
3. Status/timestamp/count/current-station semantics.
4. Authorization, settings, tenant, station, transaction, locking, idempotency, and audit behavior.
5. Exact verification commands and results.
6. Genuine limitations or unexecuted checks.
7. Confirmation that no API or UI was added.

## Deployment

This patch should not require a migration unless a genuine current-state correctness gap is discovered. Do not change schema for naming preferences.

After review:

1. Back up the database under normal BITS procedures.
2. Apply only a genuinely required documented migration.
3. Deploy internal service code.
4. Run enabled/disabled, duplicate, opposing-concurrency, station, and cross-tenant smoke tests.
5. Confirm no external check-out/re-entry route or UI exists yet.

Record only the actual time spent on work allowed by the community-service program.
