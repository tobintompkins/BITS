# Blueprint 7 – Events and Calendar Management

## Status

**Blueprint 7.1 – COMPLETE**  
**Blueprint 7.2 – COMPLETE**  
**Blueprint 7.3A – COMPLETE** (check-in configuration; see `docs/blueprint-7-3a.md`)  
**Blueprint 7.3B – COMPLETE** (attendance data foundation; see `docs/blueprint-7-3b.md`)  
**Blueprint 7.3C – COMPLETE** (internal staff check-in service; see `docs/blueprint-7-3c.md`)  
**Blueprint 7.3D – COMPLETE** (staff check-in API; see `docs/blueprint-7-3d.md`)  
**Blueprint 7.3E – COMPLETE** (minimal staff check-in screen; see `docs/blueprint-7-3e.md`)  
**Blueprint 7.3F – COMPLETE** (selected party check-in service; see `docs/blueprint-7-3f.md`)  
**Blueprint 7.3G – COMPLETE** (selected party check-in API; see `docs/blueprint-7-3g.md`)  
**Blueprint 7.3H – COMPLETE** (selected party check-in UI; see `docs/blueprint-7-3h.md`)  
**Blueprint 7.3I – COMPLETE** (check-in station data foundation; see `docs/blueprint-7-3i.md`)  
**Blueprint 7.3J – COMPLETE** (check-in station lifecycle service; see `docs/blueprint-7-3j.md`)  
**Blueprint 7.3K – COMPLETE** (check-in station lifecycle API; see `docs/blueprint-7-3k.md`)  
**Blueprint 7.3L – COMPLETE** (check-in station management UI; see `docs/blueprint-7-3l.md`)  
**Blueprint 7.3M – COMPLETE** (station attribution in check-in services; see `docs/blueprint-7-3m.md`)  
**Blueprint 7.3N – COMPLETE** (optional station ID on check-in APIs; see `docs/blueprint-7-3n.md`)  
**Blueprint 7.3O – COMPLETE** (staff station selector UI; see `docs/blueprint-7-3o.md`)  
**Blueprint 7.3P – COMPLETE** (secure QR pass data foundation; see `docs/blueprint-7-3p.md`)  
**Blueprint 7.3Q – COMPLETE** (secure QR issuance/rotation/revocation; see `docs/blueprint-7-3q.md`)  
**Blueprint 7.3R – COMPLETE** (secure QR pass API; see `docs/blueprint-7-3r.md`)  
**Blueprint 7.3S – COMPLETE** (authorized QR pass UI; see `docs/blueprint-7-3s.md`)  
**Blueprint 7.3T – COMPLETE** (secure QR token resolution; see `docs/blueprint-7-3t.md`)  
**Blueprint 7.3U – COMPLETE** (QR resolve/check-in API; see `docs/blueprint-7-3u.md`)  
**Blueprint 7.3V – COMPLETE** (staff QR scanner / fallback UI; see `docs/blueprint-7-3v.md`)  
**Blueprint 7.3W – COMPLETE** (staff check-out / re-entry service; see `docs/blueprint-7-3w.md`)  
**Blueprint 7.3X – COMPLETE** (check-out / re-entry API; see `docs/blueprint-7-3x.md`)  
**Blueprint 7.3 – COMPLETE** (operational check-in / attendance / QR)

Station attribution sequence **7.3I–7.3O** is complete. QR pass sequence **7.3P–7.3V** is complete. Check-out/re-entry **7.3W–7.3X** is complete; next is **7.3Y** staff UI. Do not reopen 7.1–7.3X without a new blueprint.

---

## Architecture

### 7.1 – Events foundation

