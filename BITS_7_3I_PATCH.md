# BITS Blueprint 7.3I — Check-In Station Data Foundation

Prerequisites: Blueprints 7.2 through 7.3H must be implemented and passing.

## Cursor instruction

Implement this patch in the existing BITS repository now. Inspect the repository first, follow its actual architecture and naming, make the changes, and run the required checks. Do not stop after producing a plan.

If earlier Blueprint 7.3 attendance or check-in work is incomplete or failing, stop and report the prerequisite. Do not replace completed models or services.

## Discovery

Before editing:

1. Confirm the actual event/occurrence, tenant, user, attendance, and attendance-action models.
2. Confirm the database, ORM, migration, enum, identifier, timestamp, optimistic-locking, and soft-delete conventions.
3. Identify existing session/workstation/device-label concepts that could be reused.
4. Identify tenant-aware foreign-key and row-level-security patterns.
5. Identify repository/data-access, fixture, audit, and migration-test conventions.
6. Run focused Blueprint 7.2–7.3H tests and report the exact baseline result.

If an equivalent check-in station/session model already exists, extend or reuse it instead of creating a parallel concept. Document that decision.

## Scope

Add only:

- A check-in station/session status enum or repository-equivalent values.
- A tenant- and event/occurrence-scoped station persistence model.
- Safe relationships, constraints, and indexes.
- Internal repository/data-access methods needed for future station services.
- Factories/fixtures for focused tests.
- Migration, model, repository, tenant-isolation, constraint, and regression tests.
- A short Blueprint 7.3I release note.

No user-facing or externally callable station behavior may become available from this patch.

## Out of scope

Do not add:

- Station API routes or controllers
- Station management UI or kiosk mode
- Device registration, fingerprinting, or hardware identifiers
- QR passes, scanning, or camera access
- Changes to current single or party check-in requests
- Walk-ins or self check-in
- Check-out, re-entry, correction, or undo
- Dashboards, exports, notifications, or background jobs
- Offline synchronization
- New dependencies

## Station model

Adapt field names and types to established repository conventions.

Required fields:

- `id`
- tenant/organization/church ID
- event ID or event-occurrence ID, following the existing event architecture
- `name`
- `status`
- `deviceLabel`, nullable
- `openedByUserId`
- `openedAt`
- `closedByUserId`, nullable
- `closedAt`, nullable
- `lastActivityAt`, nullable
- `createdAt`
- `updatedAt`
- optimistic version field only if the project already uses one

Statuses:

- `ACTIVE`
- `CLOSED`

Do not add unused future statuses.

## Invariants

1. Tenant, event/occurrence, opener, and closer references must agree.
2. A new station is `ACTIVE`, has `openedAt`, and has null close fields.
3. A `CLOSED` station must have `closedAt` and `closedByUserId`.
4. An `ACTIVE` station must have null close fields.
5. `closedAt` cannot precede `openedAt`.
6. `lastActivityAt`, when present, cannot precede `openedAt`.
7. Station name is trimmed, required, and bounded using existing naming conventions.
8. Device label is trimmed, nullable, and bounded.
9. Do not store IP addresses, browser fingerprints, MAC addresses, advertising identifiers, geolocation, or raw user-agent strings.
10. Station records are not hard-deleted.
11. Existing attendance/check-in behavior remains independent until a later patch explicitly integrates station attribution.

Use database constraints where supported and consistent with BITS, plus domain/model validation where appropriate.

## Naming uniqueness

Follow the repository’s established naming policy.

If no relevant convention exists, enforce case-normalized uniqueness for active station names within:

- tenant + event/occurrence

Closed historical stations may reuse a name only if the database strategy can enforce this safely and existing conventions support partial unique indexes. Otherwise, use simple tenant + event/occurrence + normalized-name uniqueness and document that a renamed station is required.

Do not invent fragile application-only uniqueness.

## Internal repository boundary

Add only the smallest internal persistence interface consistent with BITS:

- Create an active station.
- Read a station by tenant + event/occurrence + station ID.
- List stations for one tenant-scoped event/occurrence in stable order.
- Lock/read a station for a future close or activity update operation.

