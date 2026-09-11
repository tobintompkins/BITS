# BITS Blueprint 7.3A — Event Check-In Configuration Foundation

**Purpose:** Begin Blueprint 7.3 with one intentionally small, reviewable patch.  
**Prerequisite:** Blueprint 7.2 is complete and its tests pass.  
**Estimated work-session size:** About 45–90 minutes in a typical BITS checkout.  
**Patch style:** Additive, tenant-safe, disabled by default, and architecture-preserving.

## Cursor instruction

Implement this patch in the existing BITS repository. Inspect the repository before editing, use its actual paths and conventions, make the code changes, and run the relevant checks. Do not stop after writing a plan.

### Mandatory discovery

Before changing code, identify:

1. The framework, package manager, database, ORM, and migration system.
2. The tenant key and the standard tenant-scoped lookup pattern.
3. Existing event and event-registration-settings models from Blueprints 7.1–7.2.
4. Existing authorization, audit logging, validation, API error, form, and test patterns.
5. The baseline commands for focused event tests and the full test suite.

Record these findings and the actual baseline test result in the final implementation summary. Do not assume a test count.

## Scope

Add event check-in configuration only:

- `checkInEnabled`, default `false`
- `checkInOpensAt`, nullable
- `checkInClosesAt`, nullable
- `allowSelfCheckIn`, default `false`
- `allowWalkIns`, default `false`
- `allowCheckOut`, default `false`
- `allowReentry`, default `false`
- `requireRegistration`, default `true`

Store these fields on the existing event registration settings record when that is consistent with the repository. Otherwise, add the smallest one-to-one event check-in settings model following existing architecture.

Add:

- A tenant-scoped, authorized server operation for reading the settings.
- A tenant-scoped, authorized server operation for updating the settings.
- The corresponding event-admin settings form using existing UI components.
- Audit events for material setting changes, recording safe before/after values.
- Focused migration, service/API, authorization, tenant-isolation, validation, audit, and UI tests.
- A short Blueprint 7.3A release note using the repository’s documentation convention.

## Explicitly out of scope

Do not add attendance records, check-in stations, QR passes, scanning, check-in/check-out actions, walk-in creation, no-show processing, exports, live counts, notifications, background jobs, or new third-party dependencies. Those belong to subsequent 7.3 patches.

Do not refactor unrelated Blueprint 7.1 or 7.2 code.

## Rules and validation

1. Existing events must remain unchanged in behavior. Check-in is disabled after migration.
2. If both dates are present, `checkInClosesAt` must be later than `checkInOpensAt`.
3. Self check-in, walk-ins, check-out, and re-entry cannot be enabled while check-in is disabled. Prefer validation over silently rewriting submitted values.
4. Re-entry cannot be enabled unless check-out is enabled.
5. If `requireRegistration` is true, `allowWalkIns` must be false.
6. Date parsing and timezone handling must use existing event conventions.
7. Every lookup must apply the active tenant scope before resolving the event/settings object.
8. Cross-tenant identifiers must produce the repository-standard not-found response without revealing resource existence.
9. Read and update operations must use existing event-management permissions. Add a narrowly named check-in-settings permission only if the repository’s permission architecture requires feature-specific permissions.
10. Authorization must be enforced on the server; UI visibility is not a security boundary.
11. Audit logging must use the existing audit service and must not contain secrets or unrelated personal data.
12. Preserve optimistic concurrency/version checks if event settings already use them.

## Migration

Use the repository’s migration generator and established naming conventions.

The migration must:

- Add the fields with safe defaults and nullability.
- Keep `checkInEnabled` false for all existing rows/events.
- Add database check constraints for timestamp ordering and boolean invariants when the existing database/migration style supports them.
- Preserve tenant-aware foreign keys and row-level security policies, if present.
- Include a normal framework-supported rollback only when repository policy expects one.

Do not hand-write standalone SQL if the project uses generated ORM migrations.

## Server behavior

The read response should expose only the new configuration and standard safe event identity fields.

The update operation must:

1. Authenticate the actor.
2. Resolve the active tenant.
3. Authorize event-settings management.
4. Resolve the event within that tenant.
5. Validate the complete proposed configuration.
6. Persist it transactionally.
7. Append the audit record in the same transaction or through the existing guaranteed audit pattern.
8. Return the repository-standard safe DTO.

Use the existing validation and error response conventions. Do not introduce a second controller/service/form pattern.

## Admin UI

Add a compact “Check-in settings” section to the existing event administration experience.

It must:

- Clearly state that configuring these values does not yet add operational check-in.
- Use accessible labels and descriptions.
- Disable or hide dependent controls consistently, while still relying on server validation.
- Show existing form error and success patterns.
- Respect authorization.
- Work at existing supported viewport sizes.

## Required tests

Add focused tests proving:

- Defaults keep check-in disabled.
- A permitted manager can read and update same-tenant settings.
- An unauthorized user cannot read or update them.
- Tenant A cannot read or update Tenant B’s settings, including by guessed ID.
- Closing time must follow opening time.
- Dependent boolean invariants are enforced.
- Valid timestamps follow existing timezone behavior.
- A successful material update creates the expected audit entry.
- A rejected update creates no misleading success audit entry.
- Existing event-registration behavior remains unchanged.
- The settings form renders, saves valid data, and presents validation errors accessibly.

Run:

1. Baseline focused event tests before editing.
2. Migration validation against the normal test database.
3. Focused 7.3A tests.
4. Existing event/registration regression tests.
5. The full suite if feasible in the repository.
6. Formatting, lint, type checking, and build commands that the repository normally requires.

Report exact commands, pass/fail counts, and any check that was not run. Never claim an unexecuted check passed.

## Definition of done

- The migration applies cleanly.
- Existing events remain check-in disabled.
- Authorized staff can configure check-in policy and windows.
- Invalid combinations are rejected on the server.
- Tenant boundaries and permissions are tested.
- Material changes are audited.
- The admin UI follows existing patterns and is accessible.
- No operational check-in functionality or unrelated refactor is included.
- Existing tests continue to pass.
- The release note identifies this as Blueprint 7.3A and states that later 7.3 patches will add operational check-in.

## Required final response from Cursor

Provide:

1. Discovery summary and actual baseline result.
2. Exact files changed, grouped by migration, server, UI, tests, and docs.
3. A concise description of the delivered settings behavior.
4. Tenant-isolation, authorization, audit, and migration notes.
5. Exact verification commands and results.
6. Exact deployment order.
7. Any genuine limitations or unexecuted checks.

## Deployment order

After review:

1. Back up the database using the normal BITS procedure.
2. Apply the migration using the repository’s standard command.
3. Deploy the application.
4. Confirm an existing event still has check-in disabled.
5. Confirm an authorized manager can save a valid configuration.
6. Confirm a non-manager and a different tenant cannot access it.

This patch does not authorize enabling operational check-in for users; it only stores configuration for subsequent Blueprint 7.3 work.
