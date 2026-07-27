# Blueprint 7.3A — Event Check-In Configuration Foundation

**Status:** COMPLETE (embedded in Blueprint 7.3)

## What this patch delivered

Blueprint 7.3A adds the **configuration foundation** for event check-in:

- `EventCheckInSettings` fields with `checkInEnabled` defaulting to `false`
- Tenant-scoped read/update server operations
- Zod + server invariant validation for windows and dependent booleans
- Material before/after audit (`EVENT_CHECK_IN_SETTINGS_UPDATED`)
- Admin “Check-in settings” panel on the event check-in experience
- Database CHECK constraints for window ordering and boolean invariants

## Relationship to Blueprint 7.3

In this repository, operational check-in (stations, attendance, QR passes, walk-ins) was already delivered as Blueprint 7.3. **7.3A hardens and documents the settings slice** that 7.3 depends on; it does not strip operational features.

Later operational behavior continues to honor these settings (disabled by default for existing events).

## Validation rules

1. Existing events remain check-in disabled until an authorized manager enables them.
2. If both dates are set, `checkInClosesAt` must be later than `checkInOpensAt`.
3. Self check-in, walk-ins, check-out, and re-entry cannot be enabled while check-in is disabled.
4. Re-entry requires check-out.
5. If `requireRegistration` is true, `allowWalkIns` must be false.
6. Lookups always filter by primary `organizationId` before resolving the event.

## Migrations

| Migration | Purpose |
| --- | --- |
| `20260711040000_add_event_check_in_attendance` | Introduced `EventCheckInSettings` (and 7.3 ops tables) |
| `20260712010000_add_check_in_settings_constraints` | 7.3A CHECK constraints + normalize invalid flag rows |

## Authorization

- Read: `canReadCheckIn` / `canManageCheckIn` / `canView`
- Update: `canManageCheckIn` (ORG_ADMIN, SUPER_ADMIN, DATA_ENTRY)
- Server enforcement is authoritative; UI visibility is not a security boundary.

## Deployment order

1. Back up the database.
2. `npx prisma migrate deploy`
3. Deploy the application.
4. Confirm an existing event still has check-in disabled.
5. Confirm an authorized manager can save a valid configuration.
6. Confirm a non-manager and a different tenant cannot access another org’s settings.
