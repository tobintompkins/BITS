# Blueprint 7.3O — Station Selection in Staff Check-In UI

**Status:** COMPLETE (optional ACTIVE station selector on staff check-in)

## Screen

`/events/{eventId}/staff-check-in`

Shared optional selector above single-attendee and selected-party forms:

- Label: **Check-in station (optional)**
- Default: **No station**
- Source: 7.3K `GET /api/events/{id}/check-in-stations?status=ACTIVE` (paged to completion, max page size 100)
- Submits opaque `stationId` via 7.3N clients only when a station is chosen

## Permission

- Page remains `canOperateCheckIn`
- ACTIVE-only station list allows `canOperateCheckIn` **or** `canManageCheckIn` (7.3J list adjusted for this UI)
- Open/close/list-all (no ACTIVE filter) still require `canManageCheckIn`

## Selection lifecycle

- In-memory React state only for the current event screen
- Cleared when `eventId` changes
- Cleared + options refreshed when the selected station disappears or returns `STATION_CLOSED`
- Not written to localStorage, cookies, or device identity
- Not auto-selected; not inferred from the device
- Unchanged after a successful check-in

## Feedback

- Loading / empty ACTIVE list still allow unattributed check-in
- Closed/stale station: safe message, clear selection, refresh list, **no auto-retry**
- Already-present: does not claim attribution/activity changed
- Newly effective with station: confirms station name from the selected option

## Intentionally unchanged

- Station not required
- No kiosk mode
- No QR / walk-in / check-out / dashboards / tracking
- No migration

## Sequence complete

Blueprints **7.3I → 7.3O** (station foundation through staff selector UI) are complete.
