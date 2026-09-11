# BITS Blueprint 7.3G — Selected Party Check-In API

Prerequisites: Blueprints 7.2 through 7.3F must be implemented and passing.

## Cursor instruction

Implement this patch in the existing BITS repository now. Inspect the repository first, follow its actual architecture, make the changes, and run the required checks. Do not stop after producing a plan.

If the transaction-safe selected-party service from Blueprint 7.3F is missing or failing, stop and report the prerequisite. Do not recreate its domain or transaction logic in the API layer.

## Discovery

Before editing:

1. Locate the actual 7.3F service, input/result types, attendee limit, duplicate-ID behavior, errors, transaction behavior, authorization, and tests.
2. Locate the 7.3D single-attendee endpoint and reuse its route, authentication, tenant-context, CSRF, validation, error-mapping, logging, rate-limit, and integration-test conventions.
3. Identify established array validation, request-size, opaque-ID, API versioning, and idempotency behavior.
4. Run the focused Blueprint 7.2–7.3F tests and report the exact baseline result.

Do not assume paths, framework, request envelopes, or test counts.

## Scope

Expose the completed 7.3F selected-party service through one thin authenticated staff endpoint.

The endpoint must:

- Follow the existing BITS API organization and naming.
- Derive tenant and actor identity from trusted authenticated context.
- Accept an event/occurrence ID, registration ID, and explicit bounded attendee-ID list.
- Validate request shape using existing validators.
- Invoke the 7.3F service once.
- Map its established errors to safe standard responses.
- Return its safe aggregate result using existing response conventions.
- Preserve 7.3F atomicity, tenant isolation, authorization, audit, concurrency, and idempotency.
- Add focused validation, integration, authorization, tenant-isolation, error-mapping, concurrency, and regression tests.
- Add a short Blueprint 7.3G release note.

## Out of scope

Do not add:

- UI or navigation
- Attendee search
- An implicit “all attendees” option
- QR codes or scanning
- Stations, walk-ins, or self check-in
- Check-out, re-entry, correction, or undo
- No-show processing
- Exports, dashboards, notifications, polling, or background jobs
- A second selected-party service
- New dependencies

Keep the controller thin. Do not move eligibility, transaction, locking, audit, or tenant rules out of 7.3F.

## Endpoint

Use repository route and verb conventions. A logical equivalent is:

`POST /events/{eventId}/registrations/{registrationId}/check-ins`

Request:

```json
{
  "attendeeIds": [
    "opaque-attendee-id-1",
    "opaque-attendee-id-2"
  ]
}
```

If event occurrences are established, use the occurrence identifier consistently. Do not force this example path onto a differently organized API.

The request must not accept:

- Tenant ID
- Actor user ID
- Source
- Attendance status or count
- Timestamps
- Registration status
- Audit metadata
- An `all`, wildcard, or select-everyone flag

Source remains server-controlled as `STAFF_SEARCH`.

## Validation

Validate through existing request-schema conventions:

- Event/occurrence ID is required and well formed.
- Registration ID is required and well formed.
- `attendeeIds` is required and is an array.
- At least one attendee ID is supplied.
- The maximum exactly matches the implemented 7.3F service limit.
- Every attendee ID uses the established opaque format.
- Duplicate IDs follow the 7.3F behavior; do not create a conflicting API rule.
- Unknown fields follow existing strictness conventions.
- Content type and request size follow existing middleware.
- Idempotency-key format is validated only if the completed API convention supports it.

Request validation must not attempt to determine party membership. The 7.3F service remains authoritative.

## Authentication, authorization, and tenant isolation

1. Require the same authentication and check-in operation permission as 7.3D.
2. Derive tenant and actor from trusted server context.
3. Never accept client tenant or actor identity.
4. Apply the same CSRF protection as comparable authenticated mutation routes.
5. Let the 7.3F service resolve event, registration, and all attendees within tenant scope.
6. Mixed-tenant, mixed-event, or mixed-registration lists must fail atomically.
7. Cross-tenant and nonexistent identifiers must use repository-standard indistinguishable not-found behavior.
8. Do not reveal which item in a supplied list exists in another tenant or registration.

## Response

Return the safe 7.3F result through established response/envelope conventions:

- Event/occurrence opaque ID
- Registration opaque ID
- Requested attendee count
- Newly checked-in count
- Already-present count
- Ordered per-attendee results containing only:
  - attendee opaque ID
  - attendance opaque ID
  - resulting status
  - first and last check-in timestamps
  - check-in count
  - `CHECKED_IN` or `ALREADY_PRESENT` outcome