| Layer | Path |
| --- | --- |
| Permissions | `lib/auth/event-permissions.ts` |
| Constants / labels | `lib/constants/events.ts` |
| Recurrence helpers | `lib/events/recurrence.ts` |
| Validation | `lib/validation/events.ts` |
| Featured-image storage | `lib/storage/event-image.ts` |
| Repository | `server/repositories/event.repository.ts` |
| Service | `server/services/event.service.ts` |
| Server actions | `app/(staff)/events/actions.ts` |
| Image API | `app/api/events/[id]/image/route.ts` |
| UI | `components/events/*` |

### 7.2 – Event registration

| Layer | Path |
| --- | --- |
| Constants | `lib/constants/event-registration.ts` |
| Validation | `lib/validation/event-registration.ts` |
| Check-in HMAC | `lib/events/check-in-token.ts` |
| Notification placeholders | `lib/notifications/registration-notifications.ts` |
| Repository | `server/repositories/event-registration.repository.ts` |
| Service | `server/services/event-registration.service.ts` |
| Staff actions | `app/(staff)/events/registration-actions.ts` |
| Public actions | `app/register/actions.ts` |
| Staff UI | Event detail Attendees / Settings tabs; `/events/[id]/registrations` |
| Public UI | `/register/[slug]`, `/register/confirmation/[code]`, `/register/cancel` |

### 7.3 – Check-in / attendance / QR passes

| Layer | Path |
| --- | --- |
| Constants | `lib/constants/event-check-in.ts` |
| Errors | `lib/errors/check-in-errors.ts` |
| QR bearer tokens | `lib/events/qr-pass-token.ts` |
| QR pass foundation | `server/repositories/event-qr-pass.repository.ts`, `lib/validation/event-qr-pass.ts`, `lib/constants/event-qr-pass.ts` |
| QR pass lifecycle (7.3Q) | `server/services/event-qr-pass-lifecycle.service.ts`, `lib/events/qr-pass-secret-result.ts` |
| QR pass API (7.3R) | `app/api/events/[id]/registrations/[registrationId]/qr-passes/**`, `lib/api/qr-pass-client.ts` |
| QR pass UI (7.3S) | `components/events/staff-qr-pass-panel.tsx`, `lib/events/qr-pass-ui.ts` |
| QR pass resolution (7.3T) | `server/services/event-qr-pass-resolution.service.ts`, `lib/events/qr-pass-raw-token-input.ts` |
| QR check-in API (7.3U) | `app/api/events/[id]/qr-check-in/**`, `server/services/qr-staff-check-in.service.ts` |
| Validation | `lib/validation/event-check-in.ts` |
| Repository | `server/repositories/event-check-in.repository.ts` |
| Service | `server/services/event-check-in.service.ts` |
| Staff actions | `app/(staff)/events/check-in-actions.ts` |
| Public QR issue | `issueRegistrationQrPassAction` in `app/register/actions.ts` |
| UI | Check-in console, attendance dashboard, settings panel, QR display |

Migrations:
- `20260711040000_add_event_check_in_attendance` — settings + ops tables
- `20260712010000_add_check_in_settings_constraints` — 7.3A invariants
- `20260712020000_harden_event_attendance_foundation` — 7.3B attendance constraints
- `20260725010000_harden_event_check_in_station_foundation` — 7.3I station constraints
- `20260725160000_harden_event_qr_pass_foundation` — 7.3P QR pass hash-only / status / composite FKs

