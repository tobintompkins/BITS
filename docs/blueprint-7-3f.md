# Blueprint 7.3F — Selected Party Check-In Service

**Status:** COMPLETE (internal service; no API/UI in this patch)

## What this patch delivered

Internal application service:

`staffCheckInSelectedParty` in `server/services/staff-check-in.service.ts`

It checks in an **explicitly selected subset** of attendees from **one** confirmed registration, atomically, for an authorized staff actor with:

- `canOperateCheckIn` authorization
- Tenant-scoped lookups (`organizationId` before IDs)
- Same 7.3A settings + time-window rules as 7.3C
- Same eligibility as 7.3C (registration `CONFIRMED` or `CHECKED_IN`; attendee active)
- At least one selected attendee; max **25** after deterministic dedupe
- One database transaction for the whole selection
- Shared transaction-bound helper `applyStaffAttendeeCheckInInTx` (also used by 7.3C)
- Deterministic lock/apply order by attendee ID; results returned in request order
- Per newly checked-in attendee: one `CHECKED_IN` action (`STAFF_SEARCH`)
- Already-present: no count bump, no duplicate action
- One aggregate audit `EVENT_STAFF_PARTY_CHECKED_IN` when any new check-in occurred
- Safe aggregate + per-attendee result DTO (no PII)

Optional `operationKey` uses existing `EventCheckInIdempotency`.

## Input limits

| Rule | Behavior |
| --- | --- |
| Empty list | Rejected (`VALIDATION`) |
| Max attendees | 25 (`STAFF_PARTY_CHECK_IN_MAX_ATTENDEES`) |
| Duplicate IDs | Trim + drop empties + dedupe preserving first-seen order |
| Mixed registration / tenant / event | Entire operation rejected (`ATTENDEE_NOT_FOUND` masked) |
| Unselected party members | Untouched |

## Relationship to existing Blueprint 7.3 ops / 7.3C–E

- Broader ops check-in (stations, QR, walk-ins) remains unchanged.
- 7.3C `staffCheckInRegisteredAttendee` remains the single-attendee public service API; internals now share `applyStaffAttendeeCheckInInTx`.
- 7.3D/7.3E single-attendee API/UI are unchanged.
- **7.3G** — thin selected-party API (complete; see `docs/blueprint-7-3g.md`). Next: **7.3H** selected-party staff UI.

## Intentionally unchanged

- No public routes, controllers, or UI
- No “check in everyone” implicit action
- No QR, stations, walk-ins, check-out, re-entry, corrections
- Does not mutate registration or attendee rows
- No schema migration required

## Deployment

1. Back up the database.
2. Deploy application code (no migration expected).
3. Run focused party + 7.3C staff-check-in tests.
4. Confirm no new public check-in route or UI was introduced by this patch.
