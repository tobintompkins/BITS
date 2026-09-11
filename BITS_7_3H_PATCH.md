# BITS Blueprint 7.3H — Selected Party Check-In UI

Prerequisites: Blueprints 7.2 through 7.3G must be implemented and passing.

## Cursor instruction

Implement this patch in the existing BITS repository now. Inspect the repository first, follow its actual architecture and design system, make the changes, and run the required checks. Do not stop after producing a plan.

If the selected-party endpoint from Blueprint 7.3G or the minimal staff screen from 7.3E is missing or failing, stop and report the prerequisite. Do not recreate server transaction logic in the browser.

## Discovery

Before editing:

1. Locate the 7.3E staff check-in screen, attendee selector, permission guard, feedback, and tests.
2. Locate the 7.3G selected-party endpoint, request limit, duplicate behavior, safe response, errors, and tests.
3. Identify existing registration/household attendee-list and checkbox/multi-select patterns.
4. Identify design-system components for lists, selection counts, alerts, loading states, confirmation, and responsive layouts.
5. Identify API-client, CSRF, request cancellation, accessibility, and UI-test conventions.
6. Run focused Blueprint 7.2–7.3G tests and report the exact baseline result.

If BITS lacks a tenant-safe way to load the attendees of one registration, stop and report the missing prerequisite. Do not add a broad attendee API inside this UI patch.

## Scope

Extend the existing authorized 7.3E staff check-in screen so staff can:

- Select one event registration using an existing safe registration/attendee lookup pattern.
- View that registration’s permitted attendee list.
- Explicitly select one or more eligible attendees.
- Submit the selected IDs to the existing 7.3G endpoint.
- See accurate per-attendee and aggregate results.
- Distinguish newly checked-in, already-present, and unchanged/unselected attendees.
- Recover safely from validation, eligibility, authorization, availability, network, and server errors.

Add focused component, integration, accessibility, tenant-scoping, duplicate-submission, and regression tests. Add a short Blueprint 7.3H release note.

## Out of scope

Do not add:

- QR codes, scanning, or camera access
- A check-in station or kiosk mode
- Walk-ins or self check-in
- Check-out, re-entry, correction, or undo
- No-show processing
- Attendance dashboards, totals, exports, notifications, or real-time updates
- An implicit “check in everyone” action
- A broad new search endpoint
- New dependencies

Do not remove the existing single-attendee 7.3E behavior unless the established UI naturally unifies it without regression.

## Authorization and tenant safety

1. Retain the established authenticated route/page guard.
2. Show the screen and navigation only to users with the check-in operation permission.
3. Load registrations and attendees through existing tenant- and event-scoped server facilities.
4. Never send tenant ID or actor ID from client state.
5. Never trust client filtering as a tenant or party boundary.
6. The 7.3G endpoint remains authoritative for party membership, eligibility, and authorization.
7. Cross-tenant or stale identifiers must use existing safe not-found/error behavior.

## Registration and attendee selection

Reuse existing BITS controls. The flow must:

1. Select one registration scoped to the current event/occurrence.
2. Load only that registration’s attendees.
3. Show safe identifying fields already approved for staff event tools.
4. Present an explicit checkbox or established multi-select control for each attendee.
5. Start with no attendee selected unless an existing accessibility-tested convention clearly provides a safe default.
6. Require at least one selection.
7. Enforce the exact maximum implemented by 7.3F and 7.3G.
8. Preserve stable selection while the same registration remains active.
9. Clear selection and stale feedback when the registration changes.

Do not provide an implicit select-all action in this patch. Every submitted attendee must be explicitly selected.

Do not display contact information, birth dates, accommodation requests, dietary notes, internal notes, household details, or other sensitive fields.

## Status display

If existing safe data indicates current attendance state, show it using repository conventions:

- Eligible/not checked in
- Present
- Cancelled/ineligible, when the authorized source safely provides this

Client status is informative only. Do not block or authorize solely from cached client data; the endpoint remains authoritative.

Do not infer or expose registration/attendee information unavailable through the existing authorized data source.

## Submission

On explicit “Check in selected” submission:

1. Validate that a registration and at least one attendee are selected.
2. Validate the selection does not exceed the server limit.
3. Disable registration selection, attendee controls, and submit action while pending.
4. Call the existing 7.3G endpoint once.
5. Send only the explicit attendee-ID list required by 7.3G.
6. Use the existing CSRF and idempotency behavior.
7. Do not optimistically mark attendees present.
8. Apply results only after a successful server response.
9. Re-enable controls after completion.

Prevent double-click, repeated Enter-key, and other duplicate submissions while pending.

## Results

Render a concise, accessible summary:

- Requested count
- Newly checked-in count
- Already-present count

For each submitted attendee, show the safe outcome:

- Checked in
- Already present

Unselected attendees must remain visually and functionally unchanged.

