# Blueprint 7.3W — Transaction-Safe Check-Out and Re-Entry Service

**Status:** COMPLETE (internal services; no API/UI)

## Summary

Staff-foundation services for single-attendee check-out and re-entry:

| Export | File |
| --- | --- |
| `staffCheckOutRegisteredAttendee` | `server/services/staff-check-out.service.ts` |
| `staffReenterRegisteredAttendee` | same |

Ops paths (`checkOutAttendance`, re-entry inside `checkInAttendeeById`) remain. This patch does not remove them.

## Semantics

| Field | Meaning |
| --- | --- |
| `checkedOutAt` | Current/most recent checkout while status is `CHECKED_OUT`; cleared to `null` on effective re-entry |
| `stationId` (attendance row) | Station of the most recent effective **entry** (`CHECKED_IN` / `REENTERED`); check-out does not rewrite it |
| `checkInCount` | First check-in = 1; each effective re-entry +1; check-out does not increment |
| `firstCheckedInAt` | Set once; never changed |
| `lastCheckedInAt` | Updates only on effective re-entry (not on check-out) |
| Action history | Authoritative immutable transition log (`CHECKED_OUT`, `REENTERED`) |

## Rules

- Permission: `canOperateCheckIn` (not correction)
- Settings: check-in enabled + window; `allowCheckOut` for checkout; both `allowCheckOut` and `allowReentry` for re-entry
- Eligibility: same registration/attendee rules as staff check-in
- Lock order: settings → optional station → attendance
- Idempotent: `ALREADY_CHECKED_OUT` / `ALREADY_PRESENT`
- Source: `STAFF_SEARCH`; audit only on effective transitions
- Does not mutate registration/attendee rows

## Next

Blueprint **7.3X** — thin check-out / re-entry API (complete; see `docs/blueprint-7-3x.md`).
