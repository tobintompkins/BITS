# Blueprint 7.3S — Authorized QR Pass Display and Management UI

**Status:** COMPLETE (staff UI over 7.3R; no scanning/resolution/delivery)

## What shipped

- Staff panel on event registrations: `components/events/staff-qr-pass-panel.tsx`
- Wired into `EventAttendeesPanel` for `CONFIRMED` / `CHECKED_IN` registrations when `canManageQrPass`
- Client: `lib/api/qr-pass-client.ts` (`cache: "no-store"`, token never in URL)
- Reuses existing `qrcode` + `QrPassDisplay` (no new QR dependency)
- Payload via `BITS-CI:{rawToken}` only — no PII
- Issue / rotate (confirm) / revoke (confirm); hide clears in-memory secret
- Active pass without secret → rotate guidance (no recovery)

## Authorization

Page + API both required. Staff only (7.3R ownership policy). Public confirmation ops panel remains separate keep-ops path.

## Intentionally out of scope

Token resolution, scanner, email/SMS, self check-in, public bearer pages.

## Next

Blueprint **7.3T** — secure QR token resolution for check-in (complete; see `docs/blueprint-7-3t.md`).
