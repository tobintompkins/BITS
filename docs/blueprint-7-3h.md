# Blueprint 7.3H — Selected Party Check-In UI

**Status:** COMPLETE

## Route

Extends the authorized Blueprint **7.3E** screen:

`/events/[id]/staff-check-in`

- Existing server page guard retained (`notFound()` without `canOperateCheckIn`)
- Single-attendee 7.3E path retained
- Adds **Selected party check-in** section that calls Blueprint **7.3G**

`POST /api/events/{eventId}/registrations/{registrationId}/check-ins`

## Registration / attendee data source

1. Reuses event-scoped `searchCheckInAttendeesAction` to find a registration (via an attendee match).
2. Loads that registration’s attendees through `getStaffCheckInPartyAttendees` / `getStaffCheckInPartyAttendeesAction`:
   - Requires `canOperateCheckIn`
   - Scoped by `organizationId` + `eventId` + `registrationId`
   - Returns only safe fields: names, confirmation code, registration/attendee/attendance status

Does **not** add a broad new search API. 7.3G remains authoritative for membership, eligibility, and authorization.

## Selection behavior

- No attendee selected by default
- Explicit checkboxes only (no select-all)
- Min 1 / max **25** (same as 7.3F/G)
- Changing registration clears prior selections and stale results
- Unselected attendees are never submitted
- Controls disabled while pending; one request per submit (`Idempotency-Key`)
- No optimistic “present” state before server success

## Accessibility / privacy

- Page heading + party section heading
- Fieldset/legend for multi-select; labels associated with checkboxes
- Selected count + maximum announced (`aria-live`)
- Success/error status region
- No contact info, birth dates, dietary/accommodation notes, household details, or internal notes

## Out of scope (not added)

QR, stations, walk-ins, check-out, dashboards, exports, notifications, select-all.

## Next

Blueprint **7.3I** — check-in station data foundation (complete; see `docs/blueprint-7-3i.md`). Next: **7.3J**.
