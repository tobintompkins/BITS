# BITS Blueprint 7.3V — Staff QR Scanner and Fallback-Entry UI

Prerequisites: Blueprints 7.2 through 7.3U must be implemented and passing.

## Cursor instruction

Implement this patch in the existing BITS repository now. Inspect the repository first, follow its actual architecture, security conventions, and design system, make the changes, and run the required checks. Do not stop after producing a plan.

If the authorized QR resolution/check-in API from Blueprint 7.3U or the existing staff check-in screen is missing or failing, stop and report the prerequisite. Do not recreate token resolution or attendance transaction logic in the browser.

## Discovery

Before editing:

1. Locate the 7.3U resolve/check-in endpoints, request/response contracts, generic errors, rate limits, station support, and tests.
2. Locate the 7.3E/7.3H/7.3O staff check-in screens and existing attendee/party/station selection behavior.
3. Identify existing camera/media-device, QR/barcode scanner, permission, full-screen, modal/drawer, and cleanup patterns.
4. Identify whether an approved QR decoding library already exists.
5. Identify secure secret input, clipboard, paste, form-autocomplete, cache/storage, logging, analytics, and test conventions.
6. Identify responsive and accessibility patterns for camera alternatives.
7. Run focused Blueprint 7.2–7.3U tests and report the exact baseline result.

If no approved scanner/decoder exists, do not silently add a dependency. Implement only the safe manual fallback and report camera scanning as blocked by dependency review, or follow established dependency approval policy.

## Scope

Extend the authorized staff check-in experience with:

- Camera-based QR scanning when supported by an existing approved implementation.
- A secure manual/paste fallback for raw QR token entry.
- Read-only token resolution through 7.3U.
- Explicit attendee selection for party passes.
- Optional active-station selection using existing 7.3O behavior.
- Explicit confirmation/check-in action through 7.3U.
- Clear success, already-present, invalid/unusable-pass, permission, rate-limit, camera, network, and server feedback.
- Camera lifecycle and token-memory cleanup.
- Focused component/page, API integration, permission, accessibility, privacy, camera-cleanup, duplicate-scan, and regression tests.
- A short Blueprint 7.3V release note.

## Out of scope

Do not add:

- Member self check-in
- Automatic check-in immediately when a code is seen
- Implicit check-in of every party attendee
- Offline scanning or queued mutations
- Token issuance/display changes
- Native mobile application
- Camera recording, image upload, photo storage, or snapshots
- Device fingerprints, geolocation, IP-derived identity, or analytics of token values
- Check-out, walk-ins, corrections, dashboards, or exports
- A new scanner dependency without approval

## Authorization and placement

1. Add scanning to the existing staff check-in area.
2. Require authentication and the established check-in operation permission.
3. Retain event/occurrence tenant scope.
4. Hide scanner controls without permission, but rely on page/API server authorization.
5. Never accept tenant or actor identity from client state.
6. Do not expose a public token-resolution page.

## Scanner lifecycle

When supported:

1. Camera remains off until the operator explicitly starts scanning.
2. Request only video permission, never audio.
3. Prefer environment/rear camera using established media constraints without requiring a specific device.
4. Show clear pending, granted, denied, unavailable, and error states.
5. Stop every media track when:
   - a token is captured
   - scanner closes
   - route/event changes
   - component unmounts
   - permission/error handling ends the session
6. Release decoder loops, animation frames, timers, object URLs, and listeners.
7. Do not retain frames, images, or recordings.
8. Do not restart automatically after a result; require an explicit “Scan another” action.

Handle React/framework development double-mount behavior without leaking multiple streams.

## Scan decoding

- Accept only the exact opaque token/payload format established by 7.3S/7.3U.
- Apply conservative maximum input length before calling the API.
- Do not parse names, IDs, or personal data from QR content.
- Debounce/latch one decoded result per explicit scan session.
- Stop scanning before resolution.
- Do not submit repeated frames as multiple API calls.
- Never log decoded content.

## Manual fallback

Provide an accessible secret/token input when camera is unavailable, denied, unsupported, or not preferred.

Requirements:

- Clear label such as “Enter or paste pass code.”
- Disable browser autocomplete/spellcheck/capitalization where supported.
- Do not use a URL/query parameter.
- Do not persist input in form history, local/session storage, IndexedDB, cookies, query caches, or global state.
- Clear the value after resolution begins or immediately after securely copying it into the request lifecycle, following existing secret-input patterns.
- Do not echo the full token in errors or confirmation.
- Apply the same length/format validation and API path as scanned input.

Do not add clipboard-read permission. Normal user-initiated paste is sufficient.

## Resolution flow

After one token is captured/entered:

1. Stop camera and clear visible secret input.
2. Call 7.3U resolve once.
3. Keep the raw token only in ephemeral component memory required for the subsequent explicit check-in.
4. Display safe resolved binding information through existing authorized attendee/registration data sources.
5. For attendee pass, show the bound attendee.
6. For party pass, require explicit selection of at least one eligible attendee.
7. Allow optional station selection through existing controls.
8. Provide cancel, which clears the raw token and resolved state.

Do not treat client resolution as authoritative; 7.3U re-resolves during check-in.

## Check-in flow

- Require explicit “Check in” or “Check in selected” action.
- Never automatically mutate attendance after scan/resolve.
- Disable controls while pending.
- Send raw token, explicit attendee selection when needed, and optional station ID only.
- Prevent duplicate mouse, keyboard, and repeated-scan submission.
- Apply authoritative server results.
- Clear raw token from memory immediately after terminal success, cancellation, or terminal failure.
- For recoverable station-selection errors, follow security policy: re-entry/re-scan may be required rather than retaining the bearer token indefinitely.