Models: `EventCheckInSettings` (default **disabled**), `EventCheckInStation`, `EventAttendanceRecord`, `EventAttendanceAction`, `EventQrPass`, `EventCheckInIdempotency`.  
Foundation data access: `server/repositories/event-attendance.repository.ts`.  
7.3C internal staff check-in: `server/services/staff-check-in.service.ts` (`staffCheckInRegisteredAttendee`).  
7.3D staff API: `POST /api/events/[id]/check-ins` → thin adapter over 7.3C.  
7.3E staff UI: `/events/[id]/staff-check-in` → `StaffCheckInPanel` + reused attendee search.  
7.3F selected-party internal service: `staffCheckInSelectedParty` (shared `applyStaffAttendeeCheckInInTx`).  
7.3G selected-party API: `POST /api/events/[id]/registrations/[registrationId]/check-ins` → thin adapter over 7.3F.  
7.3H selected-party UI: `/events/[id]/staff-check-in` party section → 7.3G API + check-in-scoped party loader.  
7.3I station foundation: `server/repositories/event-check-in-station.repository.ts` (hardens existing `EventCheckInStation`).  
7.3J station lifecycle: `server/services/check-in-station-lifecycle.service.ts` (open/list/close; `canManageCheckIn`).  
7.3K station API: `/api/events/[id]/check-in-stations` (+ `.../[stationId]/close`) → thin adapter over 7.3J.  
7.3L station UI: `/events/[id]/check-in-stations` → `CheckInStationsPanel` over 7.3K API (`canManageCheckIn`).  
7.3M station attribution: optional `stationId` on internal 7.3C/7.3F services; composite tenant+event FKs.  
7.3N station API: optional `stationId` on 7.3D/7.3G check-in bodies → 7.3M.  
7.3O station UI: optional ACTIVE station selector on `/events/[id]/staff-check-in` → 7.3K list + 7.3N submit.

All queries and mutations require a primary organization (`findPrimaryOrganization`) and filter by `organizationId`.

---

## Routes

| Route | Purpose | Auth |
| --- | --- | --- |
| `/events` | Paginated directory | Staff |
| `/events/new` | Create event | Staff |
| `/events/[id]` | Event detail (+ Attendees / Registration settings tabs) | Staff |
| `/events/[id]/edit` | Edit event | Staff |
| `/events/[id]/registrations` | Dedicated registrations / check-in / export | Staff |
| `/events/calendar` | Calendar | Staff |
| `/settings/event-categories` | Category admin | Staff |
| `/settings/event-locations` | Location admin | Staff |
| `/api/events/[id]/image` | Auth + visibility-gated image stream | Staff |
| `/api/events/[id]/check-ins` | Staff single-attendee check-in (7.3D → 7.3C) | Staff |
| `/api/events/[id]/registrations/[registrationId]/check-ins` | Staff selected-party check-in (7.3G → 7.3F) | Staff |
| `/api/events/[id]/check-in-stations` | Open/list check-in stations (7.3K → 7.3J) | Staff (`canManageCheckIn`) |
| `/api/events/[id]/check-in-stations/[stationId]/close` | Close check-in station (7.3K → 7.3J) | Staff (`canManageCheckIn`) |
| `/register/[slug]` | Public / member registration form | Public (service enforces settings) |
| `/register/confirmation/[code]` | Confirmation view | Public |
| `/register/cancel` | Cancel by confirmation code | Public |
| `/register/offer/accept` | Accept waitlist promotion offer (`?token=`) | Public (token-gated) |
| `/register/offer/decline` | Decline waitlist promotion offer (`?token=`) | Public (token-gated) |
| `/events/[id]/staff-check-in` | Minimal staff check-in (7.3E → 7.3D API) | Staff (`canOperateCheckIn`) |
| `/events/[id]/check-in-stations` | Check-in station management (7.3L → 7.3K API) | Staff (`canManageCheckIn`) |
| `/events/[id]/check-in` | Staff check-in console (search, QR, walk-in, stations) | Staff |
| `/events/[id]/attendance` | Attendance dashboard / export / corrections | Staff |

Middleware protects `/events(.*)` but **not** `/register(.*)`. Authentication for registration is enforced in the service when `requireAuthentication` (or members-only visibility) is set.

---

## Prisma models

### 7.1

Migration: `20260711010000_add_events_calendar_foundation`

- **EventCategory**, **EventLocation**, **Event**, **EventOrganizer**, **EventMinistry**
- **MemberAttendance.eventId** – optional UUID FK to `Event`

### 7.2

Migrations:

