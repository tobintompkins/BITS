# BITS Blueprint 7.3B — Attendance Data Foundation

**Purpose:** Add the database and domain foundation for event attendance without exposing operational check-in yet.  
**Prerequisites:** Blueprints 7.2 and 7.3A are complete and passing.  
**Expected size:** One modest, reviewable work session; record actual time spent.  
**Patch style:** Additive, tenant-safe, auditable, and disabled at the application boundary.

## Cursor execution instruction

Implement every requirement in this file in the existing BITS repository. Inspect the repository first, follow its real architecture and naming, make the changes, and run the required checks. Do not stop after producing a plan.

## 1. Discovery before editing

Identify and report:

1. Framework, package manager, database, ORM, and migration workflow.
2. Tenant key and standard tenant-scoped relationship pattern.
3. Event, event occurrence (if any), registration, attendee, and 7.3A settings models.
4. Existing enum, identifier, timestamp, optimistic-locking, soft-delete, and audit conventions.
5. Existing database-level tenant safeguards, including composite foreign keys or row-level security.
6. Test database workflow and exact baseline commands.

Run the focused event/registration tests before editing and report the actual result. Do not assume a historic test count.

## 2. Scope

This patch adds only:

- The attendance status and source domain values.
- An event-attendance persistence model.
- An append-only attendance-action persistence model.
- Tenant-aware relationships, constraints, and indexes.
- ORM/domain mapping and repository/data-access support needed to persist and read these records internally.
- Fixtures or factories needed by later check-in patches.
- Focused schema, model, repository, authorization-boundary, tenant-isolation, and migration tests.
- A short Blueprint 7.3B release note.

There must be no public API, controller, route, check-in service, QR pass, scanner, station, walk-in flow, admin screen, member screen, export, notification, or background job in this patch.

No user can check in as a result of deploying 7.3B.

## 3. Attendance model

Adapt names and types to the repository’s conventions.

Required fields:

- `id`
- tenant/organization/church ID
- event ID or event-occurrence ID, following the existing event model
- registration ID
- attendee ID
- member ID, nullable for guest attendees
- `status`
- `source`, nullable until a check-in action occurs if that best fits existing conventions
- `firstCheckedInAt`, nullable
- `lastCheckedInAt`, nullable
- `checkedOutAt`, nullable
- `checkInCount`, default zero
- `createdAt`
- `updatedAt`
- optimistic version field only if the project already uses one

Statuses:

- `EXPECTED`
- `PRESENT`
- `CHECKED_OUT`
- `NO_SHOW`
- `CANCELLED`

Sources:

- `STAFF_SEARCH`
- `STAFF_QR`
- `SELF_QR`
- `WALK_IN`
- `ADMIN_CORRECTION`

Do not add `IMPORT` unless an established BITS attendance-import facility already exists.

### Required invariants

1. Tenant, event/occurrence, registration, attendee, and member references must agree.
2. The attendee must belong to the referenced registration and event.
3. There is at most one attendance row per tenant + event/occurrence + attendee.
4. `checkInCount` cannot be negative.
5. A newly created row is `EXPECTED`, has count zero, and has null check-in/check-out timestamps.
6. Guest attendees may have a null member ID; member-backed attendees must retain the correct same-tenant member relationship.
7. Attendance history is not hard-deleted.
8. Do not copy attendee names, email addresses, phone numbers, dietary notes, or accommodation notes into the attendance table.

Use database constraints for invariants that the project’s database and migration conventions can safely enforce. Also validate through existing model/domain mechanisms where appropriate.

## 4. Attendance-action model

Add an append-only history record with:

- `id`
- tenant/organization/church ID
- event ID or event-occurrence ID
- attendance ID
- `action`
- `source`
- actor user ID, nullable only for a future permitted self-service action
- `occurredAt`
- `reason`, nullable
- safe metadata, nullable only if the existing audit/domain pattern supports bounded structured metadata
- `createdAt` if required by repository convention

Actions:

- `CHECKED_IN`
- `CHECKED_OUT`
- `REENTERED`
- `MARKED_NO_SHOW`
- `UNDO_CHECK_IN`
- `STATUS_CORRECTED`

### History rules

1. Attendance actions are append-only.
2. Application repository methods must not expose update or delete operations for history rows.
3. All references must share the same tenant and event/occurrence.
4. Metadata must not store credentials, bearer tokens, raw QR values, or unnecessary personal data.
5. Correction semantics are not implemented in this patch; only the future-compatible action type and storage shape are added.