Do not add public service operations for opening, closing, renaming, or updating activity yet.

Every method must require tenant and event/occurrence scope. Do not introduce an unscoped `findById`.

Stable list order should follow an existing convention; otherwise use status, normalized name, opened time, then opaque ID.

## Migration

Use the repository’s normal migration generator.

The migration must:

- Add the station status enum/type using established strategy.
- Create the station table or equivalent model.
- Add tenant-aware foreign keys to tenant, event/occurrence, opener, and closer.
- Add check constraints for status/close-field consistency and timestamp ordering where supported.
- Add the chosen safe name-uniqueness constraint/index.
- Add indexes for:
  - tenant + event/occurrence + status
  - tenant + event/occurrence + normalized name
  - tenant + openedByUserId
  - active stations by event/occurrence
- Extend row-level-security policies if BITS already uses PostgreSQL RLS.
- Leave all existing events, attendance rows, actions, and registrations unchanged.
- Require no production backfill.

Follow normal rollback policy when supported. Do not use standalone SQL if the ORM expects generated migrations.

## Security and privacy

- Apply tenant scope before resolving a station identifier.
- Database relationships must prevent cross-tenant event and user linkage where established schema patterns support it.
- Do not expose stations through a public endpoint.
- Do not add device tracking or unnecessary telemetry.
- Fixtures must use synthetic labels and identities.
- Do not place personal information in station names or device labels in tests or documentation.

## Required tests

Add tests proving:

1. The migration applies to a clean test database.
2. Existing Blueprint 7.2–7.3H data remains unchanged.
3. A valid active station can be persisted with safe defaults.
4. Blank, untrimmed, and overlong names follow validation conventions.
5. Device-label nullability and length are enforced.
6. Active/closed status and close-field combinations are enforced.
7. Closing before opening is rejected.
8. Activity before opening is rejected.
9. Cross-tenant event, opener, closer, and station references are rejected.
10. The chosen same-event name uniqueness rule is enforced under concurrent creation.
11. The same permitted station name may be used in another tenant or event.
12. Repository reads require tenant + event/occurrence scope.
13. No unscoped lookup method is introduced.
14. Station lists use stable ordering.
15. No IP, fingerprint, geolocation, or user-agent field is added.
16. Existing Blueprint 7.2–7.3H tests continue to pass.

Use a real test database for constraints and concurrent uniqueness where supported.

## Verification order

Run and report:

1. Focused baseline tests for Blueprints 7.2–7.3H
2. Formatting/check
3. Migration generation and validation
4. Focused 7.3I model/repository tests
5. Real-database uniqueness/concurrency test
6. Blueprint 7.2–7.3H regression tests
7. Full suite when feasible
8. Lint/static analysis
9. Type checking
10. Production build

Report exact commands and actual outcomes. Identify skipped, unavailable, or failing checks.

## Definition of done

- A tenant- and event/occurrence-scoped station model exists.
- Status and timestamp invariants are enforced.
- Naming uniqueness follows a documented database-safe rule.
- Internal repository access is scoped and minimal.
- No device fingerprinting or unnecessary tracking data exists.
- No station API, UI, or check-in integration is exposed.
- Existing attendance/check-in behavior remains unchanged.
- Existing tests remain passing.
- Documentation identifies Blueprint 7.3J as the future authorized station lifecycle service.

## Required final response from Cursor

Provide:

1. Discovery summary and exact baseline result.
2. Exact files changed grouped by migration/schema, model/data access, tests, and documentation.
3. Status, timestamp, name-normalization, and uniqueness rules.
4. Tenant foreign-key/RLS and privacy safeguards.
5. Exact verification commands and results.
6. Genuine limitations or unexecuted checks.
7. Confirmation that no API, UI, device tracking, or check-in integration was added.

## Deployment

After review:

1. Back up the database using normal BITS procedures.
2. Apply the generated migration.
3. Deploy application/model code.
4. Verify existing event check-in still works without station attribution.
5. Run tenant-isolation and uniqueness smoke tests.
6. Confirm no new route or navigation entry exists.

Record only the actual time spent on work allowed by the community-service program.
