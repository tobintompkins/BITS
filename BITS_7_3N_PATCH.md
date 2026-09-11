# BITS Blueprint 7.3N — Station Attribution in Check-In APIs

Prerequisites: Blueprints 7.2 through 7.3M must be implemented and passing.

## Cursor instruction

Implement this patch in the existing BITS repository now. Inspect the repository first, follow its actual architecture, make the changes, and run the required checks. Do not stop after producing a plan.

If Blueprint 7.3M optional station attribution is missing or failing, stop and report the prerequisite. Do not recreate station validation, locking, activity, transaction, or audit logic in controllers.

## Discovery

Before editing:

1. Locate the 7.3M internal single-attendee and selected-party service inputs/results, station validation, locking order, audit behavior, and tests.
2. Locate the 7.3D single-attendee and 7.3G selected-party endpoints, validators, DTOs, error mapping, idempotency, and tests.
3. Locate the 7.3K station list endpoint and its safe station identifiers/statuses.
4. Identify opaque-ID, optional-field, unknown-field, CSRF, request-size, logging, and integration-test conventions.
5. Run focused Blueprint 7.2–7.3M tests and report the exact baseline result.

## Scope

Extend the existing staff check-in APIs so an authorized client may optionally supply one active station ID:

- Single-attendee endpoint from 7.3D.
- Selected-party endpoint from 7.3G.

The API layer must:

- Accept an optional station opaque ID.
- Validate only its request-level shape.
- Pass it to the completed 7.3M service input.
- Preserve existing requests that omit the station ID.
- Map closed, cross-event, cross-tenant, and nonexistent station errors safely.
- Return safe station attribution only if the completed internal result exposes it.
- Preserve all 7.3M transaction, concurrency, idempotency, audit, and activity guarantees.
- Add focused validation, integration, tenant-isolation, authorization, concurrency, compatibility, and regression tests.
- Add a short Blueprint 7.3N release note.

## Out of scope

Do not add:

- UI station selection
- Requiring a station for check-in
- Kiosk mode
- Station selection stored in browser/session state
- Device tracking, IP storage, fingerprints, geolocation, or telemetry
- Changes to station lifecycle endpoints
- QR codes or scanning
- Walk-ins, self check-in, check-out, re-entry, correction, or undo
- Dashboards, exports, notifications, or background jobs
- New dependencies

## Request changes

Extend both existing request bodies with:

```json
{
  "stationId": "optional-opaque-station-id"
}
```

For single-attendee check-in, retain the existing attendee field.

For selected-party check-in, retain the existing explicit attendee-ID list.

Rules:

- `stationId` is optional.
- When present, it must be a nonblank valid opaque ID using existing conventions.
- Empty string must not mean null unless repository validators consistently normalize optional IDs that way.
- Tenant ID, actor ID, station status, timestamps, device label, and audit metadata remain forbidden.
- Unknown-field handling remains consistent with the existing endpoints.

Do not accept a station name in place of its opaque ID.

## Authentication and authorization

1. Retain the existing authentication, CSRF, and check-in operation permission.
2. Derive tenant and actor from trusted server context.
3. Do not require station-management permission merely to use an active station for check-in unless completed authorization policy explicitly requires it.
4. The client must be able to reference only a station resolved by 7.3M within the same tenant and event/occurrence.
5. Cross-tenant, cross-event, nonexistent, and closed station identifiers must fail through safe established responses.
6. Do not reveal whether a station exists in another tenant.

## Controller behavior

Controllers remain thin:

1. Validate the optional ID format.
2. Map the request into the existing service input.
3. Invoke the corresponding 7.3M-enabled service once.
4. Map its result/error through established response conventions.

Do not query station state in the controller. Do not update activity or attach attendance-action attribution in the API layer.

## Responses

Preserve existing response compatibility.

If 7.3M added a safe station ID to internal results and established API versioning permits adding it, return:

- `stationId`, nullable

Otherwise, leave response bodies unchanged and document that attribution is observable through authorized attendance history in a later patch.

Never return station device label, opener/closer, tenant ID, internal IDs, activity/audit details, IP address, fingerprint, geolocation, or raw user-agent data.

## Error mapping

Use established safe conventions:

- Malformed station ID → field validation response
- Nonexistent/cross-tenant/cross-event station → standard not-found response
- Closed station → established domain/conflict response
- Station closed during check-in → same safe conflict/not-found mapping chosen by 7.3M
- Unauthorized check-in actor → existing forbidden/masked response
- Already-present attendee → idempotent success without changing station attribution/activity
- Unexpected failure → generic server error with correlation ID

