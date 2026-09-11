# BITS Blueprint 7.3Q — Secure QR Pass Issuance, Rotation, and Revocation Service

Prerequisites: Blueprints 7.2 through 7.3P must be implemented and passing.

## Cursor instruction

Implement this patch in the existing BITS repository now. Inspect the repository first, follow its actual architecture and security conventions, make the changes, and run the required checks. Do not stop after producing a plan.

If the hash-only QR pass persistence foundation from Blueprint 7.3P is missing or failing, stop and report the prerequisite. Do not expose an API, QR image, scanner, or UI in this patch.

## Discovery

Before editing:

1. Locate the 7.3P QR token model, purpose/status representation, constraints, repository, migrations, redaction behavior, and tests.
2. Identify established cryptographically secure random-token generation and strong hashing helpers.
3. Identify existing token issuance, rotation, revocation, expiry, clock, transaction, locking, retry, and one-time raw-secret return patterns.
4. Identify tenant context, member/household ownership, staff authorization, event/registration eligibility, audit, and notification/outbox conventions.
5. Identify secret-bearing value-object and test-redaction conventions.
6. Run focused Blueprint 7.2–7.3P tests and report the exact baseline result.

Reuse established secure-token helpers. Do not introduce custom cryptography or another token framework.

## Scope

Add internal services for:

- Issuing one party-level or attendee-level event check-in QR pass.
- Rotating an active pass.
- Revoking an active pass.

The services must:

- Generate cryptographically secure opaque bearer tokens.
- Store only strong hashes.
- Return the raw token exactly once from issuance/rotation through an explicitly secret-bearing internal result.
- Bind tokens to tenant, event/occurrence, registration, optional attendee, and purpose.
- Enforce registration/attendee eligibility and ownership/authorization.
- Set bounded expiry.
- Make issuance/rotation/revocation transaction-safe, concurrency-safe, and idempotent according to repository conventions.
- Maintain safe replacement lineage.
- Audit material staff actions without recording raw tokens or hashes.
- Add focused service, authorization, tenant-isolation, eligibility, transaction, concurrency, expiry, lineage, audit, and redaction tests.
- Add a short Blueprint 7.3Q release note.

## Out of scope

Do not add:

- API routes or controllers
- QR image or SVG generation
- Member/staff UI
- Token validation/resolution for check-in
- Scanner or camera access
- Email/SMS delivery
- Background expiry jobs
- Self check-in
- Check-out, walk-ins, corrections, dashboards, or exports
- New crypto or QR dependencies

## Authorization modes

Follow existing BITS policies.

Support internal calls for:

- An authorized staff actor managing a same-tenant registration pass.
- A member acting only on their own registration or an authorized household registration, if equivalent ownership policy already exists and Blueprint 7.3 intends member QR access.

Rules:

1. Staff issuance/rotation/revocation requires the established check-in/pass management permission.
2. Member ownership must be checked server-side through existing registration/household policy.
3. Tenant scope is applied before registration, attendee, or token resolution.
4. Cross-tenant/nonexistent resources use safe repository-standard not-found behavior.
5. An attendee-bound pass may be managed only through authorization to its parent registration.
6. Do not invent weaker household authorization.

If member authorization cannot be safely reused, implement staff-only internal services and document member ownership as a prerequisite for the future API.

## Eligibility

Issue or rotate only when:

- Event/occurrence belongs to the active tenant.
- Registration belongs to that event/occurrence.
- Registration is confirmed/active under the actual Blueprint 7.2 status model.
- Optional attendee belongs to the exact registration/event and is active.
- Event check-in and QR passes are permitted by completed settings, if a QR-specific flag already exists.
- Expiry can be bounded safely relative to the event.

Do not issue for pending, waitlisted, offered, cancelled, declined, expired, or otherwise ineligible registrations.

Do not silently change registration or attendee status.

## Token generation and hashing

- Use the established cryptographically secure random generator.
- Use sufficient entropy matching or exceeding existing bearer-token policy.
- Encode with an established URL/QR-safe representation.
- Store only the established strong hash.
- Compare/resolve hashes only through safe repository helpers.
- Retry a hash collision only through an existing bounded retry convention; otherwise fail safely.
- Never derive token bytes from sequential IDs, timestamps, names, emails, or predictable randomness.
- Never include personal or tenant information in the raw token.

## Expiry

Use existing event timezone/clock conventions.

Expiry must:

- Be after issuance.
- Be capped to a repository-consistent interval after the event/occurrence ends.
- Never be unbounded.
- Respect a configured pass lifetime if one already exists.

If no QR-pass lifetime setting exists, use the smallest repository-consistent policy, such as event end plus 24 hours, document it, and avoid adding a new settings UI in this patch.

## Issue service

Logical input:

- Trusted tenant context
- Authenticated actor/owner context
- Event/occurrence opaque ID
- Registration opaque ID
- Optional attendee opaque ID
- Optional idempotency key only when already supported

Behavior:

1. Authorize and validate eligibility.
2. Lock active-pass scope as required.
3. If an active pass already exists, follow an explicit repository-consistent policy:
   - return metadata without raw token and require rotation to obtain a new secret, or
   - treat an idempotent replay as the original secret-bearing result only when the established idempotency store can securely replay it.
