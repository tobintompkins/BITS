# Blueprint 7.3N — Station Attribution in Check-In APIs

**Status:** COMPLETE (optional `stationId` on 7.3D/7.3G; no UI)

## Endpoints

| Method | Path | Change |
| --- | --- | --- |
| `POST` | `/api/events/{eventId}/check-ins` | Optional `stationId` → 7.3M `staffCheckInRegisteredAttendee` |
| `POST` | `/api/events/{eventId}/registrations/{registrationId}/check-ins` | Optional `stationId` → 7.3M `staffCheckInSelectedParty` |

### Request body additions

```json
{ "stationId": "optional-opaque-station-uuid" }
```

- Optional; omitted requests keep prior unattributed behavior
- When present: must be a valid UUID (blank/malformed → 400)
- Strict schemas still reject tenant/actor/status/timestamps/device fields
- Controllers do **not** query or lock stations — 7.3M owns domain rules

### Responses

Unchanged for compatibility. Internal results do not yet expose `stationId`; attribution is persisted on attendance actions/records and visible to later authorized history surfaces.

Never returns device label, opener/closer, IP, fingerprint, or audit payloads.

## Errors

| Case | HTTP |
| --- | --- |
| Malformed/blank `stationId` | `400` field validation |
| Missing / cross-tenant / cross-event station | `404` `NOT_FOUND` |
| Closed station (including close race) | `409` `STATION_CLOSED` |
| Check-in permission denied | `403` (operate permission; manage not required) |

## Auth

- Same Clerk auth + soft CSRF as 7.3D/7.3G
- Requires `canOperateCheckIn` (via 7.3M service)
- Does **not** require `canManageCheckIn` merely to attribute to an active station

## Intentionally unchanged

- No UI station selector (see 7.3O)
- Station not required for check-in
- No migration
- No lifecycle/API changes to 7.3K stations endpoints

## Next

Blueprint **7.3O** — staff station selector UI (complete; see `docs/blueprint-7-3o.md`).