Do not expose lock failures, database constraints, stack traces, or tenant details.

## Backward compatibility

Requests that omit `stationId` must:

- Behave exactly as they did before 7.3N.
- Create attendance actions with null station attribution.
- Avoid updating any station’s activity.
- Preserve existing response shape unless repository versioning explicitly allows optional additions.

Existing clients must not be forced to choose a station.

## Idempotency and concurrency

- Pass existing API idempotency keys through unchanged.
- A retry with the same valid station and input must replay safely.
- Reusing a key with a materially different station must follow existing conflicting-reuse behavior.
- Already-present requests with a different station must not rewrite original attribution or update the new station’s activity.
- A station-close/check-in race must preserve 7.3M guarantees through the endpoint.
- Selected-party overlapping requests must not double-count or duplicate actions/activity updates.

Do not add an in-process mutex or a new idempotency system.

## Logging and privacy

- Do not log full request/response bodies.
- Treat station ID as an operational identifier under existing structured-log policy.
- Never collect or log device fingerprints, IP-derived identity, geolocation, or user-agent details for attribution.
- Preserve request correlation IDs and existing rate limits.

## Required tests

Add tests proving:

1. Single-attendee check-in accepts a valid same-event active station ID.
2. Selected-party check-in accepts a valid same-event active station ID.
3. Omitted station ID preserves exact prior behavior.
4. Malformed and blank station IDs follow validator conventions.
5. Cross-tenant, cross-event, nonexistent, and closed station IDs fail safely.
6. Authentication and existing check-in permission remain required.
7. Station-management permission is not accidentally required unless established policy says otherwise.
8. Controllers pass station ID to the 7.3M services and do not duplicate station logic.
9. Newly effective actions receive attribution and update activity through integration testing.
10. Already-present requests do not rewrite attribution or update activity.
11. Same idempotency key with a different station follows conflict behavior when supported.
12. Station-close/check-in concurrency remains safe through the endpoint.
13. Selected-party overlapping concurrency remains safe.
14. Responses contain only permitted fields.
15. Logs and responses contain no tracking/device details.
16. Existing pre-7.3N API contract tests still pass.
17. Existing Blueprint 7.2–7.3M tests continue to pass.

Use real application/database integration tests for attribution and race behavior when supported.

## Verification order

Run and report:

1. Focused baseline tests for Blueprints 7.2–7.3M
2. Formatting/check
3. Focused 7.3N validator/controller tests
4. Single and selected-party attribution integration tests
5. Real-database station-close/check-in endpoint race test
6. Backward-compatibility tests without station ID
7. Blueprint 7.2–7.3M regression tests
8. Full suite when feasible
9. Lint/static analysis
10. Type checking
11. Production build

Report exact commands and actual outcomes. Identify skipped, unavailable, or failing checks.

## Definition of done

- Existing check-in endpoints accept an optional station ID.
- Controllers pass station ID to 7.3M without duplicating domain logic.
- Omitted station ID preserves backward compatibility.
- Invalid, closed, and cross-scope stations fail safely.
- Attribution/activity remains atomic and idempotent.
- Responses and logs exclude tracking/device details.
- No UI or station requirement is added.
- Existing tests remain passing.
- Documentation identifies Blueprint 7.3O as the future staff station selector UI.

## Required final response from Cursor

Provide:

1. Discovery summary and exact baseline result.
2. Exact files changed grouped by validators/controllers/DTOs, tests, and documentation.
3. Final request/response compatibility behavior.
4. Authentication, permission, tenant isolation, error mapping, and idempotency behavior.
5. Confirmation that all station transaction/activity logic remains in 7.3M.
6. Exact verification commands and results.
7. Genuine limitations or unexecuted checks.
8. Confirmation that no UI, tracking, or station requirement was added.

## Deployment

This patch should not require a database migration.

After review:

1. Deploy through normal BITS procedures.
2. Verify old clients can check in without station ID.
3. Test valid active-station attribution in a non-production tenant.
4. Test closed, cross-event, and cross-tenant station IDs.
5. Repeat requests and exercise a station-close race.
6. Keep station selection unavailable in the UI until 7.3O is reviewed.

Record only the actual time spent on work allowed by the community-service program.
