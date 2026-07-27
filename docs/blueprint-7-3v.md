# Blueprint 7.3V — Staff QR Scanner and Fallback-Entry UI

**Status:** COMPLETE (staff UI over 7.3U; no self check-in)

## Summary

Authorized staff check-in (`/events/[id]/staff-check-in`) now includes QR pass scan/paste:

1. Optional camera scan via native browser `BarcodeDetector` + `getUserMedia` (video only)
2. Always-available secure manual/paste fallback
3. Read-only resolve through 7.3U
4. Explicit check-in (never automatic on scan)
5. Party passes require explicit attendee selection
6. Optional station from existing 7.3O control

## Camera decoder

No new npm QR decoder dependency. When `BarcodeDetector` + `mediaDevices.getUserMedia` are available, camera scanning is enabled. Otherwise the UI reports camera unavailable and the manual fallback remains fully functional.

## Privacy

- Raw tokens live only in a component ref for the resolve → explicit check-in window
- Cleared on success, cancel, unmount, and terminal failure
- Never placed in URLs, storage, cookies, or feedback copy
- Camera tracks stop on capture, stop, unmount, and error; no frames retained

## Key files

- `components/events/staff-qr-check-in-panel.tsx`
- `components/events/staff-check-in-panel.tsx` (hosts QR panel)
- `lib/api/qr-check-in-client.ts`
- `lib/events/qr-scan-token.ts`
- `lib/events/qr-scanner-camera.ts`
- `lib/events/qr-check-in-ui.ts`

## Next

Blueprint **7.3W** — check-out / re-entry foundation (complete; see `docs/blueprint-7-3w.md`).
