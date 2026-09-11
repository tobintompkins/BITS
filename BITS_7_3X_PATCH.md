# BITS Blueprint 7.3X — Check-Out and Re-Entry API

Prerequisites: Blueprints 7.2 through 7.3W must be implemented and passing.

## Cursor instruction

Implement this patch in the existing BITS repository now. Inspect the repository first, follow its actual architecture, make the changes, and run the required checks. Do not stop after producing a plan.

If the transaction-safe check-out/re-entry services from Blueprint 7.3W are missing or failing, stop and report the prerequisite. Do not duplicate their state, transaction, locking, station, idempotency, or audit logic in controllers.

## Discovery

Before editing:

1. Locate the 7.3W check-out/re-entry services, inputs/results, status/timestamp/count semantics, errors, permissions, stations, idempotency, and tests.
2. Locate 7.3D/7.3G/7.3N endpoint conventions for authentication, validation, CSRF, trusted tenant context, error mapping, and safe DTOs.
3. Identify opaque attendance/attendee ID routing conventions.
4. Identify existing action endpoints and API versioning/backward-compatibility patterns.
5. Run focused Blueprint 7.2–7.3W tests and report the exact baseline result.

## Scope

Expose the completed 7.3W services through thin authenticated endpoints for:

- Checking out one currently present attendee.
- Re-entering one currently checked-out attendee.

The API must:

- Require the established check-in operation permission.
- Derive tenant and actor from trusted authentication context.
- Accept event/occurrence and attendance/attendee opaque identifiers using existing conventions.
- Accept an optional station ID when 7.3W supports it.
- Validate request shape.
- Call the matching 7.3W service once.
- Preserve transaction, concurrency, idempotency, station, and audit behavior.
- Map service errors to safe standard responses.
- Return only the safe 7.3W result.
- Add validation, authentication, authorization, tenant-isolation, settings, station, concurrency, idempotency, error-mapping, and regression tests.
- Add a short Blueprint 7.3X release note.

## Out of scope

Do not add:

- UI controls
- Party/bulk check-out or re-entry
- QR-specific checkout
- Walk-ins
- Automatic check-out
- Undo/correction
- No-show processing
- Dashboards, exports, notifications, or background jobs
- New dependencies

## Logical endpoints

Use actual repository conventions. Logical equivalents:

`POST /events/{eventId}/attendance/{attendanceId}/check-out`

`POST /events/{eventId}/attendance/{attendanceId}/re-enter`

Optional body:

```json
{
  "stationId": "optional-opaque-station-id"
}
```

Use attendee ID instead of attendance ID only if established check-in routes resolve attendance that way. Use occurrence IDs when applicable.

## Request rules

Accept only:

- Event/occurrence opaque ID
- Attendance or attendee opaque ID according to existing convention
- Optional station opaque ID
- Existing idempotency header if supported

Never accept:

- Tenant ID
- Actor ID
- Target status
- Check-in count
- Timestamps
- Registration/attendee status changes
- Audit metadata
- Source chosen by client

The server controls action/source.

## Authentication and authorization

1. Require authentication and the same check-in operation permission used by 7.3W.
2. Do not require correction permission for ordinary enabled check-out/re-entry.
3. Derive tenant and actor from trusted context.
4. Apply existing CSRF protection to cookie-authenticated mutations.
5. Let 7.3W resolve attendance and optional station inside tenant/event scope.
6. Cross-tenant, cross-event, and nonexistent resources use safe standard not-found behavior.
7. UI absence is not an authorization boundary.

## Controller behavior

Controllers must:

1. Validate opaque ID and optional station ID format.
2. Map request/trusted context into the service input.
3. Invoke the corresponding service once.
4. Map result/error through established API conventions.

Do not read/modify attendance state directly, append actions, update station activity, or write audits in controllers.

## Responses

Return existing safe fields:

- Attendance opaque ID
- Event/occurrence opaque ID
- Attendee opaque ID
- Status
- First/last check-in time
- Current/most recent checkout time according to documented semantics
- Check-in count
- Outcome: checked out, re-entered, already checked out, or already present
- Optional safe station ID if already exposed

Never return sensitive attendee data, tenant/internal IDs, database versions, raw audit metadata, device details, tokens, or notes.

Use established success codes. Already-completed outcomes are idempotent success, not unhandled conflicts.

