# Blueprint 7.3C — Transaction-Safe Staff Check-In Service

**Status:** COMPLETE (internal service; no new public API/UI in this patch)

## What this patch delivered

Internal application service:

`staffCheckInRegisteredAttendee` in `server/services/staff-check-in.service.ts`

It checks in **one registered attendee** for an authorized staff actor with:

- `canOperateCheckIn` authorization
- Tenant-scoped lookups (`organizationId` before IDs)
- 7.3A settings + time-window enforcement
- Strict eligibility (registration `CONFIRMED` or `CHECKED_IN` only; `PENDING` rejected)
- Atomic transaction with settings + attendance row locks
- First transition → `PRESENT`, `checkInCount = 1`, one `CHECKED_IN` action (`STAFF_SEARCH`)
- Sequential/concurrent duplicate safety
- Domain history + general audit in the same transaction
- Safe result DTO (no attendee PII)

Optional `operationKey` uses existing `EventCheckInIdempotency`.

## Relationship to existing Blueprint 7.3 ops

A broader ops path (`checkInAttendeeById`) already exists with stations, QR, walk-ins, re-entry, and attendee-status updates. **7.3C does not remove it.**  
7.3C adds the formal, narrower internal contract required by this blueprint. Later **7.3D** is the thin staff API layer over this service.

## Eligibility

Rejected when:

- Check-in disabled, before open, or after close
- Attendee missing / wrong tenant / wrong event
- Attendee or registration cancelled
- Waitlisted / offered
- Registration not `CONFIRMED` or `CHECKED_IN` (includes `PENDING`)
- Attendance already `CHECKED_OUT` (re-entry out of scope here)

Window convention: open inclusive, close exclusive (`now > closesAt` rejected; exact close allowed).

## Intentionally unchanged

- No public routes, controllers, or UI added
- No QR, stations, walk-ins, party check-in, check-out, corrections
- Does not mutate registration or attendee rows
- No schema migration required (uses 7.3B constraints)

## Deployment

1. Back up the database.
2. Deploy application code (no migration expected).
3. Run focused staff-check-in tests.
4. Confirm no new public check-in route was introduced by this patch.
