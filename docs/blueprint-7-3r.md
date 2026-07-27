# Blueprint 7.3R — Secure QR Pass API

**Status:** COMPLETE (thin authenticated API over 7.3Q; no UI/QR image/scanner)

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/events/{eventId}/registrations/{registrationId}/qr-passes` | Safe metadata list (no secrets) |
| `POST` | same | Issue party/attendee pass; raw token only on fresh mint |
| `POST` | `.../qr-passes/{passId}/rotate` | New raw token once; `Cache-Control: private, no-store` |
| `POST` | `.../qr-passes/{passId}/revoke` | Safe outcome only; idempotent |

## Authorization

Matches 7.3Q staff policy: `canOperateCheckIn || canManageCheckIn || canManageRegistration`.  
Member/household ownership remains deferred (same as 7.3Q).

## Safeguards

- Soft CSRF (Origin/Host) on mutations; JSON content-type on issue
- Secret responses: `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`
- Never returns `tokenHash`; reused issue returns `rawToken: null`
- Controllers call 7.3Q lifecycle once

## Next

Blueprint **7.3S** — authorized QR pass display UI (see `docs/blueprint-7-3s.md`).
