# BITS Blueprint 7.3J — Check-In Station Lifecycle Service

Prerequisites: Blueprints 7.2 through 7.3I must be implemented and passing.

## Cursor instruction

Implement this patch in the existing BITS repository now. Inspect the repository first, follow its actual architecture, make the changes, and run the required checks. Do not stop after producing a plan.

If the 7.3I station model, constraints, migration, or scoped repository is missing or failing, stop and report the prerequisite. Do not create a second station model.

## Discovery

Before editing:

1. Locate the actual 7.3I station model, status values, name-normalization/uniqueness rule, repository, constraints, migration, and tests.
2. Identify established tenant context, authorization, application-service, transaction, locking, clock, audit, error, and idempotency patterns.
3. Identify the actual event-management/check-in-management permission policy.
4. Identify list pagination and stable-order conventions.
5. Run focused Blueprint 7.2–7.3I tests and report the exact baseline result.

Do not assume filenames, enum spellings, permissions, or test counts.

## Scope

Add internal application services for:

- Opening one check-in station for an event/occurrence.
- Listing stations for one event/occurrence.
- Closing one active station.

The services must:

- Use trusted tenant and actor context.
- Enforce the established check-in-management permission.
- Apply tenant and event/occurrence scope before resolving station IDs.
- Reuse 7.3I validation, normalization, uniqueness, and repository conventions.
- Use the injected authoritative clock.
- Be transaction-safe and concurrency-safe.
- Record material open/close operations through existing audit logging.
- Return minimal safe internal DTOs.
- Add focused domain/service, authorization, tenant-isolation, transaction, concurrency, audit, pagination, and regression tests.
- Add a short Blueprint 7.3J release note.

## Out of scope

Do not add:

- API routes or controllers
- Station UI, navigation, or kiosk mode
- Station attribution on attendance actions
- Device registration, fingerprints, IP storage, geolocation, or telemetry
- QR codes, scanning, or camera access
- Walk-ins, self check-in, check-out, re-entry, correction, or undo
- Dashboards, exports, notifications, or background jobs
- New dependencies

## Authorization

1. Require authentication and the established permission for managing check-in settings/stations.
2. Reuse an existing event/check-in management permission if that is the completed architecture.
3. Do not reuse the lower-privilege check-in operate permission unless BITS policy explicitly treats station management as an operator action.
4. Derive tenant and actor from trusted context.
5. Cross-tenant and nonexistent events/stations must follow repository-standard safe not-found behavior.
6. Never rely on future UI visibility for authorization.

## Open-station service

Logical input:

- Trusted tenant context
- Authenticated actor
- Event/occurrence opaque ID
- Station name
- Optional device label
- Optional idempotency key only if BITS already supports service idempotency

Behavior:

1. Authorize the actor.
2. Resolve the event/occurrence inside the active tenant.
3. Trim and validate the station name and optional device label.
4. Start the repository-standard transaction.
5. Create an `ACTIVE` station using the 7.3I uniqueness rule.
6. Set `openedByUserId` to the actor and `openedAt` from the injected clock.
7. Leave close fields and `lastActivityAt` null unless the established model sets initial activity equal to opening time.
8. Record one safe material audit event.
9. Commit and return a safe station DTO.

Concurrent attempts to open conflicting station names must produce one success and one repository-standard conflict/validation result, not an unhandled database error.

Idempotent retry with the same established key must not create a second station or audit success event.

## List-stations service

Logical input:

- Trusted tenant context
- Authenticated actor
- Event/occurrence opaque ID
- Existing pagination parameters
- Optional status filter

Behavior:

- Authorize and resolve the event/occurrence within tenant scope.
- Return only stations for that tenant and event/occurrence.
- Use 7.3I’s stable ordering with an opaque/stable pagination tie-breaker.
- Apply existing maximum page size.
- Support `ACTIVE` and `CLOSED` filtering only if the repository’s list pattern supports filters cleanly.
- Return safe DTOs only.

Listing is read-only and must not update `lastActivityAt`.

## Close-station service

Logical input:

- Trusted tenant context
- Authenticated actor
- Event/occurrence opaque ID
- Station opaque ID
- Optional idempotency key only if already supported

Behavior:

1. Authorize the actor.
2. Resolve and lock the station through tenant + event/occurrence scope.
3. If active, set status to `CLOSED`.
4. Set `closedByUserId` to the actor.
5. Set `closedAt` from the injected clock.
6. Preserve `openedAt`, opener, name, device label, and activity history.
7. Record one safe material audit event.
8. Commit and return the safe station DTO.

