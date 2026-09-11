# BITS Blueprint 7.3R — Secure QR Pass API

Prerequisites: Blueprints 7.2 through 7.3Q must be implemented and passing.

## Cursor instruction

Implement this patch in the existing BITS repository now. Inspect the repository first, follow its actual architecture and security conventions, make the changes, and run the required checks. Do not stop after producing a plan.

If the secure issue/rotate/revoke services from Blueprint 7.3Q are missing or failing, stop and report the prerequisite. Do not recreate token generation, hashing, eligibility, rotation, revocation, transaction, or audit logic in controllers.

## Discovery

Before editing:

1. Locate the 7.3Q services, secret-bearing result type, authorization/ownership rules, errors, idempotency, expiry, audit, and tests.
2. Locate established authenticated API/controller patterns for staff and member-owned resources.
3. Identify API handling for one-time secrets such as recovery codes, invitation tokens, or newly created API keys.
4. Identify response serialization, `Cache-Control`, referrer policy, CORS, CSRF, rate-limit, logging/redaction, request-size, and idempotency conventions.
5. Identify opaque-ID and household/registration authorization test helpers.
6. Run focused Blueprint 7.2–7.3Q tests and report the exact baseline result.

## Scope

Expose thin authenticated endpoints for:

- Issuing a party-level or attendee-level QR pass.
- Rotating an existing QR pass.
- Revoking an existing QR pass.
- Reading safe pass metadata for an authorized registration, if required by the future UI.

The API must:

- Derive tenant and actor/owner from trusted authentication context.
- Enforce the exact 7.3Q staff or member/household authorization policy.
- Validate request shape.
- Call each corresponding 7.3Q service once.
- Return a raw token only in the immediate successful issue/rotation response.
- Never return token hash.
- Apply no-store/private caching protections to secret-bearing responses.
- Preserve transaction, concurrency, idempotency, expiry, lineage, audit, and redaction guarantees.
- Add focused validation, authentication, authorization, ownership, tenant-isolation, secret-response, caching, logging, concurrency, and regression tests.
- Add a short Blueprint 7.3R release note.

## Out of scope

Do not add:

- QR image, SVG, canvas, or data URL generation
- Member or staff UI
- Token validation/resolution for check-in
- Scanner or camera access
- Email/SMS delivery
- Background jobs
- Public unauthenticated pass issuance
- Self check-in
- Check-out, walk-ins, corrections, dashboards, or exports
- New dependencies

## Logical endpoints

Use actual BITS conventions. Logical equivalents are:

### Issue

`POST /events/{eventId}/registrations/{registrationId}/qr-passes`

Optional body:

```json
{
  "attendeeId": "optional-opaque-attendee-id"
}
```

Null/omitted attendee means party-level only if 7.3Q supports that binding.

### Rotate

`POST /events/{eventId}/registrations/{registrationId}/qr-passes/{passId}/rotate`

### Revoke

`POST /events/{eventId}/registrations/{registrationId}/qr-passes/{passId}/revoke`

### Metadata

Use an existing safe list/detail convention only when needed for future authorized UI:

`GET /events/{eventId}/registrations/{registrationId}/qr-passes`

Do not force these example paths onto a different API structure. Use occurrence IDs where established.

## Request rules

Accept only:

- Event/occurrence opaque ID from route context
- Registration opaque ID
- Optional attendee opaque ID for issuance
- Pass opaque ID for rotate/revoke
- Existing idempotency header where supported

Never accept:

- Tenant ID
- Actor/user ID
- Raw token supplied for administration
- Token hash
- Purpose
- Expiry chosen by the client
- Status
- Rotation/replacement IDs
- Audit metadata
- Registration/attendee status changes

Purpose remains server-controlled as `EVENT_CHECK_IN`.

## Authentication and authorization

1. Require authentication.
2. Derive tenant and actor from trusted context.
3. Staff operations require the exact pass/check-in management permission from 7.3Q.
4. Member operations require ownership of the registration or established household authority.
5. Apply authorization on every issue, metadata, rotate, and revoke request.
6. Attendee-bound operations inherit authorization through the exact parent registration.
7. Cross-tenant, cross-event, cross-registration, and nonexistent resources use safe indistinguishable not-found behavior.
8. Do not reveal pass existence to an unauthorized household/member.
9. Apply established CSRF protection to cookie-authenticated mutations.

Do not broaden 7.3Q authorization in the controller.

## Secret-bearing issue/rotation response

The immediate successful issue or rotation response may contain:

- Raw opaque token
- Safe pass opaque ID
- Event/occurrence opaque ID
- Registration opaque ID
- Optional attendee opaque ID
- Expiry

Requirements:

- Return the raw token exactly once.
- Never return token hash.
- Use the established secret-response field naming and serialization.
- Set repository-consistent `Cache-Control: no-store` and other private/no-cache protections.
- Avoid embedding the token in a URL.
- Do not include token in redirects, query strings, fragments, cookies, response headers, analytics, traces, or error messages.
- Ensure general response logging/body capture redacts or skips the secret field.
- Do not include personal data in the token response unless already required by a safe authorized UI contract; prefer none.

If the framework automatically records response bodies, configure existing per-route redaction/suppression.

## Metadata response

Metadata may include:

