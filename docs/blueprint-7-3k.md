# Blueprint 7.3K — Check-In Station Lifecycle API

**Status:** COMPLETE (thin API; no UI in this patch)

## Endpoints

| Method | Path | 7.3J service |
| --- | --- | --- |
| `POST` | `/api/events/{eventId}/check-in-stations` | `openCheckInStationLifecycle` |
| `GET` | `/api/events/{eventId}/check-in-stations` | `listCheckInStationsLifecycle` |
| `POST` | `/api/events/{eventId}/check-in-stations/{stationId}/close` | `closeCheckInStationLifecycle` |

### Open body

```json
{ "name": "Welcome Desk", "deviceLabel": "Lobby tablet" }
```

Strict schema — rejects tenant/actor/status/timestamps/audit fields.

### List query

- `page` (default 1)
- `pageSize` (default 25, max 100)
- `status` optional: `ACTIVE` \| `CLOSED`

### Close body

Empty object only (`{}`). No invented fields.

## Responses

Safe station fields + mutation `outcome` when relevant:

- Open → `201` with `outcome: "CREATED"`
- Close → `200` with `outcome: "CLOSED"` or `"ALREADY_CLOSED"`
- List → `{ items, total, page, pageSize }`

## Auth / safety

- Clerk `auth()` required
- Management permission enforced inside 7.3J (`canManageCheckIn`)
- Soft CSRF: Origin must match Host when present
- Name conflicts → `409` (`STATION_NAME_CONFLICT`)
- Cross-tenant / missing → masked `404`
- Unexpected errors → generic `500` (no SQL/stack)

## Intentionally unchanged

- No station UI or navigation
- No attendance attribution
- No device tracking
- Lifecycle/transaction/audit remain in 7.3J
- No migration

## Next

Blueprint **7.3L** — station management UI (complete; see `docs/blueprint-7-3l.md`). Next: **7.3M**.
