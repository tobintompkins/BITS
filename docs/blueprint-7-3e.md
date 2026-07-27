# Blueprint 7.3E — Minimal Staff Check-In Screen

**Status:** COMPLETE

## Route

`/events/[id]/staff-check-in`

- Visible in event admin actions when `canCheckIn` / `canOperateCheckIn`
- Server page guard: `notFound()` without `canOperateCheckIn`
- Calls Blueprint **7.3D** `POST /api/events/{eventId}/check-ins`
- Does not reimplement eligibility, transactions, or tenant rules in the browser

## Reused attendee selector

`components/events/event-attendee-search-select.tsx` wraps the existing  
`searchCheckInAttendeesAction` (event-scoped, permissioned, paginated).

Safe display fields only: name + confirmation code + registration status.  
No dietary notes, accommodations, birth dates, or internal notes.

## Screen behavior

- Shows event identity and availability state (disabled / not open / open / closed)
- Availability display is helpful only; 7.3D remains authoritative
- Explicit **Check in** submit; disabled while pending and when unavailable
- Feedback for success, already-present, validation, permission, window, ineligible, network, and server errors (`aria-live`)
- `Idempotency-Key` generated per submission
- Abort in-flight request on unmount

## Out of scope (not added)

QR, stations, walk-ins, party check-in, check-out, dashboards, exports, new search APIs.

## Next

Extended by Blueprint **7.3H** with selected-party check-in on the same route (single-attendee path retained).