## Error mapping

- Unauthenticated → standard authentication response
- Unauthorized → forbidden or safely masked response
- Malformed IDs/body → validation response
- Missing/cross-scope resource → not-found response
- Check-out/re-entry disabled → safe domain/conflict response
- Invalid current state → safe domain/conflict response
- Outside operational window → safe availability response
- Invalid/closed station → established station response
- Already complete → idempotent success
- Unexpected failure → generic server error with correlation ID

Never expose stack traces, ORM/SQL errors, constraint names, tenant details, or sensitive attendee information.

## Idempotency and concurrency

- Pass existing idempotency headers through established adapters.
- Sequential and simultaneous duplicate operations remain one effective transition.
- Same key reused for a different action/attendance/station follows conflict behavior.
- Opposing simultaneous check-out/re-entry requests preserve 7.3W’s documented serializable outcome.
- Station-close races preserve 7.3W behavior.
- Do not add controller-level mutexes or custom retry loops.

## Logging and privacy

- Use safe structured logging and correlation IDs.
- Do not log full attendee/attendance objects or request/response bodies unnecessarily.
- Never log sensitive notes, tokens, or station tracking details.
- Apply existing request-size and rate-limit behavior for comparable staff mutations.

## Required tests

Add tests proving:

1. Authorized staff can check out a present same-tenant attendee.
2. Authorized staff can re-enter a checked-out same-tenant attendee.
3. Authentication and exact check-in permission are required.
4. Correction permission is not accidentally required.
5. Cross-tenant/cross-event/nonexistent resources fail safely.
6. Malformed IDs and unknown fields follow validation conventions.
7. Disabled settings, invalid state, and outside-window errors map safely.
8. Optional active station is passed through; closed/cross-scope station fails safely.
9. Check-out/re-entry responses contain only permitted fields.
10. Sequential duplicate operations return idempotent results.
11. Simultaneous duplicates produce one effective transition/action/audit.
12. Opposing simultaneous endpoint requests preserve consistent state/history.
13. Idempotency-key conflicting reuse behaves correctly when supported.
14. CSRF, content-type, request-size, and rate limits match comparable routes.
15. Unexpected errors expose no stack/database/tenant details.
16. Controllers call 7.3W and do not duplicate domain logic.
17. Existing Blueprint 7.2–7.3W tests continue to pass.

Use real application/database integration tests for concurrency.

## Verification order

Run and report:

1. Focused baseline tests for Blueprints 7.2–7.3W
2. Formatting/check
3. Focused 7.3X validation/controller tests
4. Check-out/re-entry integration tests
5. Real-database duplicate/opposing/station-close tests
6. Blueprint 7.2–7.3W regression tests
7. Full suite when feasible
8. Lint/static analysis
9. Type checking
10. Production build

Report exact commands and outcomes. Identify skipped, unavailable, or failing checks.

## Definition of done

- Thin authenticated single-attendee check-out and re-entry endpoints exist.
- Trusted context supplies tenant and actor.
- Exact permission and settings are enforced through 7.3W.
- Optional station support works.
- Safe errors/results follow BITS conventions.
- Duplicate and opposing concurrency guarantees survive through API.
- Controllers contain no duplicated domain/transaction/audit logic.
- No UI or unrelated attendance feature is added.
- Existing tests remain passing.
- Documentation identifies Blueprint 7.3Y as the future check-out/re-entry staff UI.

## Required final response from Cursor

Provide:

1. Discovery summary and exact baseline result.
2. Final methods/paths/request/response fields.
3. Exact files changed grouped by routes/controllers, validators/DTOs, tests, and documentation.
4. Authentication, authorization, settings, tenant, station, error, idempotency, and concurrency behavior.
5. Confirmation that state/transaction/audit logic remains in 7.3W.
6. Exact verification commands and results.
7. Genuine limitations or unexecuted checks.
8. Confirmation that no UI was added.

## Deployment

This patch should not require a migration.

After review:

1. Deploy through normal BITS procedures.
2. Test enabled/disabled check-out and re-entry in non-production.
3. Verify unauthorized/cross-tenant/invalid-station behavior.
4. Exercise duplicate and opposing concurrent requests.
5. Keep UI controls unavailable until 7.3Y is reviewed.

Record only the actual time spent on work allowed by the community-service program.
