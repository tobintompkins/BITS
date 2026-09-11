# BITS Blueprint 7.3L — Check-In Station Management UI

Prerequisites: Blueprints 7.2 through 7.3K must be implemented and passing.

## Cursor instruction

Implement this patch in the existing BITS repository now. Inspect the repository first, follow its actual architecture and design system, make the changes, and run the required checks. Do not stop after producing a plan.

If the Blueprint 7.3K station open/list/close API is missing or failing, stop and report that prerequisite. Do not recreate station lifecycle logic in the browser.

## Discovery

Before editing:

1. Locate the 7.3K station endpoints, request/response types, permissions, pagination, filters, errors, and tests.
2. Locate the event administration navigation and the 7.3E/7.3H check-in UI conventions.
3. Identify existing form, table/list, pagination, badge, confirmation-dialog, alert, loading, and empty-state components.
4. Identify API-client, CSRF, cache invalidation, request cancellation, focus-management, and UI-test conventions.
5. Run focused Blueprint 7.2–7.3K tests and report the exact baseline result.

Do not assume paths, framework, component library, or test counts.

## Scope

Add one authorized event-administration screen that allows station managers to:

- View stations for the current event/occurrence.
- Filter by supported station status when 7.3K exposes that filter.
- Open a station with a name and optional device label.
- Close an active station after explicit confirmation.
- See accurate success, conflict, already-closed, permission, validation, not-found, network, and server feedback.
- Navigate bounded station results using existing pagination.

Add focused component/page, integration, authorization-visibility, tenant-scoping, accessibility, duplicate-submission, and regression tests. Add a short Blueprint 7.3L release note.

## Out of scope

Do not add:

- Kiosk/full-screen operating mode
- Selecting a station for check-in
- Station attribution on attendance records/actions
- Rename, reopen, or delete
- Device registration, fingerprints, IP storage, geolocation, or telemetry
- QR codes, scanning, or camera access
- Walk-ins, self check-in, check-out, re-entry, correction, or undo
- Dashboards, exports, notifications, real-time subscriptions, polling, or background jobs
- New dependencies

## Authorization and navigation

1. Add the screen under the established event-administration area.
2. Show its navigation entry only to users with the exact station/check-in management permission used by 7.3K.
3. Protect direct page access using the existing server/page authorization pattern.
4. The 7.3K API remains the final authorization and tenant boundary.
5. Do not show the screen merely to lower-privilege check-in operators unless completed policy explicitly allows station management.
6. Never send tenant or actor IDs from client state.

## Screen structure

Use existing BITS components and responsive layout. Include:

- Event name and event/occurrence date/time
- “Check-in stations” page heading
- Concise explanation that stations are administrative sessions and are not yet attached to check-in actions
- Open-station form
- Optional supported status filter
- Paginated station list
- Loading, empty, error, and success states

Do not display internal IDs, tenant IDs, raw audit data, IP addresses, user agents, fingerprints, or unnecessary user information.

## Open-station form

Fields:

- Station name, required
- Device label, optional

Requirements:

- Reuse exact server length and trimming rules for helpful client validation.
- Server validation remains authoritative.
- Use accessible labels, help text, and errors.
- Disable submission while pending.
- Call the 7.3K open endpoint once.
- Do not send status, timestamps, tenant ID, actor ID, or audit metadata.
- On success, show safe confirmation, reset the form according to existing conventions, and refresh/invalidate the station list.
- On name conflict, retain entered values and show the safe server message.
- Prevent mouse/keyboard duplicate submission.

Do not collect device identifiers or infer a device label automatically.

## Station list

For each station show only:

- Name
- Optional device label
- Status
- Opened time
- Closed time when present
- Last activity time when present
- Close action for active stations when authorized

Show actor display names only if 7.3K safely provides them and comparable administration lists already display them.

Use existing timezone, date, status badge, pagination, and responsive-list/table conventions.

Do not mutate `lastActivityAt` merely by viewing or refreshing.

## Close interaction

For an active station:

1. Provide a clearly labeled close action.
2. Require explicit confirmation using the established dialog/pattern.
3. Identify the station by safe name in the confirmation.
4. Disable the specific action while pending.
5. Call the 7.3K close endpoint once.
6. On success, update or refresh the list from authoritative server data.
7. Treat `ALREADY_CLOSED` as an idempotent success and display accurate feedback.
8. Restore focus according to existing dialog/action conventions.

Do not add reopen or delete controls.

## Filtering and pagination

