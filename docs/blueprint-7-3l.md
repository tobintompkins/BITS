# Blueprint 7.3L — Check-In Station Management UI

**Status:** COMPLETE (management UI over 7.3K; no attribution yet)

## Route

`/events/{eventId}/check-in-stations`

- Server page guard: `canManageCheckIn` (operate-only roles → `notFound()`)
- Event detail nav entry: same permission via `canShowCheckInStationsNav`
- Client panel calls 7.3K HTTP API only (no lifecycle logic in the browser)

## Behaviors

- Open station: name (required) + optional device label; client length/trim helpers; server authoritative
- List: server-paginated; optional `ACTIVE` / `CLOSED` filter; stable server order
- Close: confirmation dialog naming the station; pending disables other close actions; `ALREADY_CLOSED` treated as idempotent success
- Duplicate submit guards for open/close
- Stale list responses ignored via request generation
- Viewing/listing does not mutate `lastActivityAt`

## Accessibility

- One page heading
- Labeled form fields with help + error associations
- Status text (not color-only)
- Accessible close button names and confirmation dialog
- Live region for success/error feedback
- Keyboard operable; focus restored after close dialog

## Intentionally unchanged

- No kiosk mode
- No station selection for check-in
- No attendance attribution
- No rename / reopen / delete
- No device fingerprints, IP, geolocation, or telemetry
- No QR / walk-in / check-out / dashboards / exports

## Next

Blueprint **7.3M** — station attribution in check-in services (complete; see `docs/blueprint-7-3m.md`). Next: **7.3N**.