- `20260711020000_add_event_registration_attendees` – settings / registrations / attendees foundation
- `20260711030000_add_event_registration_waitlist_offers` – waitlist offer FSM, promotion tokens, sensitive fields

Models:

- **EventRegistrationSettings** – source of truth (includes `promotionOfferTtlMinutes`, `confirmationRequired`)
- **EventRegistration** – party / confirmation / waitlist / `OFFERED` / source
- **EventAttendee** – attendees + sensitive notes + `checkInToken` (compatibility)
- **EventWaitlistEntry** – ordered waitlist state machine (`WAITING` → `OFFERED` → …)
- **EventPromotionOffer** – hashed one-time promotion tokens (raw token never stored)

Enums: `EventRegistrationVisibility`, `EventWaitlistPromotionMode`, `EventRegistrationStatus` (+ `OFFERED`/`DECLINED`), `EventRegistrationSource`, `EventWaitlistEntryStatus`, `EventAttendeeStatus`, `EventAttendeeType`.

**Denormalized sync:** when settings are updated, Event fields stay in sync:

| Settings | Event |
| --- | --- |
| `isEnabled` | `registrationRequired` |
| `opensAt` / `closesAt` | `registrationOpenDate` / `registrationCloseDate` |
| `capacity` | `registrationCapacity` |
| `waitlistEnabled` | `waitlistEnabled` |
| `instructions` | `registrationInstructions` |

Public offer routes: `/register/offer/accept?token=…`, `/register/offer/decline?token=…`.

---

## Capacity and waitlist

- Capacity counts **attendees** whose registration status is in `COUNTED_TOWARD_CAPACITY_STATUSES` (`PENDING`, `CONFIRMED`, `OFFERED`, `CHECKED_IN`) and attendee is not `CANCELLED`. `OFFERED` reserves seats until accept/decline/expiry.
- Submit locks the settings row (`SELECT … FOR UPDATE`), then allocates: fit → `PENDING`/`CONFIRMED`; else waitlist → `WAITLISTED` + `EventWaitlistEntry`; else `CAPACITY_UNAVAILABLE`.
- Cancel is idempotent; releases capacity; cancels waitlist entry + revokes offers; then evaluates promotion.
- Automatic promotion (and capacity increases): expire elapsed offers → strict FIFO (do not skip a party that does not fit) → set `OFFERED` + create hashed token + enqueue accept/decline links.
- Staff **Send offer** creates an offer for a selected waitlisted registration.
- Accept/decline consume the one-time token; decline/expiry releases seats and promotes the next waiting party.

Dashboard **Events Near Capacity** uses registration attendee counts (not `MemberAttendance`).

---

## Check-in / QR security

- Each attendee stores a random `checkInToken`.
- Staff QR display uses **signed** payload: `signCheckInPayload(attendeeId, eventId)` → `{attendeeId}.{hmac}`.
- Check-in verifies with `verifyCheckInPayload` (HMAC-SHA256, timing-safe compare). Raw `checkInToken` is also accepted as a fallback for paste/scan.
- Recommended production env (name only in `.env.example`):

```bash
# BITS_CHECKIN_HMAC_SECRET=
```

Falls back to `CLERK_SECRET_KEY` or a dev default if unset — set a dedicated secret in production.

When an attendee with `memberId` is checked in, a `MemberAttendance` row is created with `eventId` set.

---

## Permissions (registration + check-in)

| Capability | ORG_ADMIN | TREASURER / DATA_ENTRY | REPORT_VIEWER |
| --- | --- | --- | --- |
| Manage registration | Yes | Yes | No |
| Read sensitive attendee notes | Yes | DATA_ENTRY only | No |
| Operate check-in | Yes | Yes | No |
| Manage check-in settings | Yes | DATA_ENTRY | No |
| Create walk-ins | Yes | Yes | No |
| Correct attendance | Yes | DATA_ENTRY | No |
| Export attendance | Yes | Yes | No |
| Export registrations | Yes | Yes | No |
| Read check-in totals | Yes | Yes | Yes (read) |

