# BITS Blueprint 7.3O — Station Selection in Staff Check-In UI

Prerequisites: Blueprints 7.2 through 7.3N must be implemented and passing.

## Cursor instruction

Implement this patch in the existing BITS repository now. Inspect the repository first, follow its actual architecture and design system, make the changes, and run the required checks. Do not stop after producing a plan.

If the optional station-aware check-in APIs from Blueprint 7.3N or the staff check-in screens from 7.3E/7.3H are missing or failing, stop and report the prerequisite. Do not recreate station validation or attribution logic in the browser.

## Discovery

Before editing:

1. Locate the 7.3E single-attendee and 7.3H selected-party check-in screens.
2. Locate the 7.3N optional station request fields, safe errors, compatibility behavior, and tests.
3. Locate the 7.3K active-station list endpoint and 7.3L station management screen.
4. Identify existing select/combobox, form-state, query/cache, request-cancellation, error, loading, empty-state, and accessibility conventions.
5. Identify whether event admin pages preserve safe session-scoped selections without browser persistence.
6. Run focused Blueprint 7.2–7.3N tests and report the exact baseline result.

## Scope

Extend the existing authorized staff check-in UI so an operator may optionally select one active station before:

- Single-attendee check-in.
- Selected-party check-in.

The UI must:

- Load only active stations for the current tenant and event/occurrence through 7.3K.
- Offer a clearly labeled optional station selector.
- Submit the selected station ID through the existing 7.3N request.
- Preserve check-in without a station.
- Handle empty, loading, stale, closed, unauthorized, network, and server states safely.
- Display safe attribution confirmation when supported.
- Add focused component/page, integration, tenant-scoping, accessibility, stale-state, compatibility, and regression tests.
- Add a short Blueprint 7.3O release note.

## Out of scope

Do not add:

- Required station selection
- Automatic station choice
- Kiosk or full-screen mode
- Device-based station memory
- Local-storage/cookie persistence of station selection
- Device fingerprints, IP storage, geolocation, user-agent tracking, or telemetry
- QR codes, scanning, or camera access
- Walk-ins, self check-in, check-out, re-entry, correction, or undo
- Dashboards, exports, notifications, real-time subscriptions, or background jobs
- New dependencies

## Authorization and tenant safety

1. Retain existing staff check-in page authorization.
2. Operators need the check-in operation permission to use the check-in screen.
3. Do not require station-management permission merely to list/select active stations unless completed policy explicitly requires it.
4. The active-station list must be tenant- and event/occurrence-scoped by the server.
5. Never send tenant or actor IDs from client state.
6. The 7.3N endpoint remains authoritative for station existence, status, tenant, and event scope.
7. A stale/cross-scope station must fail safely without revealing another tenant’s data.

## Station selector

Use an existing accessible select/combobox component.

Requirements:

- Label: repository-consistent equivalent of “Check-in station (optional).”
- Include a clear “No station” option.
- Load only `ACTIVE` stations through 7.3K’s bounded list behavior.
- Display safe station name and optional device label only when already provided by the authorized endpoint.
- Use opaque station ID as the submitted value.
- Do not display opener/closer, audit data, internal IDs, activity metadata, or tracking data.
- Do not infer a station from the current device.
- Do not automatically choose the first station.
- Default to “No station.”

If pagination means more active stations exist than one page can contain, follow an existing paginated combobox/search pattern. Do not fetch an unbounded station list or silently hide available stations. If no safe existing selector can handle the server limit, stop and report that UI prerequisite.

## Selection lifecycle

- Keep the selected station while the user remains on the same event/occurrence screen.
- Clear it when event/occurrence changes.
- Do not persist it in local storage, cookies, browser databases, or device identity.
- Clear it if a refreshed active-station response no longer contains it.
- Show accessible feedback when a selected station becomes unavailable.
- Do not change selection merely because a check-in succeeds.

Use existing in-memory form/page state only.

## Submission

For single and selected-party check-in:

1. Retain existing attendee/party validation.
2. Include `stationId` only when a station is selected, following 7.3N’s optional-field convention.
3. Do not send station name, status, device label, tenant, actor, or timestamps.
4. Disable relevant controls while the check-in request is pending.
5. Prevent duplicate mouse/keyboard submission.
6. Do not optimistically show attribution.
7. Apply only the authoritative server response.

Existing “No station” submissions must remain identical to pre-7.3O behavior.

## Feedback and stale station handling

Handle:

- Station list loading
- No active stations
- Station list permission/not-found/network/server failure
- Selected station closed before submission
- Selected station closed during submission
- Event/occurrence changed
- Check-in succeeds with station
- Check-in succeeds without station
- Already-present attendee with a newly selected station

For an already-present attendee:

- Do not imply that attribution was changed.
- Do not imply that station activity was updated.
- Use the 7.3N safe result to show the existing already-present outcome.

When a station is rejected as closed/stale:

- Show the safe server message.
- Refresh active stations.
- Clear the invalid selection.
- Preserve attendee/party selection when safe.
- Do not automatically retry the check-in.

## Privacy and interaction safety

- Do not store station selection beyond in-memory same-page state.
- Do not log station/attendee request objects to the browser console.
- Do not collect fingerprints, IP-derived identity, geolocation, or raw user-agent data.
- Cancel or ignore stale station-list requests when event/route changes.
- Clear stale station errors after a valid new selection.
- Never treat client station status as authoritative.

## Accessibility

The UI must:

- Provide an associated label and concise optionality description.
- Announce loading, empty, unavailable, and stale-selection states.
- Support full keyboard selection.
- Preserve visible focus.
- Associate station-specific errors with the selector.
- Expose disabled/busy states appropriately.
- Avoid color-only availability/status communication.
- Preserve the existing check-in screen’s accessible success/error announcements.
- Meet existing contrast, responsive, and reduced-motion conventions.

## Required tests

Add tests proving:

1. Authorized operators see the optional station selector.
2. Active stations are loaded only for the current tenant and event/occurrence.
3. Closed stations are not offered by the active-list request.
4. Default selection is “No station.”
5. No active stations still allows check-in without attribution.
6. A selected station ID is sent for single-attendee check-in.
7. A selected station ID is sent for selected-party check-in.
8. No station field is sent when “No station” is selected, matching 7.3N conventions.
9. Station name/device label are not incorrectly submitted.
10. Event/occurrence change clears station selection and stale requests.
11. A stale/closed station error refreshes options, clears selection, and does not auto-retry.
12. Already-present feedback does not claim attribution/activity changed.
13. Pending requests cannot be duplicated and controls behave consistently.
14. Station list failure is safe and does not expose cross-tenant information.
15. Selection is not written to local storage, cookies, or browser databases.
16. No tracking/device information is collected or logged.
17. Keyboard operation, labels, errors, and announcements pass accessibility checks.
18. Existing check-in without station remains compatible.
19. Existing Blueprint 7.2–7.3N tests continue to pass.

Include page-to-real-API integration coverage for attributed and unattributed check-in when supported.

## Verification order

Run and report:

1. Focused baseline tests for Blueprints 7.2–7.3N
2. Formatting/check
3. Focused 7.3O component/page tests
4. Accessibility checks
5. Single and selected-party page-to-API attribution tests
6. Stale/closed-station UI integration test
7. Backward-compatibility check-in-without-station test
8. Blueprint 7.2–7.3N regression tests
9. Full suite when feasible
10. Lint/static analysis
11. Type checking
12. Production build

Report exact commands and actual outcomes. Identify skipped, unavailable, or failing checks.

## Definition of done

- Staff check-in screens offer an optional active-station selector.
- Selection is scoped to the current tenant/event and remains server-authorized.
- Single and selected-party requests send the optional station ID correctly.
- Check-in without a station remains supported.
- Stale/closed station selection fails safely and never auto-retries.
- Selection is not persisted or inferred from the device.
- Accessibility and privacy behavior are tested.
- No kiosk, tracking, QR, walk-in, check-out, dashboard, or export feature is added.
- Existing tests remain passing.
- The station-attribution sequence 7.3I–7.3O is complete.

## Required final response from Cursor

Provide:

1. Discovery summary and exact baseline result.
2. Exact files changed grouped by page/components, client integration, tests, and documentation.
3. Active-station data source, pagination handling, and permission behavior.
4. Selection lifecycle, stale-state handling, and backward compatibility.
5. Accessibility and no-tracking safeguards.
6. Exact verification commands and results.
7. Genuine limitations or unexecuted checks.
8. Confirmation that the station-attribution sequence is complete and no out-of-scope feature was added.

## Deployment

This patch should not require a database migration.

After review:

1. Deploy through normal BITS procedures.
2. Verify an operator can check in with and without an active station.
3. Verify single and selected-party attribution.
4. Close a selected station concurrently and confirm safe failure/refresh.
5. Verify lower-privilege and cross-tenant behavior.
6. Confirm no selection persists after changing events or starting a fresh browser session.

Record only the actual time spent on work allowed by the community-service program.
