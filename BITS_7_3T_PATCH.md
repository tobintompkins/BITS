# BITS Blueprint 7.3T — Secure QR Token Resolution and Eligibility Service

Prerequisites: Blueprints 7.2 through 7.3S must be implemented and passing.

## Cursor instruction

Implement this patch in the existing BITS repository now. Inspect the repository first, follow its actual architecture and security conventions, make the changes, and run the required checks. Do not stop after producing a plan.

If the QR token storage/issuance work from 7.3P–7.3Q or the transaction-safe check-in services from 7.3C/7.3F are missing or failing, stop and report the prerequisite. Do not add an API, scanner, camera UI, or automatic check-in in this patch.

## Discovery

Before editing:

1. Locate the 7.3P token model/repository and 7.3Q hashing, purpose, expiry, rotation, revocation, and redaction conventions.
2. Locate existing secure bearer-token verification helpers and constant-time/hash lookup patterns.
3. Locate 7.3C/7.3F check-in eligibility, tenant, station, transaction, and safe-result behavior.
4. Identify authentication/authorization policy for staff QR operation and any intended self-service behavior.
5. Identify clock, generic-not-found/error masking, rate-limit adapter, audit/security-event, and test conventions.
6. Run focused Blueprint 7.2–7.3S tests and report the exact baseline result.

## Scope

Add one internal security-sensitive service that resolves a raw event-check-in QR token into a safe, tenant/event-scoped pass result and evaluates whether it is currently usable.

The service must:

- Accept a raw opaque token through an explicitly secret-bearing input.
- Hash it immediately using the established 7.3Q helper.
- Resolve by hash and exact `EVENT_CHECK_IN` purpose.
- Verify tenant and event/occurrence scope supplied from trusted context.
- Verify active, unexpired, unrevoked, unreplaced state.
- Verify registration and optional attendee binding/eligibility.
- Verify event check-in availability/window.
- Return a minimal safe internal resolution DTO.
- Produce indistinguishable failures for invalid, wrong-purpose, wrong-tenant, and unknown tokens where security policy requires.
- Avoid mutating attendance, token state, or pass history.
- Add focused token-security, tenant-isolation, eligibility, expiry, rotation/revocation, timing/error-masking, audit/log-redaction, and regression tests.
- Add a short Blueprint 7.3T release note.

## Out of scope

Do not add:

- Public/API routes
- Scanner or camera UI
- Manual token-entry UI
- Attendance check-in mutation
- Token consumption or one-time-use behavior
- Self check-in
- QR pass issuance/rotation/revocation changes
- Station attribution changes
- Check-out, walk-ins, corrections, dashboards, or exports
- New dependencies

Resolution is read-only. A valid result does not check anyone in.

## Input

Logical input:

- Trusted tenant context
- Trusted event/occurrence opaque ID
- Authenticated actor context when staff authorization is part of the established application layer
- Raw opaque token, explicitly treated as secret

Optional station ID is not part of token resolution. Station selection belongs to the later check-in operation.

Rules:

- Reject missing, empty, malformed, or overlong token input using safe generic behavior.
- Apply a conservative maximum length based on the generated token format.
- Never accept tenant/event/registration/attendee IDs embedded alongside or outside the token as authoritative.
- Never parse personal information from the token.
- Do not log or serialize the raw token.

## Hashing and lookup

1. Normalize only according to the exact 7.3Q token encoding rules; do not trim/change secrets unless established behavior requires it.
2. Hash immediately.
3. Clear/release the raw-token value as soon as practical for the language/runtime.
4. Query using the hash and exact purpose.
5. Do not perform prefix, partial, case-insensitive, sequential-ID, or plaintext lookup.
6. Do not reveal whether the hash exists under another purpose or tenant.
7. Keep token hash out of results, errors, logs, audit metadata, and snapshots.

Use existing safe lookup/index behavior. Do not invent custom cryptography.

## Authorization and scope

For staff resolution:

- Require the established check-in operation permission before returning resolved registration/attendee information.
- Scope the requested event/occurrence through the active tenant.
- Require token binding to the same tenant and event/occurrence.
- Cross-tenant and cross-event tokens fail identically to invalid tokens.

Do not implement member self-resolution unless an established, reviewed policy already exists and is required by completed architecture. Document staff-only behavior when applicable.

## Token-state validation

A token is usable only when:

- Purpose is exactly `EVENT_CHECK_IN`.
- Status/derived state is active.
- Current authoritative time is before expiry under established boundary conventions.
- It is not revoked.
- It has not been replaced.
- Replacement lineage is internally consistent.
- Its event/occurrence and registration still exist and match tenant scope.

Expired, revoked, replaced, wrong-purpose, unknown, malformed, cross-tenant, and cross-event tokens must not return identifying data.

Do not mutate token status merely because expiry time passed unless the established token architecture derives/persists expiry safely elsewhere.

## Registration and attendee eligibility

Verify:

- Registration belongs to the bound tenant/event/occurrence.
- Registration is confirmed/active under actual Blueprint 7.2 statuses.
- Registration is not cancelled, declined, expired, waitlisted, offered, or pending.
- For attendee-bound passes, attendee belongs to that exact registration/event and is active.
- For party passes, return only a safe list/count of eligible attendee bindings needed by a future staff selection step.
- Event check-in is enabled and within its configured window.