- Safe pass opaque ID
- Binding type (`PARTY` or `ATTENDEE`) if established
- Optional attendee opaque ID
- Status/derived state
- Expiry
- Created time
- Revoked/replaced time when safe

Never include raw token, token hash, replacement token secret, personal details, or internal IDs.

Metadata responses do not reveal or reconstruct a previously issued raw token.

## Rotate behavior

- Identify the pass by safe opaque pass ID within tenant/event/registration scope.
- Do not require or accept the old raw token for an authenticated management/owner rotation.
- Call 7.3Q once.
- Return only the new raw token once with no-store protection.
- A simultaneous rotation must preserve one authoritative active replacement and safe conflict/idempotent behavior.
- Never leak the winner’s raw token to a losing concurrent request unless the existing idempotency mechanism securely replays that exact authorized response.

## Revoke behavior

- Call 7.3Q once.
- Return safe metadata/outcome only; never raw token/hash.
- Repeated revocation is idempotent.
- A replaced/expired pass follows 7.3Q semantics.
- Simultaneous revocation produces one material transition/audit.

## Error mapping

Follow repository conventions:

- Unauthenticated → standard authentication response
- Unauthorized → forbidden or safely masked response
- Malformed opaque IDs/body → validation response
- Cross-scope/nonexistent resource → not-found response
- Ineligible registration/attendee → safe domain/conflict response
- Active-pass conflict → safe conflict/idempotency response
- Conflicting idempotency-key reuse → established conflict response
- Unexpected failure → generic server error with correlation ID

Error responses must never contain raw token, token hash, database constraint names, stack traces, or another tenant’s information.

## Logging, caching, and transport

- Require the project’s normal secure transport assumptions.
- Apply no-store protections to secret responses.
- Preserve safe correlation IDs without logging bodies.
- Redact secret fields from access/application/error/APM logs.
- Do not add token values to audit logs or metrics labels.
- Apply existing rate limits for sensitive credential-like operations.
- Apply existing content-type and request-size limits.
- Do not introduce global logging changes that weaken other endpoints.

## Required tests

Add tests proving:

1. Authorized staff can issue a party pass.
2. Authorized member/household issuance follows exact 7.3Q policy.
3. Unauthorized/cross-tenant/cross-registration operations reveal nothing.
4. Ineligible registration/attendee errors map safely.
5. Issue response contains raw token once and never hash.
6. Issue response has required no-store/private caching headers.
7. Metadata response never contains raw token/hash.
8. A prior raw token cannot be retrieved through metadata.
9. Rotation returns one new raw token, invalidates old state, and never returns hash.
10. Simultaneous rotations do not fork or leak the winning secret.
11. Revocation returns no raw token and is idempotent.
12. Simultaneous revocations produce one transition/audit.
13. CSRF, rate-limit, request-size, and content-type behavior matches comparable sensitive routes.
14. Idempotency replay/conflict behavior follows 7.3Q without fabricating secrets.
15. Raw tokens and hashes are absent from access, application, error, audit, trace, and snapshot logs.
16. Unexpected errors expose no secret or database details.
17. Controllers remain thin and call 7.3Q.
18. Existing Blueprint 7.2–7.3Q tests continue to pass.

Use real application/database concurrency tests for simultaneous rotation/revocation.

## Verification order

Run and report:

1. Focused baseline tests for Blueprints 7.2–7.3Q
2. Formatting/check
3. Focused 7.3R validation/controller tests
4. Secret-response caching and redaction tests
5. Real-database simultaneous rotation/revocation endpoint tests
6. Ownership and tenant-isolation integration tests
7. Existing secure-token regression tests
8. Blueprint 7.2–7.3Q regression tests
9. Full suite when feasible
10. Lint/static analysis
11. Type checking
12. Production build

Report exact commands and actual outcomes. Identify skipped, unavailable, or failing checks.

## Definition of done

- Thin authenticated issue, metadata, rotate, and revoke APIs exist as needed.
- Authorization and ownership match 7.3Q.
- Raw token appears only in immediate issue/rotation success.
- Token hash never appears.
- Secret responses are no-store and excluded/redacted from logs.
- Metadata cannot retrieve a prior secret.
- Rotation/revocation concurrency remains safe.
- No QR image, scanner, delivery, or UI is added.
- Existing tests remain passing.
- Documentation identifies Blueprint 7.3S as the future authorized QR pass display UI.

## Required final response from Cursor

Provide:

1. Discovery summary and exact baseline result.
2. Exact methods/paths and request/response fields.
3. Exact files changed grouped by controllers/validators/DTOs, security configuration, tests, and documentation.
4. Staff/member authorization and tenant/ownership behavior.
5. One-time secret, caching, logging, idempotency, rotation, and revocation safeguards.
6. Exact verification commands and results.
7. Genuine limitations or unexecuted checks.
8. Confirmation that no QR image, scanner, delivery, or UI was added.

## Deployment

This patch should not require a migration.

After review:

1. Deploy through normal BITS procedures.
2. Verify HTTPS/secure transport configuration.
3. Exercise staff and authorized-member issue/metadata/rotate/revoke flows in a non-production tenant.
4. Inspect headers and application/APM logs to confirm secret suppression.
5. Test cross-tenant, unauthorized, idempotent, and simultaneous rotation behavior.
6. Keep QR pass display unavailable until 7.3S is reviewed.

Record only the actual time spent on work allowed by the community-service program.
