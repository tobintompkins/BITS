# Blueprint 7.3B — Attendance Data Foundation

**Status:** COMPLETE (embedded alongside completed Blueprint 7.3 ops)

## What this patch delivered

Blueprint 7.3B hardens the **attendance persistence foundation**:

- `EventAttendanceRecord` with `EXPECTED | PRESENT | CHECKED_OUT | NO_SHOW | CANCELLED`
- Append-only `EventAttendanceAction` history
- Tenant-scoped unique constraint `(organizationId, eventId, attendeeId)`
- Non-negative `checkInCount` database check
- Nullable `source` until a check-in/correction action sets one
- Internal foundation repository (`server/repositories/event-attendance.repository.ts`) for:
  - creating `EXPECTED` rows
  - reading by tenant + event + attendee
  - append-only action writes
  - chronological action listing

Expected-attendance rows are created **lazily** (tests/services); this patch does not backfill production rows.

## Relationship to Blueprint 7.3 / 7.3A / 7.3C

In this repository, operational check-in UI/services already exist as Blueprint 7.3. **7.3B documents and hardens the data layer** those services use. It does not strip ops surfaces.

- **7.3A** — check-in settings configuration  
- **7.3B** — attendance storage + internal data access (this patch)  
- **7.3C** — transaction-safe staff check-in service semantics (future formalization)

`IMPORT` remains in `EventAttendanceSource` because an established attendance/import path already exists in BITS.

## Design decisions

### Keep `registrationId` / `attendeeId` nullable

The 7.3B patch text lists registration and attendee IDs as required fields. In this repository they stay **nullable** on `EventAttendanceRecord` so walk-in attendance (Blueprint 7.3 ops) can persist without a prior registration/attendee. The foundation helper `createExpectedAttendance` still **requires** both IDs for registered-attendee rows.

### Do not strip operational check-in surfaces

The literal 7.3B definition of done says “no operational check-in surface exists.” That wording assumes a greenfield 7.3 sequence. This checkout already has staff check-in UI/services. **7.3B does not remove them.** It hardens the shared data foundation underneath. A pure “storage-only” branch would require a separate product decision; it is not recommended here.

### Safe action metadata

`appendAttendanceAction` runs metadata through `sanitizeAttendanceActionMetadata` (`lib/events/attendance-action-metadata.ts`): allowlisted keys only (`note`, `from`, `to`, `stationName`, `operationKey`, `correctionType`), string values only, and rejection of secret/PII-like keys and values.

### Test fixtures

Reusable graph factory: `server/repositories/event-attendance.fixtures.ts` (`createAttendanceFoundationFixture`).

## Invariants

1. Lookups always require `organizationId`.
2. Attendee must belong to the referenced registration and event.
3. At most one attendance row per tenant + event + attendee.
4. `checkInCount >= 0`.
5. New foundation rows are `EXPECTED`, count `0`, null check-in/out timestamps, null `source`.
6. Guest attendees may have null `memberId`.
7. Action history is append-only (no update/delete helpers on the foundation API).
8. Foundation `createExpectedAttendance` does not copy attendee PII fields (walk-in columns remain for existing ops only).

## Migrations

| Migration | Purpose |
| --- | --- |
| `20260711040000_add_event_check_in_attendance` | Introduced attendance + action tables |
| `20260712020000_harden_event_attendance_foundation` | 7.3B constraints + nullable source |

## Deployment order

1. Back up the database.
2. `npx prisma migrate deploy`
3. Deploy the application.
4. Confirm existing events remain check-in disabled (`EventCheckInSettings.checkInEnabled = false`).
5. Confirm no new public attendance API was introduced by this foundation slice.
