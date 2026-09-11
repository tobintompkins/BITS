# BITS Blueprint 7.3M — Station Attribution in Check-In Services

Prerequisites: Blueprints 7.2 through 7.3L must be implemented and passing.

## Cursor instruction

Implement this patch in the existing BITS repository now. Inspect the repository first, follow its actual architecture, make the changes, and run the required checks. Do not stop after producing a plan.

If the 7.3I–7.3L station foundation/lifecycle work or the 7.3C/7.3F check-in services are missing or failing, stop and report the prerequisite. Do not create replacement models or parallel check-in services.

## Discovery

Before editing:

1. Locate the single-attendee 7.3C and selected-party 7.3F services, transaction boundaries, input/result types, locks, actions, audit, and tests.
2. Locate the 7.3I station model/repository and 7.3J lifecycle rules.
3. Confirm whether 7.3B attendance or attendance-action records already contain a nullable station relationship.
4. Identify tenant-aware migration, composite foreign-key, RLS, enum, and test-database conventions.
5. Identify how internal application-service inputs evolve without changing existing public endpoints.
6. Run focused Blueprint 7.2–7.3L tests and report the exact baseline result.

## Scope

Add optional station attribution to the existing internal staff check-in services.

This patch must:

- Add a nullable station relationship to attendance actions and, only if consistent with the existing model, the attendance current-state projection.
- Extend the internal 7.3C single-attendee and 7.3F selected-party service inputs with an optional station ID.
- Resolve the station through tenant + event/occurrence scope.
- Require the station to be `ACTIVE`.
- Attribute newly created `CHECKED_IN` actions to the station.
- Update station `lastActivityAt` transactionally for a newly effective check-in.
- Preserve idempotency and concurrency guarantees.
- Keep existing calls without a station working exactly as before.
- Add migration/model/service/transaction/concurrency/tenant-isolation/audit/regression tests.
- Add a short Blueprint 7.3M release note.

## Out of scope

Do not add:

- API request changes
- UI station selection
- A requirement that every check-in have a station
- Kiosk mode
- Device tracking or telemetry
- QR codes or scanning
- Walk-ins or self check-in
- Check-out, re-entry, correction, or undo
- Dashboards, exports, notifications, or background jobs
- New dependencies

## Schema

Prefer station attribution on the append-only attendance action because it records where each action occurred.

Add:

- Nullable `stationId` on attendance actions.
- Tenant/event-aware foreign key to the station using established schema patterns.
- Index for tenant + event/occurrence + station + occurred time.

Add nullable `stationId` to the attendance current-state row only if the completed schema/pattern uses it to represent the station of the most recent effective check-in. If added, document that precise meaning and update it only on a new effective check-in.

Do not backfill historical actions with invented station values. Existing records remain null.

## Migration

Use the repository’s normal migration generator.

The migration must:

- Add nullable station attribution safely.
- Add tenant-aware foreign keys that prevent cross-tenant/event linkage.
- Add required indexes.
- Extend RLS policies if applicable.
- Preserve existing attendance/actions unchanged.
- Require no production backfill.
- Follow normal rollback policy.

Do not hand-write standalone SQL when generated ORM migrations are expected.

## Service input

Extend the internal inputs for 7.3C and 7.3F with:

- Optional station opaque ID

The default/omitted value must preserve all prior behavior.

Do not change the public 7.3D or 7.3G endpoint schemas in this patch. Existing controllers continue calling the services without station attribution until a later patch.

## Station validation

When a station ID is supplied:

1. Resolve it inside the active tenant.
2. Require it to belong to the same event/occurrence.
3. Require status `ACTIVE`.
4. Lock/read it within the same transaction when necessary to prevent a close/check-in race.
5. Cross-tenant, cross-event, nonexistent, and closed stations must fail safely.
6. A station closed concurrently before the effective check-in commits must not receive a new check-in attribution.

Follow the repository’s locking order consistently to avoid deadlocks. Document the chosen order.

## Effective transition behavior

For a newly effective single or party check-in with a valid active station:

- Set `stationId` on each new `CHECKED_IN` action.
- Set current attendance station attribution only if that field is part of the chosen projection.
- Update the station’s `lastActivityAt` to the authoritative transaction time.
- Include safe station ID in the existing general audit metadata.

