# BITS Blueprint 7.3U — Authorized QR Resolution and Staff Check-In API

Prerequisites: Blueprints 7.2 through 7.3T must be implemented and passing.

## Cursor instruction

Implement this patch in the existing BITS repository now. Inspect the repository first, follow its actual architecture and security conventions, make the changes, and run the required checks. Do not stop after producing a plan.

If the read-only QR resolution service from 7.3T or transaction-safe single/party check-in services from 7.3C/7.3F/7.3M are missing or failing, stop and report the prerequisite. Do not recreate token or attendance logic in controllers.

## Discovery

Before editing:

1. Locate the 7.3T resolution service, secret input, safe result/errors, authorization, read-only guarantees, and tests.
2. Locate single/party check-in services and their optional station support, transactions, idempotency, and safe results.
3. Locate 7.3D/7.3G/7.3N endpoint conventions for authentication, CSRF, idempotency, validation, error mapping, logging, and concurrency tests.
4. Identify sensitive bearer-token request redaction and body-capture suppression mechanisms.
5. Identify rate-limit/security-event conventions for scan-like credential operations.
6. Run focused Blueprint 7.2–7.3T tests and report the exact baseline result.

## Scope

Add authenticated staff endpoints for:

1. Resolving a QR token into a minimal safe selection result.
2. Checking in the attendee or explicitly selected party attendees represented by that token.

The API must:

- Require the established check-in operation permission.
- Derive tenant, actor, and event/occurrence from trusted server context/route.
- Treat raw QR token input as a secret.
- Call 7.3T for resolution.
- Require explicit attendee selection for party passes.
- Re-resolve and revalidate token within the check-in request; never trust a prior client resolution result.
- Call existing transaction-safe check-in services.
- Support optional active station attribution through completed 7.3N behavior.
- Preserve duplicate/concurrency/idempotency guarantees.
- Suppress raw token/hash from logs, traces, audits, errors, URLs, and responses.
- Add validation, authorization, tenant-isolation, token-state, selection, station, concurrency, redaction, rate-limit, and regression tests.
- Add a short Blueprint 7.3U release note.

## Out of scope

Do not add:

- Camera/scanner UI
- Manual token-entry UI
- Member self check-in
- Automatic check-in immediately upon resolution
- Implicit party-wide check-in
- Token consumption/revocation after check-in
- QR issuance/display changes
- Check-out, walk-ins, corrections, dashboards, or exports
- New dependencies

## Logical endpoints

Use actual BITS route conventions. Logical equivalents:

### Resolve

`POST /events/{eventId}/qr-check-in/resolve`

Body:

```json
{
  "token": "raw-opaque-token"
}
```

### Check in

`POST /events/{eventId}/qr-check-in`

Attendee-bound body:

```json
{
  "token": "raw-opaque-token",
  "stationId": "optional-opaque-station-id"
}
```

Party-bound body:

```json
{
  "token": "raw-opaque-token",
  "attendeeIds": ["opaque-attendee-id-1"],
  "stationId": "optional-opaque-station-id"
}
```

Do not force these paths onto a different API structure. Use occurrence IDs where established.

## Authentication and authorization

1. Require authentication and exact check-in operation permission.
2. Derive tenant and actor from trusted context.
3. Resolve event/occurrence within tenant before token resolution.
4. Do not accept tenant, actor, registration, or token-purpose fields from the client.
5. Cross-tenant/event/wrong-purpose/invalid token failures reveal no identifying data.
6. Staff authorization must occur before returning resolved attendee/registration information.
7. Apply established CSRF protection to cookie-authenticated requests.

## Resolve endpoint

The endpoint must:

- Validate raw token presence/format/maximum length.
- Suppress request body logging.
- Call 7.3T once.
- Return minimal safe data needed for explicit staff selection.
- Create no attendance mutation.
- Avoid returning registration/attendee personal data when existing authorized attendee endpoints can retrieve display names safely.

Safe response:

- Binding type
- Safe pass ID only if needed
- Event/occurrence opaque ID
- Registration opaque ID
- For attendee pass: attendee opaque ID
- For party pass: eligible attendee opaque IDs or established safe selection projection
- Expiry
- Safe eligibility state

Never return raw token/hash.

Resolution must not be treated as proof for a later request; the check-in endpoint revalidates.

## Check-in endpoint

The endpoint must:

1. Authenticate/authorize and resolve event scope.
2. Validate secret token, optional station ID, and optional attendee list shape.
3. Re-run 7.3T resolution.
4. For attendee-bound pass:
   - Reject a conflicting supplied attendee list.
   - Check in only the bound attendee through existing single service.
5. For party-bound pass:
   - Require at least one explicit attendee ID.
   - Enforce existing party selection maximum.
   - Require every selected ID to be included in the resolved eligible party binding.
   - Call existing selected-party service once.
6. Pass optional station ID to completed service input.
7. Return existing safe attendance result.

Do not automatically select all party members.

## Token lifecycle

Successful resolution/check-in must not automatically:

- Revoke or consume token
- Rotate token
- Change expiry
- Record raw-token last-used data

Repeated valid scans rely on attendance idempotency: already-present attendees do not increment counts or change original station attribution.

Cancelled registration/event or pass revocation/rotation immediately prevents future resolution/check-in according to authoritative transaction timing.