### Check-in operations notes

- QR passes store **SHA-256 hashes only**; payload is `BITS-CI:{opaqueToken}` with no PII.
- Duplicate scans are idempotent (`PRESENT` returned; optional `operationKey` uniqueness).
- Waitlisted / cancelled attendees cannot check in.
- Walk-ins require `allowWalkIns` + `requireRegistration=false`, respect capacity locks, and do not create Member records.
- No-show finalization cannot run before check-in close (or event end when close unset).
- Legacy 7.2 attendee `checkInToken` / HMAC helpers remain for compatibility; 7.3 prefers `EventQrPass`.

Sensitive fields (`accommodationRequest`, `dietaryNotes`, `internalNotes`) are omitted from staff list responses and CSV unless `canReadSensitiveAttendee` is true.

---

## Recurrence design (7.1)

- RRULE-compatible subset: `NONE`, `DAILY`, `WEEKLY`, `BIWEEKLY`, `MONTHLY`, `CUSTOM`
- Generation is **bounded** (default 12 months / max ~60 occurrences)
- Child rows use `parentEventId`; duplicate start times are skipped
- Edit scopes:
  - `THIS_OCCURRENCE` – update one row only
  - `ENTIRE_SERIES` – update parent (and related fields)
  - `THIS_AND_FUTURE` – on parent: update rule + regenerate future; on an occurrence: **updates that occurrence only** in 7.1 (documented limitation)

---

## Visibility enforcement

Server-side gate: `canViewEventVisibility(access, visibility, eventStatus)`.

Public registration never leaks `PRIVATE` events (returns not found). Registration visibility (`PUBLIC` / `MEMBERS_ONLY` / `STAFF_ONLY`) is enforced separately on `/register/[slug]`.

---

## Featured-image storage

- Public / non-private: `public/uploads/events/{orgId}/{eventId}/featured{ext}`
- Private visibility: `storage/private/events/{orgId}/{eventId}/featured{ext}` served only via `/api/events/[id]/image` after auth + visibility checks
- Max 5MB; JPG / PNG / WEBP

---

## Attendance integration

`MemberAttendance.eventId` may reference an `Event`. Event check-in optionally creates attendance for linked members. Full attendance workflows remain under Care (Blueprint 6).

---

## Notifications

In-app placeholders only (`enqueueRegistrationNotification`): confirmed, waitlisted, waitlist offered (with accept/decline paths + raw token in `meta` for delivery adapters), offer accepted/declined/expired, cancelled, reminder, check-in ready. No email/SMS provider yet.

---

## Seed fixtures (7.2)

After events seed: settings enabled for Youth Night, Outreach Day, Newcomers Lunch; ≥8 registrations (confirmed / waitlisted / cancelled / checked-in); Newcomers capacity set low for waitlist promotion demos; fixed UUID band `...0000000012xx`.

---

## Known limitations

- `THIS_AND_FUTURE` does not fully split series when editing a child occurrence
- Directory `total` is pre-visibility DB count (page contents are visibility-filtered)
- Occurrence generation is synchronous
- No real email/SMS notifications
- Public form currently submits a single primary attendee (staff can add parties; `maxAttendeesPerRegistration` enforced)
- Custom questions and payments deferred
- Camera QR scanning uses the experimental `BarcodeDetector` API when available; manual fallback always works
- Live totals poll every ~8s (no websocket channel in BITS yet)
- DB concurrency integration tests require a running Postgres; unit tests cover QR/validation/idempotency contracts

---

## Testing completed

- Unit: events validation / recurrence / visibility; event-registration validation; event-check-in validation / QR security
- Verify commands: prisma validate/generate, lint, typecheck, test, build (migrate/seed when Postgres is available)

---

## Next patch

Blueprint 7.3 complete — proceed only when the next Events blueprint is requested. Do not reopen 7.1–7.3.
