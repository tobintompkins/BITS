# BITS Blueprint 7.3E — Minimal Staff Check-In Screen

Prerequisites: Blueprints 7.2 through 7.3D must be implemented and passing.

## Cursor instruction

Implement this patch in the existing BITS repository now. Inspect the repository first, follow its actual architecture and design system, make the changes, and run the required checks. Do not stop after producing a plan.

If the authenticated single-attendee check-in endpoint from Blueprint 7.3D is missing or failing, stop and report that prerequisite. Do not recreate server check-in logic in the browser.

## Discovery

Before editing:

1. Locate the actual 7.3D endpoint, request/response types, authentication, permission, error responses, and tests.
2. Identify the existing event administration page structure and navigation conventions.
3. Identify existing accessible member/attendee selectors or search controls that can be reused.
4. Identify the project’s form, button, alert, loading, empty-state, confirmation, error, and responsive-layout components.
5. Identify the API client, request cancellation, query/cache, CSRF, and testing conventions.
6. Run the focused Blueprint 7.2–7.3D tests and report the exact baseline result.

Do not assume filenames, routes, component libraries, or test counts.

## Scope

Add one minimal staff-facing event check-in screen that:

- Appears only to users who have the established check-in operation permission.
- Is reached through the existing event-administration navigation pattern.
- Shows the event identity and whether check-in is currently available.
- Uses an existing attendee selector/search component to choose one eligible registered attendee.
- Requires an explicit “Check in” action.
- Calls the existing 7.3D endpoint.
- Shows clear success, already-present, validation, permission, unavailable-window, ineligible, and unexpected-error feedback.
- Prevents accidental repeated submission while a request is pending.
- Supports keyboard and screen-reader use.
- Adds focused component, integration, accessibility, authorization-visibility, and regression tests.
- Adds a short Blueprint 7.3E release note.

## Out of scope

Do not add:

- A new general-purpose attendee search API
- QR codes, camera access, or scanning
- Party or bulk check-in
- Stations or kiosk mode
- Walk-ins or self check-in
- Check-out, re-entry, correction, or undo
- Attendance lists, dashboards, totals, or exports
- No-show processing
- Notifications, real-time subscriptions, polling, or background jobs
- Offline mode
- New third-party dependencies

If no existing attendee selector/search facility can safely provide event attendees, stop and report the missing prerequisite. Do not silently build a broad search API inside this UI patch.

## Navigation and authorization

1. Add the screen under the established event-administration area.
2. Reuse the existing route guard and permission-aware navigation pattern.
3. Hide the navigation entry from users without the check-in operation permission.
4. Enforce access through the existing server/page guard as applicable; hiding a link is not authorization.
5. The 7.3D endpoint remains the final server-side authorization boundary.
6. Tenant and actor identifiers must never be accepted from editable client state.
7. Direct navigation without permission must produce the repository-standard forbidden or masked-not-found experience.

Do not create a new role or permission unless the repository’s completed 7.3A–7.3D implementation requires it.

## Screen content

Use the existing design system and layout conventions. The screen should contain:

- Event name and date/time using established timezone formatting
- A concise “Staff check-in” heading
- Current configuration state:
  - check-in disabled
  - not open yet
  - open
  - closed
- Existing attendee selector/search control
- Selected attendee summary containing only standard non-sensitive identifying information already permitted in staff event tools
- One primary “Check in” button
- A live status/feedback area

Do not display accommodation requests, dietary notes, internal notes, birth dates, full household data, or other sensitive attendee fields.

## Availability behavior

Use server-provided event/check-in settings through an existing safe page loader or settings query. Do not make client time the security authority.

The UI may calculate a helpful display state from server-provided values, but the 7.3D endpoint must make the authoritative availability decision.

When check-in is disabled, not yet open, or closed:

- Show a clear message.
- Disable the check-in action.
- Keep the event identity visible.
- Do not offer an override.

If the server rejects a request because state changed after page load, show the server-safe response and return the control to a usable state.

## Attendee selection

Reuse an existing tenant-safe event attendee selector or registered-attendee search capability.

The selector must:

- Be scoped to the current event or occurrence.
- Follow existing permission and tenant rules.
- Use opaque attendee identifiers.
- Show only safe identifying fields already approved by existing BITS staff screens.
- Support keyboard selection and accessible naming.
- Avoid loading an unbounded attendee dataset if the existing component is paginated or server-filtered.

Do not rely on client-side filtering to enforce tenant or event scope.

## Submission

On explicit submission:

1. Confirm an attendee is selected.
2. Disable the submit control while the request is pending.
3. Call the existing 7.3D endpoint once using the established API client and CSRF behavior.
4. Do not send tenant ID, actor ID, source, status, count, or timestamps.
5. Use the established idempotency-key client behavior only if 7.3D supports it.
6. Render the safe response.
7. Re-enable controls after completion.

Do not optimistically mark the attendee present before the server responds.

## Feedback states

Provide repository-consistent accessible feedback for:

- Successful first check-in
- Already present/idempotent success
- No attendee selected
- Check-in disabled
- Before opening or after closing
- Ineligible attendee or registration
- Authentication expired
- Insufficient permission
- Resource no longer found
- Network/request failure
- Unexpected safe server error

Success feedback may include attendee display name only if that name was already visible through the authorized selector. Do not expose internal IDs or server details.

Use the existing live-region/toast/alert convention. Move focus only according to established accessibility patterns.

## Interaction safety

- Prevent double-click and Enter-key duplicate submission while pending.
- Cancel or ignore stale requests when navigating away according to the existing API-client pattern.
- Do not log full attendee or endpoint response objects to the browser console.
- Do not persist attendee details in local storage.
- Clear stale success/error feedback when a different attendee is selected.
- Keep the selected attendee after a recoverable error unless existing form conventions reset it.

## Accessibility

The screen must:

- Have one clear page heading.
- Associate labels, help text, and errors with controls.
- Be fully keyboard operable.
- Preserve visible focus.
- Announce success and error feedback.
- Avoid color-only status communication.
- Use accessible disabled and loading states.
- Meet existing contrast and responsive-layout standards.
- Respect reduced-motion conventions if animations are used.

## Required tests

Add tests proving:

1. A permitted staff user can reach the screen.
2. The navigation entry is hidden without permission.
3. Direct access without permission follows established behavior.
4. Event and occurrence scoping is preserved.
5. Disabled, not-open, open, and closed states render correctly.
6. An existing selector can choose one same-event attendee.
7. No selection produces accessible validation feedback.
8. Submission sends only the allowed event/attendee request data.
9. The button is disabled while pending and duplicate interaction causes one request.
10. First-check-in success is announced.
11. Already-present success is represented accurately without suggesting another count.
12. Validation, unavailable, ineligible, unauthorized, not-found, network, and server errors render safely.
13. Sensitive attendee fields are absent from the rendered page and client logs/storage.
14. Keyboard selection and submission work.
15. Controls have accessible names and feedback uses the established announcement mechanism.
16. No optimistic present state appears before success.
17. Existing Blueprint 7.2–7.3D tests continue to pass.

Use the project’s existing UI test tools. Include an integration test with the real API boundary when supported rather than mocking every layer.

## Verification order

Run and report:

1. Focused baseline tests for Blueprints 7.2–7.3D
2. Formatting/check
3. Focused 7.3E component and page tests
4. Accessibility checks
5. Focused page-to-endpoint integration test
6. Blueprint 7.2–7.3D regression tests
7. Full suite when feasible
8. Lint/static analysis
9. Type checking
10. Production build

Report exact commands and actual outcomes. Identify skipped, unavailable, or failing checks.

## Definition of done

- Authorized staff can open one minimal event check-in screen.
- The screen reuses an existing safe attendee selector.
- One explicit action calls the 7.3D endpoint.
- Pending requests cannot be accidentally duplicated.
- Success and error states are accurate and accessible.
- Sensitive attendee information is not exposed.
- Server authorization and eligibility remain authoritative.
- No QR, party, station, walk-in, check-out, dashboard, or export functionality is added.
- Existing tests remain passing.
- Documentation identifies Blueprint 7.3F as the future focused attendee-search improvement only if the existing selector proves insufficient; otherwise the next patch may address party check-in selection.

## Required final response from Cursor

Provide:

1. Discovery summary and exact baseline result.
2. Exact files changed, grouped by page/navigation, components/client integration, tests, and documentation.
3. Final route and permission behavior.
4. The existing attendee selector/search capability reused.
5. Accessibility and sensitive-data safeguards.
6. Exact verification commands and results.
7. Genuine limitations or unexecuted checks.
8. Confirmation that no out-of-scope check-in feature was added.

## Deployment

This patch should not require a database migration.

After review:

1. Deploy through the normal BITS process.
2. Verify the navigation entry is visible only to authorized staff.
3. Test one eligible attendee in a non-production environment.
4. Verify a duplicate submission does not increment attendance.
5. Verify an unauthorized user cannot access the page or endpoint.
6. Keep QR, party, walk-in, station, and check-out features unavailable.

Record only the actual time spent on work allowed by the community-service program.
