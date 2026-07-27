# Blueprint 7.3I — Check-In Station Data Foundation

**Status:** COMPLETE (foundation hardening; no new station API/UI)

## Decision: reuse existing station model

`EventCheckInStation` already existed from Blueprint 7.3 ops (`event_check_in_stations`, statuses `ACTIVE` | `CLOSED`).  
**7.3I does not create a parallel station concept.** It hardens constraints, indexes, and an internal foundation repository on top of that model—same keep-ops posture as 7.3A/7.3B.

Operational open/close services and the check-in console remain; this patch does not strip them and does not add a new public station lifecycle API.

## What this patch delivered

- `nameNormalized` (`lower(trim(name))`) for stable listing + uniqueness
- Database CHECK constraints for:
  - ACTIVE ⇒ null close fields; CLOSED ⇒ `closedAt` + `closedByUserId`
  - `closedAt >= openedAt`
  - `lastActivityAt >= openedAt` (when present)
  - name / deviceLabel length bounds (max 80)
- Partial unique index: **one ACTIVE station name per tenant + event** (case-normalized). Closed stations may reuse a name.
- Indexes for status, normalized name, opener, and active-by-event
- Foundation repository: `server/repositories/event-check-in-station.repository.ts`
  - `createActiveStation`
  - `findStationByEventId` (tenant + event + id only)
  - `listStationsForEvent` (status → nameNormalized → openedAt → id)
  - `lockStationForUpdate`
- Validation helpers: `lib/validation/event-check-in-station.ts`

## Uniqueness rule

Case-normalized uniqueness among **ACTIVE** stations within `(organizationId, eventId)`.  
Documented as a partial unique index (not app-only). Closing a station frees the name for reuse.

## Intentionally unchanged

- No new station API routes or management UI
- No device fingerprinting / IP / geolocation / user-agent storage
- No hard-delete helper (stations are closed, not destroyed)
- Existing single/party check-in remains independent of station attribution until a later patch
- No production backfill of stations

## Migration

`20260725010000_harden_event_check_in_station_foundation`

## Next

Blueprint **7.3J** — station lifecycle service (complete; see `docs/blueprint-7-3j.md`). Next: **7.3K**.
