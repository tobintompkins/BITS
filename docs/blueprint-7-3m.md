# Blueprint 7.3M — Station Attribution in Check-In Services

**Status:** COMPLETE (internal services only; no API/UI station selection)

## What changed

Optional station attribution for internal 7.3C / 7.3F staff check-in:

- `staffCheckInRegisteredAttendee({ stationId? })`
- `staffCheckInSelectedParty({ stationId? })`
- Shared helper `applyStaffAttendeeCheckInInTx` writes `stationId` on newly effective `CHECKED_IN` actions

Omitted `stationId` preserves prior unattributed behavior. Public 7.3D / 7.3G request schemas are unchanged.

## Attendance projection meaning

| Field | Meaning |
| --- | --- |
| `EventAttendanceAction.stationId` | Station where **this action** occurred (append-only; preferred attribution surface) |
| `EventAttendanceRecord.stationId` | Station of the **most recent effective check-in** (updated only on a new effective transition) |

Historical rows remain `NULL` (no backfill).

## Schema / migration

`20260725153000_station_attribution_composite_fks`

- Unique `(organizationId, eventId, id)` on stations (composite FK target)
- Composite FKs from attendance records/actions → stations on `(organizationId, eventId, stationId)`
- Index `(organizationId, eventId, stationId, occurredAt)` on actions

## Lock order

Documented deadlock-safe order inside the check-in transaction:

1. Event check-in settings (`FOR UPDATE`)
2. Station row when attributing (`FOR UPDATE`, tenant + event scoped)
3. Attendance row(s) (`FOR UPDATE`; party applies in sorted attendee-id order)

Station close also locks the station row, so a concurrent close either waits or wins; a closed station never receives a newly committed attributed check-in.

## Effective vs idempotent behavior

**Newly effective** (single or party with ≥1 new check-in):

- Set `stationId` on each new `CHECKED_IN` action
- Set attendance current-state `stationId` to the attributed station
- Update station `lastActivityAt` once to the transaction time
- Include opaque `stationId` in general audit metadata

**Already present / all-already-present party:**

- No new action
- No attribution rewrite
- No station activity update
- No material-success audit

## Intentionally unchanged

- No 7.3D / 7.3G API request field for `stationId`
- No UI station selector
- No kiosk, QR, walk-in, check-out, dashboards, or device tracking

## Next

Blueprint **7.3N** — optional station selection on staff check-in APIs (complete; see `docs/blueprint-7-3n.md`). Next: **7.3O**.
