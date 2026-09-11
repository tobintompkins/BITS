# BITS Blueprint 7.3D — Staff Check-In API

Prerequisites: Blueprints 7.2 through 7.3C must be implemented and passing.

## Cursor instruction

Implement this patch in the existing BITS repository now. Inspect the repository first, follow its actual architecture, make the changes, and run the required checks. Do not stop after producing a plan.

If the internal transaction-safe staff check-in service from Blueprint 7.3C is missing or failing, stop and report that prerequisite. Do not recreate it inside the API layer.

## Discovery

Before editing:

1. Locate the actual 7.3C service, input/result types, errors, authorization policy, transaction behavior, and tests.
2. Identify the established authenticated API/controller/route pattern.
3. Identify tenant-context derivation, request validation, opaque-ID parsing, error mapping, rate limiting, CSRF protection, idempotency, API versioning, and response conventions.
4. Identify existing event-management routes and integration-test helpers.
5. Run focused Blueprint 7.2–7.3C tests and report the exact baseline result.

Do not assume historical filenames, routes, or test counts.

## Scope

Expose the completed 7.3C single-attendee staff check-in service through one thin authenticated server endpoint.

The endpoint must:

- Follow the existing BITS route/controller convention.
- Derive tenant and actor identity from the authenticated server context.
- Accept an event or occurrence ID and attendee ID using existing opaque-ID conventions.
- Accept an idempotency key only if the established BITS API already supports one.
- Validate request shape and bounded values.
- Invoke the existing 7.3C service exactly once per request.
- Map established domain errors to safe, repository-standard API responses.
- Return the existing safe 7.3C result DTO or a minimal API mapping of it.
- Preserve tenant-isolation, permission, audit, transaction, and concurrency guarantees from 7.3C.
- Add API/integration, authorization, tenant-isolation, validation, error-mapping, idempotency, and regression tests.
- Add a short Blueprint 7.3D API release note.

## Out of scope

Do not add:

- UI or navigation
- QR codes or scanners
- Party or bulk check-in
- Check-in stations
- Walk-ins or self check-in
- Check-out, re-entry, correction, or undo
- No-show processing
- Search, attendance listing, exports, or dashboards
- Notifications, webhooks, or background jobs
- A second check-in service
- New dependencies

Do not move transaction logic, eligibility logic, audit logic, or tenant rules into the controller.

## Endpoint shape

Use the repository’s established URL and verb conventions. A logical equivalent is:

`POST /events/{eventId}/check-ins`

Request body:

```json
{
  "attendeeId": "opaque-attendee-id"
}
```

Do not use this example path if BITS organizes routes differently. If event occurrences are established, use the occurrence identifier consistently.

The route must not accept:

- Tenant ID
- Actor user ID
- Attendance status
- Check-in count
- Timestamps
- Registration status
- Audit metadata
- Source chosen by the client

The source for this patch is server-controlled as `STAFF_SEARCH`.

## Authentication and authorization

1. Require authentication through the existing middleware/guard.
2. Derive the active tenant and actor from trusted context.
3. Enforce the established check-in operation permission through the same policy used by 7.3C.
4. Never authorize solely because the route is hidden from the UI.
5. Apply tenant scope before resolving event or attendee IDs.
6. Cross-tenant and nonexistent resources must use the repository-standard indistinguishable not-found behavior.
7. Do not disclose which eligibility or identifier failed when doing so would reveal another tenant’s data.

## Validation

Validate:

- Required event/occurrence identifier
- Required attendee identifier
- Correct opaque-ID format
- Correct content type and body size through existing middleware
- Idempotency-key format and length only if the feature already exists

Reject unknown or server-owned fields according to existing strictness conventions.

Do not duplicate domain eligibility validation in the controller. Check-in enabled state, time window, attendee status, and registration status remain the responsibility of the 7.3C service.

## Error mapping

Map service errors using existing BITS conventions:

- Unauthenticated → standard authentication response
- Unauthorized → standard forbidden response, unless repository policy intentionally masks it
- Missing or cross-tenant resource → standard not-found response
- Malformed request → standard validation response with safe field errors
- Check-in disabled or outside window → established domain/conflict response
- Ineligible attendee/registration → established domain/conflict response
- Already present → idempotent success, not a server error
- Unexpected failure → generic server error with correlation/request ID

