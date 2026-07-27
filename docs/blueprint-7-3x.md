# Blueprint 7.3X — Check-Out and Re-Entry API

**Status:** COMPLETE (thin authenticated API over 7.3W; no UI)

## Endpoints

| Method | Path | Service |
| --- | --- | --- |
| `POST` | `/api/events/{eventId}/check-outs` | `staffCheckOutRegisteredAttendee` |
| `POST` | `/api/events/{eventId}/re-entries` | `staffReenterRegisteredAttendee` |

Uses **attendeeId** in the body (same convention as 7.3D check-ins), not attendanceId.

### Request

```json
{
  "attendeeId": "<uuid>",
  "stationId": "<optional-uuid>"
}
```

Optional header: `Idempotency-Key` (1–120 chars).

Strict body — rejects tenant/actor/status/timestamps/source/audit fields.

### Response

`201` on effective transition, `200` on idempotent already-complete:

- `attendanceId`, `eventId`, `attendeeId`, `status`
- `firstCheckedInAt`, `lastCheckedInAt`, `checkedOutAt`, `checkInCount`
- `outcome`: `CHECKED_OUT` | `ALREADY_CHECKED_OUT` | `REENTERED` | `ALREADY_PRESENT`

## Auth / safety

- Clerk auth required
- Soft CSRF (Origin must match Host when present)
- Permission/settings/station/locking/audit remain in 7.3W
- Errors via `mapStaffCheckOutError`

## Next

Blueprint **7.3Y** — staff check-out / re-entry UI.
