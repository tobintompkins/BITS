# Blueprint 7.3U — Authorized QR Resolution and Staff Check-In API

**Status:** COMPLETE (authenticated API over 7.3T + 7.3C/7.3F/7.3M; no scanner UI)

## Endpoints

| Method | Path | Behavior |
| --- | --- | --- |
| `POST` | `/api/events/{eventId}/qr-check-in/resolve` | Read-only 7.3T resolve; safe selection DTO |
| `POST` | `/api/events/{eventId}/qr-check-in` | Re-resolve token, then single/party check-in |

## Rules

- Staff: `canOperateCheckIn` (via 7.3T / check-in services)
- Soft CSRF + JSON body; token only in body (never query/URL)
- `Cache-Control: private, no-store` on responses
- Party passes require explicit `attendeeIds` ⊆ eligible set
- Attendee passes reject conflicting selection
- Optional `stationId` → 7.3M attribution
- Optional `Idempotency-Key` forwarded to existing services
- No automatic token revoke/consume; no `lastUsedAt` from 7.3T

## Key files

- `app/api/events/[id]/qr-check-in/resolve/route.ts`
- `app/api/events/[id]/qr-check-in/route.ts`
- `server/services/qr-staff-check-in.service.ts`
- `lib/validation/qr-check-in-api.ts`
- `lib/api/qr-check-in-errors.ts`

## Next

Blueprint **7.3V** — staff QR scanner and fallback-entry UI (complete; see `docs/blueprint-7-3v.md`).