Use an existing live-region, alert, or status pattern. Do not display opaque/internal IDs to staff when a safe display name is already available in the authorized client state.

After success, clear only the successfully processed selections if that matches existing form conventions. Never silently select or submit additional attendees.

## Error behavior

Handle:

- No registration selected
- No attendees selected
- Selection over the limit
- Registration changed or no longer found
- Mixed/stale attendee selection
- Check-in disabled or outside its window
- Ineligible or cancelled registration/attendee
- Authentication expiration
- Insufficient permission
- Network/request failure
- Safe unexpected server error

For an atomic server failure, do not mark any attendee successful. Preserve the selection after recoverable errors unless established form behavior dictates otherwise.

Do not expose stack traces, database details, tenant identifiers, or sensitive attendee data.

## Interaction and privacy safety

- Cancel or ignore stale requests when registration, event, or route changes.
- Do not store attendee/registration data in local storage.
- Do not log full requests, results, or attendee objects to the console.
- Clear stale feedback on registration change.
- Preserve visible focus and logical focus order.
- Avoid accidental submission from checkbox interaction.
- Use server-provided result counts rather than calculating authoritative totals from assumptions.

## Accessibility

The UI must:

- Have a clear page heading and party-selection section heading.
- Use a fieldset/legend or established semantic multi-selection pattern.
- Associate attendee labels with selection controls.
- Expose selected count and maximum accessibly.
- Announce validation, loading, success, and failure.
- Be fully keyboard operable.
- Retain visible focus.
- Avoid color-only state communication.
- Use accessible disabled and busy states.
- Meet existing contrast, responsive, and reduced-motion conventions.

## Required tests

Add tests proving:

1. Authorized staff can select a same-event registration and view its safe attendee list.
2. Unauthorized navigation and direct access follow established behavior.
3. Registration and attendee loading remain tenant- and event-scoped.
4. No attendee is selected by default unless an established convention requires it.
5. One or several attendees can be explicitly selected.
6. No-selection and over-limit validation is accessible.
7. Changing registration clears prior selections and stale results.
8. Submission sends only the selected attendee IDs.
9. Unselected attendees are never submitted or changed.
10. Controls are disabled while pending and duplicate interaction makes one request.
11. No optimistic present state appears before success.
12. Newly checked-in and already-present results render accurately.
13. Atomic failure produces no partial-success UI.
14. Permission, unavailable-window, ineligible, stale/not-found, network, and unexpected errors render safely.
15. Sensitive fields are absent from rendering, logs, and browser storage.
16. Keyboard selection/submission and screen-reader labels/status announcements work.
17. The original single-attendee check-in path remains functional if retained.
18. Existing Blueprint 7.2–7.3G tests continue to pass.

Include a page-to-real-endpoint integration test when supported rather than mocking every layer.

## Verification order

Run and report:

1. Focused baseline tests for Blueprints 7.2–7.3G
2. Formatting/check
3. Focused 7.3H component/page tests
4. Accessibility checks
5. Page-to-7.3G integration tests
6. Duplicate-submission and atomic-failure UI tests
7. Blueprint 7.2–7.3G regression tests
8. Full suite when feasible
9. Lint/static analysis
10. Type checking
11. Production build

Report exact commands and actual outcomes. Identify skipped, unavailable, or failing checks.

## Definition of done

- Authorized staff can select one registration and explicitly choose attendees.
- Only selected attendee IDs are sent to the 7.3G endpoint.
- Pending requests cannot be duplicated accidentally.
- Aggregate and per-attendee results are accurate and accessible.
- Unselected attendees remain unchanged.
- Tenant isolation and server authorization remain authoritative.
- Sensitive attendee information is not exposed.
- No QR, station, walk-in, check-out, dashboard, or export feature is added.
- Existing tests remain passing.
- Documentation identifies Blueprint 7.3I as the next check-in increment, chosen from actual roadmap needs after reviewing 7.3H.

## Required final response from Cursor

Provide:

1. Discovery summary and exact baseline result.
2. Exact files changed grouped by page/components, client integration, tests, and documentation.
3. Registration/attendee data source reused and its tenant scoping.
4. Selection limit, pending-state, and duplicate-submission behavior.
5. Accessibility and sensitive-data safeguards.
6. Exact verification commands and results.
7. Genuine limitations or unexecuted checks.
8. Confirmation that no out-of-scope feature was added.

## Deployment

This patch should not require a database migration.

After review:

1. Deploy through the normal BITS process.
2. Verify only authorized staff can access the screen.
3. Test selecting two attendees from one registration in a non-production tenant.
4. Confirm an unselected attendee remains unchanged.
5. Repeat the submission and confirm attendance counts do not increase.
6. Test a cross-tenant/stale request and confirm safe failure.
7. Keep QR, stations, walk-ins, check-out, dashboards, and exports unavailable.

Record only the actual time spent on work allowed by the community-service program.