Closing an already closed station must be idempotent:

- Do not change the original closer or close time.
- Do not create another material close audit event.
- Return the established already-completed/success result.

Two simultaneous close requests must create one effective transition and one material close audit event.

## Safe DTO

Return only:

- Station opaque ID
- Event/occurrence opaque ID
- Name
- Optional device label
- Status
- Opened time
- Closed time, nullable
- Last activity time, nullable
- Whether the requested mutation performed a new transition or was already complete

Include opener/closer display information only if comparable authorized administration DTOs already do so safely. Never return tenant IDs, internal sequential IDs, database versions, session data, IP addresses, user agents, or raw audit metadata.

## Audit

Use existing audit conventions for:

- Station opened
- Station closed

Safe metadata may include opaque station/event/actor identifiers, normalized safe station name, status, timestamps, and result. Do not include authentication data, device fingerprints, IP addresses, geolocation, or full request/response payloads.

Failed and rolled-back operations must not create misleading success audit records.

## Transaction and concurrency

- Use database uniqueness from 7.3I for concurrent opens.
- Translate expected uniqueness conflicts through existing domain-error conventions.
- Lock or compare-and-swap for station close.
- Do not rely on an in-process mutex.
- Use established bounded retry behavior only if the repository already provides it.
- Audit and state mutation must follow the existing guaranteed transactional/post-commit policy.

## Required tests

Add tests proving:

1. Authorized management staff can open a valid station.
2. Open sets actor/time/status and safe defaults correctly.
3. Blank, overlong, and invalid names/device labels are rejected.
4. Unauthorized actors cannot open, list, or close stations.
5. Tenant A cannot open/list/close or infer Tenant B resources.
6. Concurrent conflicting opens produce one station and one material audit event.
7. Same permitted name behavior across events/tenants follows 7.3I.
8. Listing is event/tenant scoped, stably ordered, and paginated.
9. Status filtering follows the implemented list contract.
10. Listing does not change activity time.
11. Authorized management staff can close an active station.
12. Close preserves opening identity/time and sets closing identity/time.
13. Sequential duplicate close is idempotent.
14. Simultaneous closes produce one effective close and one material audit event.
15. A transaction or required-audit failure leaves no partial state.
16. Safe DTOs exclude internal and tracking data.
17. No unscoped repository lookup is introduced.
18. Existing Blueprint 7.2–7.3I tests continue to pass.

Use a real test database for uniqueness, locking, and simultaneous-request assertions when supported.

## Verification order

Run and report:

1. Focused baseline tests for Blueprints 7.2–7.3I
2. Formatting/check
3. Focused 7.3J service tests
4. Real-database concurrent-open test
5. Real-database simultaneous-close test
6. Audit rollback/guarantee tests
7. Blueprint 7.2–7.3I regression tests
8. Full suite when feasible
9. Lint/static analysis
10. Type checking
11. Production build

Report exact commands and actual outcomes. Identify skipped, unavailable, or failing checks.

## Definition of done

- Internal open, list, and close station services exist.
- Management authorization and tenant scope are enforced.
- Open/close timestamps use the injected clock.
- Concurrent name conflicts map safely.
- Closing is transaction-safe and idempotent.
- Material transitions are audited exactly once.
- List results are scoped, stable, bounded, and read-only.
- No API, UI, tracking, or attendance attribution is added.
- Existing tests remain passing.
- Documentation identifies Blueprint 7.3K as the future thin station lifecycle API.

## Required final response from Cursor

Provide:

1. Discovery summary and exact baseline result.
2. Exact files changed grouped by services/domain, data access, tests, and documentation.
3. Permission and tenant-scoping rules.
4. Name-conflict, transaction, concurrency, idempotency, and audit behavior.
5. List ordering, filters, and page limits.
6. Exact verification commands and results.
7. Genuine limitations or unexecuted checks.
8. Confirmation that no API, UI, tracking, or attendance attribution was added.

## Deployment

This patch should not require a migration unless an essential 7.3I constraint is genuinely missing. Do not alter schema for naming preferences.

After review:

1. Back up the database under normal BITS procedures.
2. Apply a migration only if genuinely required and documented.
3. Deploy the internal service code.
4. Run same-tenant, cross-tenant, concurrent-open, and duplicate-close smoke tests.
5. Confirm no new station route or UI exists.

Record only the actual time spent on work allowed by the community-service program.
