# BITS Blueprint 7.3S — Authorized QR Pass Display and Management UI

Prerequisites: Blueprints 7.2 through 7.3R must be implemented and passing.

## Cursor instruction

Implement this patch in the existing BITS repository now. Inspect the repository first, follow its actual architecture, security conventions, and design system, make the changes, and run the required checks. Do not stop after producing a plan.

If the secure QR pass API from Blueprint 7.3R is missing or failing, stop and report the prerequisite. Do not implement token resolution, scanning, or check-in by QR in this patch.

## Discovery

Before editing:

1. Locate the 7.3R issue, metadata, rotate, and revoke endpoints; response fields, ownership rules, cache headers, errors, and tests.
2. Locate existing member portal registration pages and authorized staff registration-management pages.
3. Identify existing secret/recovery-code display, copy, print, download, confirmation, and focus-management conventions.
4. Identify any existing audited QR/barcode rendering library or component.
5. Identify Content Security Policy, dependency, SVG/canvas, screenshot/snapshot, printing, and accessibility conventions.
6. Identify API-client cache behavior to ensure raw tokens are not persisted.
7. Run focused Blueprint 7.2–7.3R tests and report the exact baseline result.

If BITS has no existing approved QR renderer, do not add a dependency silently. Report the missing prerequisite or use a repository-approved server/client renderer only after following existing dependency policy.

## Scope

Add authorized UI for staff and, where 7.3R supports ownership, members/households to:

- View safe QR-pass metadata for an eligible registration.
- Issue a new party-level or attendee-level pass.
- Display the newly issued raw token as a QR code exactly during the immediate successful response lifecycle.
- Rotate an active pass with explicit confirmation and display the new QR code.
- Revoke an active pass with explicit confirmation.
- See expiry, binding, and status safely.
- Understand that an old/revoked/replaced pass is no longer valid.

Add focused component/page, authorization, ownership, secret-lifecycle, cache/storage, accessibility, printing, QR-rendering, error, and regression tests. Add a short Blueprint 7.3S release note.

## Out of scope

Do not add:

- Token resolution or validation for check-in
- Camera/scanner access
- Manual token-entry check-in
- Self check-in
- QR delivery by email/SMS
- Background jobs
- Public unauthenticated pass pages
- Check-out, walk-ins, corrections, dashboards, or exports
- Analytics or tracking of QR views/copies
- A new QR dependency without established approval

## Routes and placement

Follow existing BITS navigation.

Member/household UI belongs under the authorized registration/event area.

Staff UI belongs under the existing registration/attendee administration area.

Do not create a public bearer-token page. Page authorization and API authorization are both required.

## Authorization and ownership

1. Retain server/page guards and 7.3R API enforcement.
2. Staff controls require the exact pass-management permission.
3. Member controls require ownership of the registration or established household authority.
4. Attendee-level pass access is authorized through the parent registration.
5. Cross-tenant/cross-household/nonexistent resources fail safely.
6. Navigation visibility is not the final authorization boundary.
7. Never accept tenant or actor IDs from client state.

## Metadata view

Show only:

- Binding type: party or attendee
- Safe attendee display name only when already authorized by the parent page
- Status
- Expiry
- Created time
- Revoked/replaced time when safe and supplied

Never display:

- Token hash
- A previously issued raw token
- Internal IDs
- Audit details
- Sensitive attendee notes/contact data
- Tenant identifiers

If metadata says an active pass exists but its raw token is unavailable, explain that it must be rotated to obtain a newly displayable pass. Never imply the old secret can be recovered.

## Issue flow

1. Require an explicit party/attendee binding choice using existing controls.
2. Confirm eligibility through the API; do not rely on client status.
3. Disable submission while pending.
4. Call the 7.3R issue endpoint once.
5. Keep the raw token only in ephemeral component memory.
6. Render it through the approved QR component.
7. Show expiry and concise security guidance.
8. Never put the raw token in the URL, route state, query cache, global store, analytics, logs, or persistent browser storage.
9. Clear the raw token when leaving the page, changing registration, revoking/rotating, or explicitly hiding it.

If an active pass already exists and 7.3R cannot return its raw token, present rotation—not secret recovery.

## Rotation flow

- Require explicit confirmation that the old pass will stop working.
- Disable the action while pending.
- Call 7.3R once.
- Replace any in-memory old secret immediately with the new raw token.
- Render only the new QR.
- Refresh safe metadata.
- Prevent duplicate mouse/keyboard submission.
- Handle simultaneous-rotation conflict safely without displaying another request’s token.

## Revocation flow

- Require explicit confirmation.
- Call 7.3R once.
- Clear any in-memory raw token immediately.
- Refresh metadata.
- Treat already revoked/replaced/expired outcomes accurately.
- Do not provide undo or secret recovery.

## QR rendering

- Use an existing approved QR renderer.
- Encode only the raw opaque token or repository-defined purpose-bound payload.
- Do not encode names, email, phone, tenant name, event name, registration IDs, attendee IDs, or other personal data.
- Render at a size and contrast appropriate for reliable scanning.
- Provide a text alternative describing it as the event check-in pass without exposing the token to screen-reader users unless existing secure-secret accessibility policy explicitly supports reveal/copy.
- Avoid placing token text in DOM attributes, accessible labels, test snapshots, or error telemetry unnecessarily.
- Do not embed remote image-generation URLs.

