# BITS Blueprint 7.3K — Check-In Station Lifecycle API

Prerequisites: Blueprints 7.2 through 7.3J must be implemented and passing.

## Cursor instruction

Implement this patch in the existing BITS repository now. Inspect the repository first, follow its actual architecture, make the changes, and run the required checks. Do not stop after producing a plan.

If the authorized station open/list/close services from Blueprint 7.3J are missing or failing, stop and report the prerequisite. Do not recreate their domain, transaction, locking, audit, or tenant logic in controllers.

## Discovery

Before editing:

1. Locate the 7.3J open, list, and close services; their DTOs, errors, permissions, pagination, idempotency, and tests.
2. Locate the 7.3D and 7.3G check-in endpoints and reuse their route, authentication, trusted tenant-context, validation, CSRF, error-mapping, logging, rate-limit, and integration-test conventions.
3. Identify standard create/list/action endpoint patterns and pagination envelopes.
4. Identify opaque-ID, request-size, enum-filter, and idempotency-header conventions.
5. Run focused Blueprint 7.2–7.3J tests and report the exact baseline result.

Do not assume route paths, framework, response envelopes, or test counts.

## Scope

Expose the completed 7.3J services through thin authenticated endpoints for:

- Opening one check-in station.
- Listing stations for one event/occurrence.
- Closing one station.

The API must:

- Derive tenant and actor from trusted authenticated context.
- Enforce the established station/check-in management permission.
- Validate request and query shape.
- Call each corresponding 7.3J service once.
- Preserve service-level tenant isolation, transactions, concurrency, idempotency, and audit behavior.
- Map established errors to safe repository-standard responses.
- Return only safe station DTO fields.
- Add validation, authentication, authorization, tenant-isolation, pagination, concurrency, idempotency, error-mapping, and regression tests.
- Add a short Blueprint 7.3K release note.

## Out of scope

Do not add:

- Station UI, navigation, or kiosk mode
- Station attribution on check-in or attendance actions
- Rename/reopen/delete endpoints
- Device registration, fingerprints, IP storage, geolocation, or telemetry
- QR codes, scanning, or camera access
- Walk-ins, self check-in, check-out, re-entry, correction, or undo
- Dashboards, exports, notifications, or background jobs
- New dependencies

Keep controllers thin.

## Logical endpoints

Use actual BITS conventions. Logical equivalents are:

### Open

`POST /events/{eventId}/check-in-stations`

Body:

```json
{
  "name": "Welcome Desk",
  "deviceLabel": "Lobby tablet"
}
```

### List

`GET /events/{eventId}/check-in-stations`

Query parameters use established pagination and may include the exact 7.3J status filter.

### Close

`POST /events/{eventId}/check-in-stations/{stationId}/close`

Use an occurrence route when that is established. Do not force these sample paths onto a different API structure.

## Untrusted fields

Never accept from the client:

- Tenant ID
- Opening or closing actor ID
- Opened, closed, or activity timestamps
- Station status on create/close
- Audit metadata
- Internal ID/version
- IP address, user agent, fingerprint, geolocation, or hardware identifier

The server and 7.3J services control these values.

## Validation

Use existing request/query validators:

- Event/occurrence and station IDs must use valid opaque formats.
- Station name and device label must follow exact 7.3I/7.3J trimming, nullability, and length rules.
- Unknown fields follow repository strictness conventions.
- List pagination follows established defaults and maximum.
- Status filter accepts only values supported by 7.3J.
- Close request has no invented body fields.
- Content type and request size use existing middleware.
- Idempotency-key validation is used only if the API already supports it.

Do not duplicate database uniqueness, lifecycle, or tenant validation in controllers.

## Authentication, authorization, and tenant isolation

1. Require existing authentication middleware.
2. Derive tenant and actor from trusted server context.
3. Require the exact station-management permission used by 7.3J.
4. Apply existing CSRF protection to authenticated mutations.
5. Let 7.3J services resolve events and stations within tenant scope.
6. Cross-tenant and nonexistent resources use indistinguishable repository-standard not-found behavior.
7. Listing must never expose another tenant/event’s stations.
8. UI absence is not a security boundary.

## Responses

Use existing status codes and response envelopes.

Safe station fields:

- Station opaque ID
- Event/occurrence opaque ID
- Name
- Optional device label
- Status
- Opened time
- Closed time, nullable
- Last activity time, nullable
- Mutation outcome when relevant (`CREATED`, `CLOSED`, or `ALREADY_CLOSED`) using repository naming