4. Otherwise generate raw token, hash it, persist active record, audit safe metadata, commit, and return the raw token once.

Never retrieve or reconstruct a raw token from storage.

## Rotation service

Rotation must:

1. Authorize and resolve the active token through trusted registration/pass identity—not a raw token supplied by an admin client at this layer.
2. Generate a new raw token and hash.
3. Create the replacement record with identical tenant/event/registration/attendee/purpose binding and a valid new expiry.
4. Mark the previous token `REPLACED` using completed 7.3P representation.
5. Set replacement lineage.
6. Commit old/new state and audit atomically.
7. Return the new raw token once.

After commit, the old token must not be considered active.

Two simultaneous rotations must create one authoritative active replacement. Prevent forks in replacement lineage through locking and database constraints.

## Revocation service

Revocation must:

- Authorize and resolve the token within tenant/registration scope.
- Mark an active token revoked with actor and authoritative time.
- Preserve historical record.
- Be idempotent for an already revoked/replaced/expired token according to established semantics.
- Never return raw token or hash.
- Create one material audit event for one effective revocation.

Two simultaneous revocations must produce one effective transition and one material audit event.

## Secret-bearing result

Issuance/rotation may return internally:

- Raw opaque token, explicitly marked secret/sensitive
- Safe token/pass opaque ID
- Event/occurrence ID
- Registration ID
- Optional attendee ID
- Purpose
- Expiry

The result type must:

- Avoid default serialization when the language/framework supports it.
- Redact the raw token in debug/string/log output.
- Never be placed directly into general audit metadata.
- Never include token hash.

Revocation results contain no raw token.

## Audit

Audit:

- Pass issued
- Pass rotated
- Pass revoked

Safe metadata may include opaque pass, event, registration, attendee, actor identifiers; purpose; expiry; and outcome. Never include raw token, token hash, QR payload, personal details, or complete result/request objects.

Failed/rolled-back operations must not create misleading success audits.

## Required tests

Add tests proving:

1. Authorized staff can issue one eligible party pass.
2. Authorized ownership can issue an attendee/party pass only when completed policy supports it.
3. Ineligible registration/attendee statuses are rejected.
4. Cross-tenant/event/registration/attendee references fail safely.
5. Stored record contains hash, never raw token.
6. Raw token has sufficient entropy/format under established helper tests.
7. Expiry is bounded correctly.
8. Duplicate issue cannot create multiple active passes.
9. Idempotency behavior never fabricates/reconstructs a raw token.
10. Rotation invalidates old active state and creates correct lineage/binding.
11. Simultaneous rotations cannot fork the lineage or leave multiple active passes.
12. Revocation is effective, historical, and idempotent.
13. Simultaneous revocations produce one transition/audit.
14. Transaction/audit failure rolls back all state.
15. Secret-bearing results redact raw token from string/debug/log/serialization paths.
16. Audit/logs never contain raw token or hash.
17. Existing secure-token workflows remain passing.
18. Existing Blueprint 7.2–7.3P tests continue to pass.

Use a real test database for uniqueness, locking, rotation, and revocation concurrency.

## Verification order

Run and report:

1. Focused baseline tests for Blueprints 7.2–7.3P
2. Formatting/check
3. Focused 7.3Q service tests
4. Real-database simultaneous issue/rotation/revocation tests
5. Secret serialization/log/audit redaction tests
6. Existing secure-token regression tests
7. Blueprint 7.2–7.3P regression tests
8. Full suite when feasible
9. Lint/static analysis
10. Type checking
11. Production build

Report exact commands and outcomes. Identify skipped, unavailable, or failing checks.

## Definition of done

- Internal issue, rotate, and revoke services exist.
- Raw tokens are securely generated and returned only once.
- Only hashes are stored.
- Binding, eligibility, authorization, expiry, and tenant scope are enforced.
- Rotation cannot fork; revocation is idempotent.
- Secrets/hashes are absent from logs, audits, and ordinary serialization.
- No API, QR image, scanner, delivery, or UI is added.
- Existing tests remain passing.
- Documentation identifies Blueprint 7.3R as the future secure QR pass API.

## Required final response from Cursor

Provide:

1. Discovery summary and exact baseline result.
2. Existing crypto/token helpers reused.
3. Exact files changed grouped by services/domain, data access, tests, and documentation.
4. Authorization/ownership and eligibility behavior.
5. Entropy, hashing, expiry, issuance, rotation, lineage, revocation, transaction, and idempotency behavior.
6. Secret/log/audit redaction safeguards.
7. Exact verification commands and results.
8. Genuine limitations or unexecuted checks.
9. Confirmation that no API, QR image, scanner, delivery, or UI was added.

## Deployment

This patch should not require a migration unless 7.3P missed an essential constraint. Do not change schema for naming preferences.

After review:

1. Back up the database under normal BITS procedures.
2. Apply only a genuinely required documented migration.
3. Deploy internal service code.
4. Run staff/ownership, eligibility, rotation-concurrency, revocation-idempotency, and redaction smoke tests.
5. Confirm no public caller can issue or retrieve a pass yet.

Record only the actual time spent on work allowed by the community-service program.