## 5. Repository/data-access boundary

Add only the smallest internal persistence abstraction consistent with BITS.

It may support:

- Creating an initial `EXPECTED` attendance row for tests and future services.
- Reading attendance by tenant + event/occurrence + attendee.
- Listing actions for one attendance row using stable chronological ordering.

Every method must require tenant context or begin from an already tenant-scoped query. Never provide an unscoped “find by ID” helper.

Do not add state-transition methods yet. Blueprint 7.3C will add the first transaction-safe staff check-in service.

## 6. Migration

Use the repository’s standard migration generator.

The migration must:

- Add enum values/types using the established strategy.
- Create attendance and attendance-action tables or repository-equivalent structures.
- Add tenant-aware foreign keys.
- Add a unique constraint for tenant + event/occurrence + attendee.
- Add a non-negative check constraint for `checkInCount` where supported.
- Add indexes for:
  - tenant + event/occurrence + status
  - tenant + event/occurrence + attendee
  - tenant + event/occurrence + member
  - tenant + event/occurrence + registration
  - attendance action + occurred time
- Extend row-level security policies if BITS already uses PostgreSQL RLS.
- Leave existing event, registration, and attendee rows unchanged.
- Avoid a bulk attendance backfill unless repository architecture strictly requires it.

If future expected-attendance rows will be created lazily, document that decision. Do not invent production rows merely to populate the new table.

## 7. Security and tenant isolation

- Apply tenant scope before resolving every attendance or action identifier.
- Cross-tenant references must fail with the repository-standard not-found behavior.
- Database relationships should prevent cross-tenant linkage wherever the existing schema supports that pattern.
- Do not expose the new records through a public endpoint.
- Do not weaken Blueprint 7.2 attendee privacy controls.
- Do not include sensitive attendee fields in fixtures unless a focused privacy test requires synthetic values.

## 8. Required tests

Add focused tests proving:

1. The migration applies to a clean test database.
2. The migration preserves existing events, registrations, attendees, and 7.3A settings.
3. A valid same-tenant attendance row can be created with safe defaults.
4. Duplicate attendance for the same event/occurrence and attendee is rejected.
5. Negative `checkInCount` is rejected.
6. Cross-tenant event, registration, attendee, member, and attendance-action references are rejected.
7. A registration/attendee mismatch is rejected.
8. Guest attendance permits a null member ID.
9. Action history is returned in stable chronological order with ID as a tie-breaker.
10. The repository exposes no action update/delete operation.
11. Unscoped ID lookup is not introduced.
12. Existing Blueprint 7.2 registration tests and Blueprint 7.3A settings tests still pass.

Use a real test database for database constraint assertions when supported. A mocked repository does not prove tenant-aware constraints.

## 9. Verification order

Run and report:

1. Baseline focused event/registration tests.
2. Formatting or format check.
3. Migration generation/validation.
4. Focused Blueprint 7.3B schema and repository tests.
5. Blueprint 7.2 and 7.3A regression tests.
6. Full test suite when feasible.
7. Lint/static analysis.
8. Type checking.
9. Production build when normally required.

Give exact commands and actual outcomes. Identify skipped or unavailable checks explicitly.

## 10. Definition of done

- Attendance and append-only attendance-action persistence exists.
- Schema and repository access are tenant-scoped.
- Same-event and same-registration relationships are enforced.
- Duplicate attendance and negative counts are prevented.
- No operational check-in surface exists.
- Existing events remain check-in-disabled.
- Existing registration and settings behavior is unchanged.
- Focused and regression tests pass.
- Documentation marks this as Blueprint 7.3B and identifies 7.3C as the future staff check-in service.

## 11. Required final response from Cursor

Provide:

1. Discovery summary and actual baseline results.
2. Exact changed files grouped by migration/schema, domain/data access, fixtures/tests, and documentation.
3. The implemented constraints and tenant-isolation safeguards.
4. Migration and rollback notes following repository policy.
5. Exact verification commands and outcomes.
6. Any unexecuted checks or genuine limitations.
7. Confirmation that no check-in API or UI was exposed.

## 12. Deployment order

After review:

1. Back up the database using normal BITS procedures.
2. Apply the generated migration.
3. Deploy the application code.
4. Confirm existing events remain check-in-disabled.
5. Run the repository’s tenant-isolation smoke test.
6. Confirm no new public route or UI entry point exists.

Blueprint 7.3B is a foundation patch only. Do not enable operational check-in until later patches implement and verify the required transaction, authorization, audit, and concurrency behavior.
