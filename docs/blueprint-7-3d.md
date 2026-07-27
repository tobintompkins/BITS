# Blueprint 7.3D — Staff Check-In API

**Status:** COMPLETE

## Endpoint

`POST /api/events/{eventId}/check-ins`

Thin authenticated adapter over Blueprint 7.3C `staffCheckInRegisteredAttendee`.

### Request

```json
{ "attendeeId": "<uuid>" }
```

Optional header: `Idempotency-Key` (1–120 chars) → passed as 7.3C `operationKey`.

Rejected in the body (strict schema): tenant ID, actor ID, source, status, timestamps, audit metadata, etc. Source is always server-controlled `STAFF_SEARCH`.

### Response

`201` on first transition, `200` when already present:

- `attendanceId`, `eventId`, `attendeeId`, `status`
- `firstCheckedInAt`, `lastCheckedInAt`, `checkInCount`
- `alreadyPresent`

No attendee PII, tokens, or audit payloads.

### Auth / safety

- Clerk `auth()` required (`401` if missing)
- Permission enforced inside 7.3C (`canOperateCheckIn`)
- Soft CSRF: when `Origin` is present it must match `Host`
- Domain errors mapped via `mapStaffCheckInError` (404 masked for cross-tenant misses, 409 for eligibility/window, 500 generic otherwise)

## Out of scope (not added)

UI, QR, stations, walk-ins, party check-in, check-out, dashboards, notifications.

## Next

Blueprint **7.3E** — minimal staff check-in screen over this API.
