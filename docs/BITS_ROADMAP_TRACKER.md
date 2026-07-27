# BITS Roadmap Tracker

**Last updated:** July 25, 2026  
**Current handoff:** Blueprint 7.3Y  
**Status basis:** Cursor reported 7.3V–7.3X complete in-repo. Prior items remain reported complete unless noted.

## Earlier work

| Blueprint | Description | Status |
|---|---|---|
| 1–7.1 | Earlier BITS foundations and event work | Previously reported complete; not independently verified |
| 7.2 | Event registration, attendees, capacity, and waitlists | Previously reported complete; not independently verified |

## Blueprint 7.3 progress

| Patch | Description | Status |
|---|---|---|
| 7.3A | Check-in configuration foundation | Reported complete; not independently verified |
| 7.3B | Attendance data foundation | Reported complete; not independently verified |
| 7.3C | Transaction-safe single-attendee check-in service | Reported complete; not independently verified |
| 7.3D | Single-attendee staff check-in API | Reported complete; not independently verified |
| 7.3E | Minimal staff check-in screen | Reported complete; not independently verified |
| 7.3F | Selected-party check-in service | Reported complete; not independently verified |
| 7.3G | Selected-party check-in API | Reported complete; not independently verified |
| 7.3H | Selected-party check-in UI | Reported complete; not independently verified |
| 7.3I | Check-in station data foundation | Reported complete; not independently verified |
| 7.3J | Station lifecycle service | Reported complete; not independently verified |
| 7.3K | Station lifecycle API | Reported complete; not independently verified |
| 7.3L | Station management UI | Reported complete; not independently verified |
| 7.3M | Station attribution in check-in services | Reported complete; not independently verified |
| 7.3N | Station attribution in check-in APIs | Reported complete; not independently verified |
| 7.3O | Station selection in staff check-in UI | Reported complete; not independently verified |
| 7.3P | Secure QR pass data foundation | Reported complete; not independently verified |
| 7.3Q | Secure QR issuance, rotation, and revocation service | Reported complete; not independently verified |
| 7.3R | Secure QR pass API | Reported complete; not independently verified |
| 7.3S | Authorized QR pass display and management UI | Reported complete; not independently verified |
| 7.3T | Secure QR token resolution and eligibility service | Reported complete; not independently verified |
| 7.3U | Authorized QR resolution and staff check-in API | Reported complete; not independently verified |
| 7.3V | Staff QR scanner and fallback-entry UI | Reported complete (Cursor); see `docs/blueprint-7-3v.md` |
| 7.3W | Transaction-safe check-out / re-entry service | Reported complete (Cursor); see `docs/blueprint-7-3w.md` |
| 7.3X | Thin check-out / re-entry API | Reported complete (Cursor); see `docs/blueprint-7-3x.md` |
| **7.3Y** | **Staff check-out / re-entry UI** | **Next** |

## Planned next groups

Exact lettering may change after reviewing Cursor’s implementation results.

1. Check-out and re-entry UI (**7.3Y**).
2. Walk-in registration/check-in.
3. Corrections, undo, and no-show processing.
4. Attendance lists, totals, dashboard, and export.
5. Final tenant-isolation, security, accessibility, migration, and regression verification.

## Verification needed

To change prior entries from “reported complete” to “verified complete,” retain Cursor’s:

- Discovery/completion summary
- Exact changed-file list
- Migration results
- Focused and full test results
- Lint, typecheck, and build results
- Git commit identifier

Community-service time should reflect actual eligible work performed, not estimates or the number of patch files.