Do not return stack traces, database errors, tenant identifiers, internal sequential IDs, or sensitive attendee data.

## Response

Use existing JSON/envelope conventions. Return only:

- Opaque attendance ID
- Event or occurrence ID
- Opaque attendee ID
- Resulting status
- First and last check-in timestamps
- Check-in count
- Whether a new transition occurred or the result was already present

Never return attendee contact details, sensitive notes, raw audit data, credentials, tokens, internal version fields, or unrelated registration data.

Use the established success status code. Sequential and concurrent duplicate requests must return consistent safe results.

## Request safety

- Apply existing CSRF protection for cookie-authenticated mutations.
- Apply existing request-size limits.
- Use existing rate limiting if comparable privileged mutation routes use it.
- Never log the full request or response if standard logging would expose personal data.
- Preserve correlation IDs and safe structured logging conventions.
- Do not create a new global middleware framework for this endpoint.

## Idempotency

If BITS already supports API idempotency:

- Read the key from the standard header.
- Pass it through using the established service adapter.
- Reject conflicting reuse according to existing behavior.
- Never use a client-provided key as a database identifier.

If BITS does not support API idempotency, do not invent a generic subsystem. The database-level idempotency and concurrency behavior from 7.3C remains mandatory.

## Required tests

Add integration/API tests proving:

1. Authorized staff can check in one eligible same-tenant attendee.
2. The response contains only allowed fields.
3. Authentication is required.
4. The correct permission is required.
5. Tenant A cannot check in or infer Tenant B’s attendee.
6. Malformed and missing IDs receive standard validation responses.
7. Unknown request fields follow repository strictness conventions.
8. Check-in-disabled, outside-window, cancelled, inactive, and non-confirmed cases map safely.
9. Already-present requests return idempotent success without another action or count increment.
10. Simultaneous endpoint requests create one effective check-in.
11. If supported, identical idempotency-key retries replay safely and conflicting reuse is rejected.
12. CSRF behavior matches comparable authenticated mutations.
13. Unexpected service errors do not expose stack traces or database details.
14. The controller invokes the existing service instead of reproducing its transaction logic.
15. Existing Blueprint 7.2–7.3C tests continue to pass.

Use real application/database integration tests for tenant and concurrency assertions when supported.

## Verification order

Run and report:

1. Focused baseline tests for Blueprints 7.2–7.3C
2. Formatting/check
3. Focused 7.3D validation and endpoint tests
4. Real-database duplicate/concurrency endpoint test
5. Blueprint 7.2–7.3C regression tests
6. Full suite when feasible
7. Lint/static analysis
8. Type checking
9. Production build when normally required

Report exact commands and actual results. Identify anything skipped, unavailable, or failing.

## Definition of done

- One authenticated staff check-in endpoint exists.
- The endpoint is a thin adapter over the 7.3C service.
- Trusted context supplies tenant and actor identity.
- Request data is validated.
- Domain errors map to safe standard responses.
- Responses contain no sensitive or internal data.
- Duplicate and concurrent requests remain idempotent.
- Tenant isolation and permission enforcement have integration coverage.
- No UI, QR, party, station, walk-in, check-out, or reporting feature is added.
- Existing tests remain passing.
- Documentation identifies Blueprint 7.3E as the future minimal staff check-in screen.

## Required final response from Cursor

Provide:

1. Discovery summary and exact baseline result.
2. Exact files changed, grouped by route/controller, validation/DTO, tests, and documentation.
3. Final endpoint method and path.
4. Authentication, permission, tenant-isolation, validation, and error-mapping notes.
5. Confirmation that transaction and eligibility logic remain in 7.3C.
6. Exact verification commands and outcomes.
7. Genuine limitations or unexecuted checks.
8. Confirmation that no UI or unrelated check-in feature was added.

## Deployment

This patch should not require a database migration.

After review:

1. Deploy the application through the normal BITS process.
2. Run authenticated same-tenant check-in smoke testing in a non-production environment.
3. Verify unauthorized and cross-tenant requests fail safely.
4. Verify a repeated request does not increment attendance twice.
5. Keep the endpoint inaccessible from normal UI navigation until the reviewed 7.3E screen is ready.

Record only the actual time spent on work allowed by the community-service program.
