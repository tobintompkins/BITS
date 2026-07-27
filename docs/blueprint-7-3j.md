# Blueprint 7.3J — Check-In Station Lifecycle Service

**Status:** COMPLETE (internal service; no API/UI in this patch)

## What this patch delivered

Internal lifecycle services in `server/services/check-in-station-lifecycle.service.ts`:

| Operation | Function |
| --- | --- |
| Open | `openCheckInStationLifecycle` |
| List | `listCheckInStationsLifecycle` |
| Close | `closeCheckInStationLifecycle` |

Built on Blueprint **7.3I** foundation repository methods (including `closeStationIfActive`).

## Authorization

Requires **`canManageCheckIn`** (management).  
Does **not** accept operate-only access (`canOperateCheckIn` alone is insufficient).

Existing ops console open/close (`openCheckInStation` / `closeCheckInStation`) remain for broader operator workflows; **7.3J is the formal management lifecycle contract**.

## Behavior

- Tenant + event scope before resolving station IDs
- Name/device-label validation via 7.3I rules
- Active name uniqueness conflicts → safe `VALIDATION` (not raw DB errors)
- Open/close use injected `now` clock
- Close is idempotent when already `CLOSED` (no second audit / no timestamp overwrite)
- Concurrent open of conflicting names → one success
- Concurrent close → one transition + one material audit
- List: status filter optional (`ACTIVE` \| `CLOSED`), page default 25 / max 100, order status → nameNormalized → openedAt → id
- Listing is read-only (does not update `lastActivityAt`)
- Safe DTO only (no tenant IDs, IP, UA, raw audit payloads)

## Intentionally unchanged

- No station API routes or UI
- No attendance attribution to stations
- No device tracking
- No schema migration (7.3I constraints reused)

## Next

Blueprint **7.3K** — thin station lifecycle API (complete; see `docs/blueprint-7-3k.md`). Next: **7.3L**.