List responses include only standard safe pagination metadata.

Do not return tenant IDs, internal sequential IDs, database versions, session data, raw audit data, IP addresses, fingerprints, geolocation, user agents, or unnecessary user details.

## Error mapping

Follow existing API conventions:

- Unauthenticated → standard authentication response
- Unauthorized → standard forbidden or masked response
- Malformed request/query → safe validation response
- Missing or cross-tenant event/station → standard not-found response
- Conflicting active station name → standard conflict/validation response
- Already closed → idempotent success
- Invalid page/filter → validation response
- Unexpected failure → generic server response with correlation ID

Never expose database constraint names, ORM/SQL errors, stack traces, or tenant information.

## Idempotency and concurrency

When established API idempotency exists:

- Read the standard header.
- Pass it through using the existing adapter.
- Reject conflicting key reuse according to repository behavior.

Do not invent a new generic framework.

Concurrent conflicting open requests must produce one created station and one safe conflict/idempotent result according to 7.3J.

Simultaneous close requests must produce one effective close, preserve the original closer/time, and return safe results without duplicate audit events.

## Logging and privacy

- Preserve correlation IDs and safe structured logging.
- Do not log complete request bodies or response DTOs when unnecessary.
- Never log authentication material, device fingerprints, IP-derived identity, or personal information.
- Apply existing rate limits for comparable privileged administration mutations.
- Do not add global middleware.

## Required tests

Add tests proving:

1. Authorized management staff can open a valid station.
2. Authentication and exact management permission are required.
3. Tenant A cannot open/list/close or infer Tenant B resources.
4. Open accepts only allowed fields and uses server actor/time/status.
5. Name/device-label validation matches 7.3J.
6. Concurrent conflicting opens map safely and create one station/audit transition.
7. Listing is tenant/event scoped, stably ordered, bounded, and safely paginated.
8. Valid and invalid status filters behave correctly.
9. Listing has no mutation or activity-time side effect.
10. Authorized management staff can close an active station.
11. Sequential repeated close is idempotent.
12. Simultaneous closes produce one effective transition and audit event.
13. Cross-event station IDs fail safely.
14. CSRF, content-type, and request-size behavior matches comparable routes.
15. Responses contain only allowed fields.
16. Unexpected failures reveal no stack/database details.
17. Controllers call 7.3J services rather than duplicating logic.
18. Existing Blueprint 7.2–7.3J tests continue to pass.

Use real application/database integration tests for concurrent open/close behavior when supported.

## Verification order

Run and report:

1. Focused baseline tests for Blueprints 7.2–7.3J
2. Formatting/check
3. Focused 7.3K validation and endpoint tests
4. Real-database concurrent-open endpoint test
5. Real-database simultaneous-close endpoint test
6. Blueprint 7.2–7.3J regression tests
7. Full suite when feasible
8. Lint/static analysis
9. Type checking
10. Production build

Report exact commands and actual outcomes. Identify skipped, unavailable, or failing checks.

## Definition of done

- Thin authenticated open, list, and close station endpoints exist.
- Trusted context supplies tenant and actor.
- Exact management permission is enforced.
- Validation and safe error mapping follow BITS conventions.
- List results are scoped, stable, and bounded.
- Concurrent opens and closes preserve 7.3J guarantees.
- Responses contain no internal, tracking, or sensitive data.
- No UI or attendance attribution is added.
- Existing tests remain passing.
- Documentation identifies Blueprint 7.3L as the future station management UI.

## Required final response from Cursor

Provide:

1. Discovery summary and exact baseline result.
2. Exact files changed grouped by routes/controllers, validators/DTOs, tests, and documentation.
3. Final methods, paths, fields, filters, and page limits.
4. Authentication, authorization, tenant isolation, CSRF, and error mapping.
5. Confirmation that lifecycle/transaction/audit logic remains in 7.3J.
6. Exact verification commands and results.
7. Genuine limitations or unexecuted checks.
8. Confirmation that no UI, tracking, or attendance attribution was added.

## Deployment

This patch should not require a database migration.

After review:

1. Deploy through normal BITS procedures.
2. Exercise open/list/close in a non-production tenant.
3. Verify unauthorized and cross-tenant requests fail safely.
4. Verify concurrent name conflict and repeated close behavior.
5. Keep station endpoints out of normal UI navigation until 7.3L is reviewed.
6. Confirm existing check-in still functions without station attribution.

Record only the actual time spent on work allowed by the community-service program.