For an already-present/idempotent attendee:

- Do not append a new action.
- Do not replace previous station attribution.
- Do not update station activity.
- Do not create a new material-success audit event.

For a selected party with at least one new effective check-in:

- Attribute every newly created action to the selected station.
- Update station activity once to the transaction’s authoritative time.

An all-already-present party request must not update activity.

## Atomicity

Station validation, attendance transition, action creation, audit guarantee, and station activity update must follow the existing transaction policy.

Any failure must roll back:

- Attendance changes
- Attendance actions
- Station activity update
- Required audit state

Do not update station activity in a separate best-effort request.

## Concurrency

Tests and implementation must cover:

- Station closing while a check-in tries to use it.
- Two check-ins at the same active station.
- Duplicate check-in at a station.
- Overlapping selected-party requests using the same station.

No effective check-in may commit with attribution to a station that was already closed under the repository’s transaction/locking order.

Do not rely on an in-process mutex.

## Safe results and audit

Add station ID to internal service results only if later API adapters need it and doing so follows safe DTO conventions. Never return device labels, opener/closer information, internal IDs, or station audit data from check-in results.

Audit metadata may include the opaque station ID for a newly effective staff check-in. It must not include device fingerprinting, IP address, geolocation, raw user agent, or full payloads.

## Required tests

Add tests proving:

1. A single eligible attendee can be checked in through a same-tenant active station.
2. A selected party’s newly effective actions receive the same valid station ID.
3. Existing service calls without station ID retain prior behavior.
4. Cross-tenant, cross-event/occurrence, nonexistent, and closed stations are rejected.
5. Station activity updates only for a newly effective check-in.
6. Duplicate/already-present check-in does not change action attribution or station activity.
7. An all-already-present party does not update activity.
8. Mixed new/already-present party attribution and counts remain correct.
9. Station close/check-in concurrency follows the documented lock order safely.
10. Two legitimate simultaneous check-ins update activity safely without losing attendance actions.
11. A failure rolls back attendance, actions, activity, and required audit state.
12. Historical attendance actions remain null after migration.
13. Database constraints reject cross-tenant/event station linkage.
14. Safe DTOs and logs exclude tracking/device details.
15. Existing 7.3D and 7.3G API request schemas remain unchanged.
16. Existing Blueprint 7.2–7.3L tests continue to pass.

Use a real test database for constraints, locking, and concurrency when supported.

## Verification order

Run and report:

1. Focused baseline tests for Blueprints 7.2–7.3L
2. Formatting/check
3. Migration generation and validation
4. Focused 7.3M model/service tests
5. Real-database station-close/check-in race test
6. Real-database duplicate and overlapping-party tests
7. Blueprint 7.2–7.3L regression tests
8. Full suite when feasible
9. Lint/static analysis
10. Type checking
11. Production build

Report exact commands and actual outcomes. Identify skipped, unavailable, or failing checks.

## Definition of done

- Attendance actions can safely reference a station.
- Existing internal check-in services accept an optional station ID.
- Supplied stations must be active and match tenant/event scope.
- Newly effective actions are attributed and activity updates atomically.
- Duplicate/already-present requests do not rewrite attribution or activity.
- Station-close races are covered by real transaction tests.
- Existing API request schemas remain unchanged.
- No UI or public station selection is added.
- Existing tests remain passing.
- Documentation identifies Blueprint 7.3N as the future API support for optional station selection.

## Required final response from Cursor

Provide:

1. Discovery summary and exact baseline result.
2. Exact files changed grouped by migration/schema, services/data access, tests, and documentation.
3. Whether attendance current-state also stores station ID and its precise meaning.
4. Tenant-aware constraints and transaction/lock ordering.
5. Idempotent activity and audit behavior.
6. Exact verification commands and results.
7. Genuine limitations or unexecuted checks.
8. Confirmation that public API schemas and UI were not changed.

## Deployment

After review:

1. Back up the database using normal BITS procedures.
2. Apply the generated migration.
3. Deploy application/service code.
4. Verify existing check-in endpoints still work without station IDs.
5. Run active-station, closed-station, cross-tenant, duplicate, and close-race smoke tests internally.
6. Confirm no public client can yet submit a station ID.

Record only the actual time spent on work allowed by the community-service program.