## Secret handling

- Raw token appears only in the request body over secure transport.
- Never accept it in route/query/header unless an established secure bearer-token convention explicitly requires a protected header.
- Suppress/redact request body in access logs, application logs, traces, APM, analytics, error reports, and test snapshots.
- Hash/token values never appear in responses or audits.
- Do not echo malformed input.
- Avoid storing token in idempotency records unless the established facility stores a strong request fingerprint safely; never plaintext.
- Apply `Cache-Control: no-store` to resolution/check-in responses where repository policy requires it.

## Error mapping

Use safe repository conventions:

- Unauthenticated/unauthorized → standard safe response
- Missing/malformed/overlong token → generic invalid/unusable pass response
- Unknown/wrong-purpose/cross-tenant/cross-event/expired/revoked/replaced → same generic unusable response
- Disabled/outside-window check-in → safe availability response after authorized resolution
- Invalid party selection → validation/unusable selection response without cross-resource disclosure
- Closed/invalid station → established station response
- Already present → idempotent success
- Unexpected failure → generic server error with correlation ID

Do not expose token state, database errors, stack traces, or tenant data.

## Rate limiting and abuse resistance

- Apply existing credential/scan-sensitive rate limiting by trusted tenant/actor and appropriate request context.
- Do not key rate limits by raw token.
- Use established security-event recording for excessive invalid attempts without storing token/hash or unnecessary personal data.
- Do not add artificial sleeps or an unbounded in-process cache.
- Valid high-throughput staff operations must remain within documented limits.

## Concurrency and idempotency

Cover:

- Same attendee token scanned twice sequentially and simultaneously.
- Party token with overlapping attendee selections.
- Token revoked/rotated concurrently with check-in.
- Station closed concurrently with check-in.
- Same idempotency key reused with different token/selection/station.

Database transactions and existing service locks remain authoritative. Controllers do not implement mutexes.

## Required tests

Add tests proving:

1. Authorized staff can resolve a valid attendee pass safely.
2. Authorized staff can resolve a valid party pass without attendance mutation.
3. Invalid/wrong-purpose/expired/revoked/replaced/cross-scope passes fail generically.
4. Raw token/hash never appear in responses, logs, traces, audits, errors, snapshots, or idempotency plaintext.
5. Attendee pass checks in only its bound attendee.
6. Attendee pass rejects conflicting attendee selection.
7. Party pass requires explicit nonempty bounded selection.
8. Party selection must be within resolved eligible attendees.
9. Unselected party attendees remain unchanged.
10. Optional active station attribution works; invalid/closed station fails safely.
11. Sequential and simultaneous duplicate scans do not double-count.
12. Overlapping party scans remain atomic/idempotent.
13. Concurrent revoke/rotate versus check-in follows documented transaction behavior safely.
14. Concurrent station close remains safe.
15. Resolution/check-in responses use required cache protections.
16. Authentication, permission, CSRF, content-type, request-size, and rate limits are enforced.
17. Controllers call existing services and do not duplicate crypto/transaction logic.
18. Existing Blueprint 7.2–7.3T tests continue to pass.

Use real application/database tests for concurrency and token-state races.

## Verification order

Run and report:

1. Focused baseline tests for Blueprints 7.2–7.3T
2. Formatting/check
3. Focused 7.3U validation/controller tests
4. Secret logging/trace/cache tests
5. Attendee and party integration tests
6. Real-database duplicate/overlap/revoke/rotate/station-close race tests
7. Rate-limit and security-event tests
8. Blueprint 7.2–7.3T regression tests
9. Full suite when feasible
10. Lint/static analysis
11. Type checking
12. Production build

Report exact commands and outcomes. Identify skipped, unavailable, or failing checks.

## Definition of done

- Authenticated staff can resolve a QR pass safely.
- Resolution is read-only and returns minimal selection data.
- Check-in revalidates the token and uses existing transaction-safe services.
- Party passes require explicit attendee selection.
- Optional station attribution works.
- Invalid/token-state/cross-scope failures reveal no identifying data.
- Raw token/hash are absent from responses and observability systems.
- Duplicate/concurrent scans cannot double-count.
- No scanner/camera UI or self check-in is added.
- Existing tests remain passing.
- Documentation identifies Blueprint 7.3V as the future staff QR scanner and fallback-entry UI.

## Required final response from Cursor

Provide:

1. Discovery summary and exact baseline result.
2. Final endpoint methods/paths/request/response fields.
3. Exact files changed grouped by controllers/validators/DTOs, security/rate-limit configuration, tests, and documentation.
4. Authorization, generic token errors, party selection, station, idempotency, and concurrency behavior.
5. Secret logging/trace/cache/audit safeguards.
6. Exact verification commands and results.
7. Genuine limitations or unexecuted checks.
8. Confirmation that no scanner/camera UI or self check-in was added.

## Deployment

This patch should not require a migration.

After review:

1. Deploy through normal BITS procedures.
2. Verify secure transport, request-body suppression, caching, rate limits, and security events.
3. Exercise attendee/party, invalid/revoked/replaced, duplicate, station, and cross-tenant cases in non-production.
4. Inspect logs/traces/audits for token leakage.
5. Keep scanner/camera UI unavailable until 7.3V is reviewed.

Record only the actual time spent on work allowed by the community-service program.