- Use only filters actually exposed by 7.3K.
- Use established URL/query-state conventions where applicable.
- Reset to the first page when a filter changes.
- Respect server page limits.
- Preserve stable ordering supplied by the server.
- Do not fetch all stations for client-side pagination.
- Handle an empty page after closing/opening by refreshing to a valid page using existing patterns.

## Error and stale-state handling

Handle:

- Validation failure
- Conflicting station name
- Authentication expiration
- Insufficient permission
- Event/station no longer found
- Station closed by another user
- Network/request failure
- Safe unexpected server error

Do not optimistically claim a station opened or closed before server success.

Cancel or ignore stale requests when event, occurrence, route, page, or filter changes according to the existing client pattern.

## Privacy and interaction safety

- Do not store station data in local storage.
- Do not log full request/response objects.
- Do not collect device fingerprints, IP-derived identifiers, geolocation, or raw user-agent data.
- Clear stale form feedback after relevant edits.
- Avoid color-only status communication.
- Preserve visible focus and keyboard navigation.
- Ensure one pending operation cannot accidentally affect another station row.

## Accessibility

The screen must:

- Have one clear page heading.
- Associate form labels, help, and errors.
- Give station status a text equivalent.
- Provide accessible names for close actions that identify the station.
- Use an accessible confirmation dialog.
- Announce open/close success and errors.
- Expose loading/busy state appropriately.
- Be fully keyboard operable.
- Preserve visible focus.
- Meet existing contrast, responsive, and reduced-motion conventions.

## Required tests

Add tests proving:

1. A user with management permission can access the page and navigation entry.
2. A lower-privilege operator and unauthorized user follow established hidden/direct-access behavior.
3. Station listing remains tenant- and event/occurrence-scoped.
4. Loading, empty, populated, and safe error states render.
5. Pagination and supported status filtering call the API correctly.
6. Opening a valid station sends only allowed fields and refreshes the list.
7. Blank, overlong, and server-rejected values show accessible errors.
8. Name conflict retains form data and displays safe feedback.
9. Pending open cannot be submitted twice.
10. Closing requires explicit confirmation.
11. Pending close affects only the selected row and cannot submit twice.
12. Successful close and already-closed results render accurately.
13. A concurrent/stale close refreshes authoritative state safely.
14. No optimistic success appears before server response.
15. Viewing/listing does not update activity time.
16. Internal/tracking fields are absent from rendering, logs, and storage.
17. Keyboard, focus restoration, accessible names, and live feedback work.
18. Existing Blueprint 7.2–7.3K tests continue to pass.

Include page-to-real-API integration coverage when supported.

## Verification order

Run and report:

1. Focused baseline tests for Blueprints 7.2–7.3K
2. Formatting/check
3. Focused 7.3L component/page tests
4. Accessibility checks
5. Page-to-7.3K integration tests
6. Duplicate-submit and stale-close UI tests
7. Blueprint 7.2–7.3K regression tests
8. Full suite when feasible
9. Lint/static analysis
10. Type checking
11. Production build

Report exact commands and actual outcomes. Identify skipped, unavailable, or failing checks.

## Definition of done

- Authorized managers can view, open, and close stations.
- Lower-privilege users cannot access management controls.
- Lists are tenant/event scoped, server-paginated, and stably ordered.
- Open and close actions use 7.3K and resist duplicate submission.
- Close requires confirmation and supports already-closed idempotency.
- Accessibility and privacy requirements are tested.
- No kiosk, station attribution, device tracking, QR, walk-in, or check-out feature is added.
- Existing tests remain passing.
- Documentation identifies Blueprint 7.3M as the future station attribution integration for staff check-in.

## Required final response from Cursor

Provide:

1. Discovery summary and exact baseline result.
2. Exact files changed grouped by page/navigation, components/client integration, tests, and documentation.
3. Final page route and permission behavior.
4. Form limits, filters, pagination, confirmation, and pending-state behavior.
5. Accessibility, tenant-scope, and privacy safeguards.
6. Exact verification commands and results.
7. Genuine limitations or unexecuted checks.
8. Confirmation that no out-of-scope feature was added.

## Deployment

This patch should not require a database migration.

After review:

1. Deploy through normal BITS procedures.
2. Verify navigation visibility for managers and lower-privilege operators.
3. Open, list, and close a station in a non-production tenant.
4. Verify a duplicate close is safe.
5. Verify cross-tenant and unauthorized access fail safely.
6. Confirm station data is not yet attached to attendance actions.

Record only the actual time spent on work allowed by the community-service program.