Do not return attendee names, contact details, household data, notes, internal database IDs, tokens, raw audit metadata, or version fields.

Use the established success status code. An all-already-present request is an idempotent success.

## Error mapping

Follow the 7.3D and repository error conventions:

- Unauthenticated → standard authentication response
- Unauthorized → standard forbidden or masked response
- Malformed request → safe field validation response
- Missing/cross-tenant resources → standard not-found response
- Disabled or outside-window check-in → established safe domain/conflict response
- Ineligible attendee/registration or mixed party → established safe domain/conflict or masked-not-found response
- Over-limit selection → validation response
- Already present → success, not an error
- Unexpected failure → generic server response with correlation ID

Never return stack traces, SQL/ORM messages, lock errors, tenant identifiers, or sensitive attendee details.

## Idempotency and concurrency

If the existing API idempotency convention is present:

- Read its normal header.
- Pass it through using the existing adapter.
- Scope and validate key reuse according to established behavior.
- Reject materially conflicting reuse.

Do not create a generic idempotency framework if none exists.

Two overlapping concurrent endpoint requests must preserve 7.3F guarantees: one effective first check-in and one action per attendee, no duplicate row, no partial party transition, and correct safe results.

## Logging and request safety

- Use existing request-size and array-size controls.
- Preserve correlation IDs and safe structured logs.
- Do not log complete request bodies or result arrays if they reveal attendee identifiers beyond existing policy.
- Do not log personal data or raw authorization/session material.
- Apply existing rate limits used for comparable staff mutations.
- Do not add new global middleware.

## Required tests

Add tests proving:

1. Authorized staff can check in two selected attendees from one same-tenant registration.
2. The endpoint invokes the 7.3F service rather than duplicating transaction logic.
3. Authentication and the correct permission are required.
4. Tenant A cannot check in or infer Tenant B’s registration or attendees.
5. Empty, non-array, malformed, duplicate, and over-limit inputs follow the required validation rules.
6. Unknown fields follow repository strictness conventions.
7. Mixed-registration/event/tenant lists fail atomically and safely.
8. Disabled, outside-window, inactive, cancelled, and non-confirmed cases map correctly.
9. One new plus one already-present attendee returns accurate counts and safe per-attendee results.
10. Repeating the request is idempotent.
11. Overlapping simultaneous endpoint requests do not double-count.
12. A service failure returns a safe response and no partial commit.
13. CSRF and request-size behavior matches comparable mutations.
14. Responses contain only allowed fields.
15. Unexpected failures expose no stack trace or database details.
16. Existing Blueprint 7.2–7.3F tests continue to pass.

Use real application/database integration tests for concurrency and atomicity when supported.

## Verification order

Run and report:

1. Focused baseline tests for Blueprints 7.2–7.3F
2. Formatting/check
3. Focused 7.3G validation and endpoint tests
4. Real-database overlapping-concurrency endpoint test
5. Real-database atomic rollback endpoint test
6. Blueprint 7.2–7.3F regression tests
7. Full suite when feasible
8. Lint/static analysis
9. Type checking
10. Production build

Report exact commands and actual outcomes. Identify skipped, unavailable, or failing checks.

## Definition of done

- One authenticated selected-party check-in endpoint exists.
- It accepts only an explicit bounded attendee list.
- It is a thin adapter over the 7.3F service.
- Tenant and actor come from trusted context.
- Validation and error responses follow BITS conventions.
- Atomicity and concurrency guarantees survive through the API.
- Response data is minimal and safe.
- No UI or unrelated check-in feature is added.
- Existing tests remain passing.
- Documentation identifies Blueprint 7.3H as the future selected-party staff UI.

## Required final response from Cursor

Provide:

1. Discovery summary and exact baseline result.
2. Exact files changed grouped by route/controller, validation/DTO, tests, and documentation.
3. Final method/path, request limit, and duplicate-ID behavior.
4. Authentication, authorization, tenant isolation, CSRF, and error mapping.
5. Confirmation that transaction and eligibility logic remain in 7.3F.
6. Exact verification commands and outcomes.
7. Genuine limitations or unexecuted checks.
8. Confirmation that no UI or unrelated feature was added.

## Deployment

This patch should not require a database migration.

After review:

1. Deploy through the normal BITS process.
2. Exercise a two-attendee request in a non-production tenant.
3. Verify an unselected attendee remains unchanged.
4. Verify unauthorized and cross-tenant requests fail safely.
5. Repeat and overlap requests to confirm no double-counting.
6. Keep this endpoint out of normal UI navigation until Blueprint 7.3H is reviewed.

Record only the actual time spent on work allowed by the community-service program.