## Party behavior

- Never preselect all party attendees.
- Require explicit selection.
- Enforce the existing selection maximum.
- Submit only selected eligible IDs.
- Show newly checked-in and already-present outcomes accurately.
- Leave unselected attendees unchanged.

## Feedback

Handle:

- Camera unsupported/unavailable/denied/in-use
- No code detected
- Invalid/malformed/unusable pass
- Expired/revoked/replaced pass using generic safe wording
- Wrong tenant/event without disclosure
- Check-in disabled/outside window
- Attendee/registration ineligible
- Closed/invalid station
- Already-present attendee
- Party partial selection validation
- Rate limit
- Authentication expiration/permission loss
- Network/server failure

Never display raw token/hash, stack trace, database detail, or cross-tenant identity.

## Privacy and secret cleanup

- Never store raw tokens in URLs, navigation state, storage, cookies, service-worker caches, query caches, Redux/global stores, analytics, logs, traces, crash reports, or snapshots.
- Clear token state on success, cancel, route/event change, unmount, and relevant failure.
- Do not include decoded values in accessible labels or DOM attributes unnecessarily.
- Do not capture or persist camera frames.
- Do not claim screenshot prevention.
- Ensure development/debug tooling does not log component state containing token.

## Accessibility

- Provide a fully functional non-camera fallback.
- Give start/stop scanner buttons clear accessible names.
- Announce permission, resolution, selection, loading, success, and error states.
- Preserve logical focus after permission dialogs, scan capture, confirmation, and errors.
- Make party and station selection keyboard operable.
- Avoid color-only feedback.
- Do not rely on live camera imagery as the only instruction/status.
- Respect reduced motion and existing responsive conventions.

## Required tests

Add tests proving:

1. Only authorized staff can access scanner controls.
2. Camera starts only after explicit action and requests video without audio.
3. Tracks/decoder loops/listeners stop on capture, close, route change, unmount, and error.
4. Development remount does not create duplicate streams.
5. One scan session produces one resolution request despite repeated frames.
6. Manual fallback works without camera permission.
7. Manual input disables appropriate autocomplete/spellcheck behavior.
8. Raw token is absent from URLs, storage, caches, logs, analytics, traces, snapshots, and error output.
9. Resolve is read-only and does not check in automatically.
10. Attendee pass permits only its bound attendee.
11. Party pass requires explicit selection and leaves unselected attendees unchanged.
12. Optional station selection is submitted correctly.
13. Duplicate submission produces one effective check-in.
14. Already-present result is accurate and does not imply new attribution.
15. Invalid/expired/revoked/replaced/cross-scope failures use generic safe feedback.
16. Camera, rate-limit, permission, network, and server errors are accessible.
17. Token memory clears on success, cancel, navigation, unmount, and terminal failure.
18. Keyboard/focus/announcement/non-camera accessibility checks pass.
19. Existing Blueprint 7.2–7.3U tests continue to pass.

Use page-to-real-API integration coverage and browser media mocks appropriate to the repository.

## Verification order

Run and report:

1. Focused baseline tests for Blueprints 7.2–7.3U
2. Formatting/check
3. Focused 7.3V component/page tests
4. Camera lifecycle and duplicate-frame tests
5. Secret storage/logging/trace cleanup tests
6. Accessibility checks
7. Page-to-7.3U attendee/party/station integration tests
8. Blueprint 7.2–7.3U regression tests
9. Full suite when feasible
10. Lint/static analysis
11. Type checking
12. Production build

Report exact commands and outcomes. Identify skipped, unavailable, blocked, or failing checks.

## Definition of done

- Authorized staff have a scanner when an approved decoder exists.
- A fully functional manual fallback always exists.
- Scanning resolves but never automatically checks in.
- Party passes require explicit attendee selection.
- Optional station selection is supported.
- Camera resources and raw-token memory are reliably cleaned up.
- Secrets and camera frames are never persisted or logged.
- Accessibility and duplicate-scan behavior are tested.
- No self check-in, offline mode, or unrelated attendance feature is added.
- Existing tests remain passing.
- Documentation marks the QR staff check-in sequence complete and identifies Blueprint 7.3W as the first check-out/re-entry foundation patch.

## Required final response from Cursor

Provide:

1. Discovery summary and exact baseline result.
2. Approved scanner/decoder reused or camera-scanning blocker.
3. Exact files changed grouped by page/components, camera/decoder adapter, client integration, tests, and documentation.
4. Camera lifecycle, manual fallback, explicit selection, station, and duplicate-scan behavior.
5. Secret cleanup/storage/logging/privacy and accessibility safeguards.
6. Exact verification commands and results.
7. Genuine limitations, blocked camera capability, or unexecuted checks.
8. Confirmation that no self check-in or out-of-scope feature was added.

## Deployment

This patch should not require a migration.

After review:

1. Deploy through normal BITS procedures over secure transport.
2. Test camera granted/denied/unavailable and manual fallback on supported browsers/devices.
3. Verify camera indicator/stream stops after every exit path.
4. Inspect URLs, storage, logs, traces, analytics, and crash reporting for token leakage.
5. Test attendee/party, station, duplicate, invalid, revoked, and rate-limit cases in non-production.
6. Keep member self check-in unavailable.

Record only the actual time spent on work allowed by the community-service program.