Do not change registration/attendee status, promote waitlists, or bypass capacity rules.

## Safe resolution result

Return only what the later authorized check-in API needs:

- Safe pass opaque ID
- Event/occurrence opaque ID
- Registration opaque ID
- Binding type
- Optional attendee opaque ID
- For party passes, eligible attendee opaque IDs or a safe internal selection projection consistent with 7.3F
- Expiry
- Eligibility outcome

Do not return:

- Raw token or token hash
- Contact information
- Sensitive notes
- Internal IDs
- Tenant ID
- Replacement secrets
- Audit metadata
- Device/tracking information

Names may be resolved by a later authorized UI through existing attendee data sources rather than placed in this security-service result.

## Error behavior

Use a generic invalid/unusable-token domain result for:

- Unknown token
- Wrong purpose
- Wrong tenant/event
- Malformed token
- Expired/revoked/replaced token
- Broken binding

If product requirements need staff-friendly distinctions for an otherwise authorized same-tenant pass, expose only a coarse safe category such as `UNUSABLE`, not identifying details. Document the choice.

Keep error status, message size, and observable processing reasonably uniform using existing security conventions. Do not add artificial sleeps.

Eligibility conditions such as check-in not open may use established safe domain results only after the token has been fully authorized and scoped.

## Read-only and idempotency

Resolution must not:

- Check in attendance
- Increment counters
- Append attendance actions
- Update station activity
- Rotate/revoke/consume tokens
- Change last-used timestamps unless an established security-token facility requires a privacy-reviewed access timestamp
- Emit a material success audit event for every scan attempt

Follow existing security-event/rate-limit telemetry for invalid attempts without recording raw token/hash or excessive personal data.

## Required tests

Add tests proving:

1. A valid same-tenant/event active party token resolves to a safe party binding.
2. A valid attendee token resolves to the correct safe attendee binding.
3. Raw token is hashed immediately and plaintext lookup is absent.
4. Wrong-purpose, unknown, malformed, overlong, cross-tenant, and cross-event tokens fail without identifying data.
5. Expired, revoked, and replaced tokens are unusable.
6. Exact expiry boundary follows existing clock conventions.
7. Cancelled/inactive/non-confirmed registration is unusable.
8. Invalid attendee binding or inactive attendee is unusable.
9. Party results include only eligible safe attendee identifiers/projection.
10. Check-in disabled and outside-window results follow documented safe behavior.
11. Unauthorized staff cannot resolve identifying information.
12. Resolution does not mutate attendance, actions, station activity, token state, or registration.
13. Raw token/hash are absent from results, logs, audits, traces, errors, and snapshots.
14. Failure categories/timing-visible behavior follow existing security policy without artificial sleeps.
15. Repeated resolution is read-only and stable.
16. Existing issue/rotate/revoke and check-in service tests remain passing.
17. Existing Blueprint 7.2–7.3S tests continue to pass.

Use a real test database for token-state and tenant relationship assertions when supported.

## Verification order

Run and report:

1. Focused baseline tests for Blueprints 7.2–7.3S
2. Formatting/check
3. Focused 7.3T resolution tests
4. Token-state, purpose, expiry, tenant/event isolation tests
5. Read-only/no-side-effect tests
6. Secret/log/audit/trace redaction tests
7. Existing secure-token and check-in regression tests
8. Blueprint 7.2–7.3S regression tests
9. Full suite when feasible
10. Lint/static analysis
11. Type checking
12. Production build

Report exact commands and outcomes. Identify skipped, unavailable, or failing checks.

## Definition of done

- One internal read-only QR token-resolution service exists.
- It hashes immediately and resolves only exact-purpose secure tokens.
- Tenant/event, token state, registration, attendee, and check-in-window eligibility are enforced.
- Failures reveal no cross-tenant or token-state identifying information.
- Results contain no raw token/hash or sensitive attendee data.
- Resolution creates no attendance or token mutation.
- No API, scanner, camera UI, or QR check-in mutation is added.
- Existing tests remain passing.
- Documentation identifies Blueprint 7.3U as the future authorized QR resolution/check-in API.

## Required final response from Cursor

Provide:

1. Discovery summary and exact baseline result.
2. Exact files changed grouped by service/domain, data access, tests, and documentation.
3. Hash/lookup, purpose, tenant/event, token-state, and eligibility behavior.
4. Safe result and generic error behavior.
5. Read-only, redaction, logging, and security-event behavior.
6. Exact verification commands and results.
7. Genuine limitations or unexecuted checks.
8. Confirmation that no API, scanner, camera UI, or attendance mutation was added.

## Deployment

This patch should not require a migration.

After review:

1. Deploy internal service code.
2. Test valid, expired, revoked, replaced, wrong-purpose, cross-event, and cross-tenant tokens in a non-production environment.
3. Inspect logs/traces/audits for secret leakage.
4. Confirm repeated resolution creates no attendance/token/station side effects.
5. Confirm no external route can resolve a token yet.

Record only the actual time spent on work allowed by the community-service program.
