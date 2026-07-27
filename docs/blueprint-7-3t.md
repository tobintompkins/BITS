# Blueprint 7.3T — Secure QR Token Resolution and Eligibility

**Status:** COMPLETE (internal read-only service; no API/scanner/check-in mutation)

## What shipped

- `resolveQrPassForCheckIn` in `server/services/event-qr-pass-resolution.service.ts`
- Secret input: `lib/events/qr-pass-raw-token-input.ts` (hash-then-clear; redacted serialization)
- Staff-only: `canOperateCheckIn`
- Hash + exact purpose `EVENT_CHECK_IN` lookup (no fallback-code plaintext path)
- Tenant + event scope; generic `INVALID_QR_PASS` for unknown / wrong-scope / bad token state
- After scoped token: check-in window (`CHECK_IN_*`) and registration eligibility (`CONFIRMED` / `CHECKED_IN`)
- Safe DTO: pass/event/registration IDs, binding, eligible attendee IDs, expiry, `USABLE`
- **Read-only:** no `lastUsedAt`, attendance, actions, station activity, or success audit

Ops `resolveQrPassForStaff` remains (keep-ops; still updates `lastUsedAt` and may use fallback codes).

## Next

Blueprint **7.3U** — authorized QR resolution / check-in API (complete; see `docs/blueprint-7-3u.md`).
