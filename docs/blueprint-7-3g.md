# Blueprint 7.3G — Selected Party Check-In API

**Status:** COMPLETE (thin API; no UI in this patch)

## Endpoint

`POST /api/events/{eventId}/registrations/{registrationId}/check-ins`

Thin authenticated adapter over Blueprint 7.3F `staffCheckInSelectedParty`.

### Request

```json
{ "attendeeIds": ["<uuid>", "<uuid>"] }
```

Optional header: `Idempotency-Key` (1–120 chars) → passed as 7.3F `operationKey`.

Rules (aligned with 7.3F):

- At least one attendee ID
- Max **25** after deterministic dedupe (trim / drop empties / first-seen order)
- Strict body — rejects tenant ID, actor ID, source, status, timestamps, audit metadata, `all` flags
- Source remains server-controlled `STAFF_SEARCH`
- Party membership is **not** validated in the API layer; 7.3F is authoritative

### Response

`201` when `newlyCheckedInCount > 0`, otherwise `200` (all already present):

- `eventId`, `registrationId`
- `requestedCount`, `newlyCheckedInCount`, `alreadyPresentCount`
- `attendees[]` with `attendeeId`, `attendanceId`, `status`, timestamps, `checkInCount`, `outcome`

No attendee PII, tokens, or audit payloads.

### Auth / safety

- Clerk `auth()` required (`401` if missing)
- Permission enforced inside 7.3F (`canOperateCheckIn`)
- Soft CSRF: when `Origin` is present it must match `Host`
- Domain errors mapped via shared `mapStaffCheckInError` (404 masked for cross-tenant / mixed-party misses, 409 for eligibility/window, 500 generic otherwise)

## Intentionally unchanged

- No UI or navigation
- No attendee search, “check in everyone”, QR, stations, walk-ins, check-out
- Transaction, locking, eligibility, and audit remain in 7.3F
- No schema migration

## Next

Blueprint **7.3H** — selected-party staff UI (complete; see `docs/blueprint-7-3h.md`). Next: **7.3I**.