## Copy, print, and download

Reuse existing secret-handling conventions.

- Do not add raw-token copy unless comparable BITS secret UI supports it safely.
- Printing may include the QR and safe event/expiry context, but no unnecessary personal information.
- Use print CSS/conventions to exclude navigation, admin controls, and unrelated data.
- Do not persist generated images to server storage.
- If download is supported by an existing secure pattern, generate locally and use a generic filename without personal data.
- Clear temporary object URLs/resources after use.

Do not add sharing through third-party APIs.

## Client caching and secret lifetime

- Secret-bearing responses must bypass persistent query/cache storage.
- Do not place raw tokens in Redux/global stores, service-worker caches, local/session storage, IndexedDB, cookies, URLs, analytics, or crash reports.
- Avoid console logging response objects.
- Clear token memory on unmount/navigation/registration change/rotation/revocation.
- Browser screenshots remain outside application control; display concise user guidance without claiming screenshot prevention.
- Metadata may use the normal authorized cache; raw secrets may not.

## Error behavior

Handle safely:

- Authentication expiration
- Insufficient permission/ownership
- Registration/attendee not found
- Ineligible or cancelled registration
- Active-pass conflict
- Rotation/revocation race
- Network failure
- QR renderer failure
- Generic server error

Never display stack traces, token hashes, database details, or tokens returned in failed/ambiguous operations.

## Accessibility

- Use clear page/section headings.
- Label binding controls.
- Require accessible confirmations.
- Announce issue/rotate/revoke success and failure.
- Preserve focus after dialogs and actions.
- Provide keyboard operation for all controls.
- Do not rely on QR image alone; include safe text stating status and expiry.
- Provide accessible hide/reveal behavior if an established secure-secret component uses it.
- Meet existing contrast, responsive, print, and reduced-motion standards.

## Required tests

Add tests proving:

1. Authorized staff can access pass management.
2. Authorized member/household access follows 7.3R ownership exactly.
3. Unauthorized/cross-tenant/cross-household access reveals nothing.
4. Metadata never displays raw token/hash.
5. Issue renders a QR from the immediate raw token response.
6. QR payload contains no personal data.
7. Raw token is absent from URLs, persistent caches/stores, storage, cookies, logs, analytics mocks, and snapshots.
8. Leaving/changing registration/hiding clears the in-memory secret.
9. Existing active pass cannot have its secret recovered; rotation is offered.
10. Rotation requires confirmation, clears old secret, and displays only the new pass.
11. Concurrent rotation failure never reveals another request’s secret.
12. Revocation requires confirmation and immediately clears displayed secret.
13. Duplicate submissions produce one request.
14. Loading, eligibility, ownership, conflict, network, renderer, and server errors render safely.
15. Printing/download, if supported, exclude private controls and personal filenames/data.
16. Keyboard, focus, labels, announcements, contrast, and non-image status pass accessibility checks.
17. Existing Blueprint 7.2–7.3R tests continue to pass.

Include page-to-real-API integration coverage for issue/rotate/revoke when supported.

## Verification order

Run and report:

1. Focused baseline tests for Blueprints 7.2–7.3R
2. Formatting/check
3. Focused 7.3S component/page tests
4. Accessibility and print checks
5. Secret-lifecycle/cache/storage/logging tests
6. Page-to-7.3R integration tests
7. QR payload/privacy tests
8. Blueprint 7.2–7.3R regression tests
9. Full suite when feasible
10. Lint/static analysis
11. Type checking
12. Production build

Report exact commands and actual outcomes. Identify skipped, unavailable, or failing checks.

## Definition of done

- Authorized staff and supported member/household users can manage QR pass metadata.
- Immediate issue/rotation secrets can be displayed as QR codes.
- Previously issued secrets cannot be recovered.
- Raw tokens remain ephemeral and absent from persistent browser/application data.
- Rotation/revocation are confirmed and accurately represented.
- QR payload contains no personal information.
- No token resolution, scanning, delivery, or check-in-by-QR is added.
- Existing tests remain passing.
- Documentation identifies Blueprint 7.3T as the future secure QR token-resolution service.

## Required final response from Cursor

Provide:

1. Discovery summary and exact baseline result.
2. QR renderer reused and dependency status.
3. Exact files changed grouped by routes/pages/components, client/secret handling, tests, and documentation.
4. Staff/member ownership and authorization behavior.
5. Secret memory/cache/storage/logging, QR payload, rotation, revocation, print, and accessibility safeguards.
6. Exact verification commands and results.
7. Genuine limitations or unexecuted checks.
8. Confirmation that no resolution, scanner, delivery, or QR check-in was added.

## Deployment

This patch should not require a migration.

After review:

1. Deploy through normal BITS procedures.
2. Test authorized staff and member/household access in a non-production tenant.
3. Inspect browser storage, URLs, logs, analytics, and network caching for token leakage.
4. Print/scan the displayed QR using a non-production token only to verify rendering—not check-in resolution.
5. Test rotate/revoke and navigation cleanup.
6. Keep QR scanning/check-in unavailable until later patches are reviewed.

Record only the actual time spent on work allowed by the community-service program.
