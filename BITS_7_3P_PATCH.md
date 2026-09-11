# BITS Blueprint 7.3P — Secure QR Pass Data Foundation

Prerequisites: Blueprints 7.2 through 7.3O must be implemented and passing.

## Cursor instruction

Implement this patch in the existing BITS repository now. Inspect the repository first, follow its actual architecture and security conventions, make the changes, and run the required checks. Do not stop after producing a plan.

If the event, registration, attendee, tenant, or check-in foundations are missing or failing, stop and report the prerequisite. Do not expose QR issuance or scanning in this patch.

## Discovery

Before editing:

1. Identify existing secure opaque-token models and helpers for password reset, invitations, sessions, email verification, or promotion offers.
2. Identify cryptographic random generation, hashing, constant-time comparison, expiry, revocation, one-time-use, key rotation, and secret-redaction conventions.
3. Locate tenant, event/occurrence, registration, attendee, and user relationships.
4. Identify ORM, migration, composite foreign-key, RLS, identifier, clock, and soft-delete conventions.
5. Identify security test helpers and log/audit redaction tests.
6. Run focused Blueprint 7.2–7.3O tests and report the exact baseline result.

Reuse an existing secure-token facility when it satisfies the requirements. Do not create a parallel token system unnecessarily.

## Scope

Add only the persistence/domain foundation for future event QR passes:

- QR pass purpose/status values when needed.
- A secure QR pass token record or extension of the established secure-token model.
- Tenant/event/registration binding and optional attendee binding.
- Hash-only token storage.
- Expiry, revocation, rotation lineage, and safe metadata.
- Tenant-aware constraints and indexes.
- Minimal internal repository/data-access support.
- Synthetic fixtures/factories.
- Migration, model, constraint, tenant-isolation, token-redaction, and regression tests.
- A short Blueprint 7.3P release note.

## Out of scope

Do not add:

- Token issuance service
- Raw token generation returned to a caller
- QR image generation or rendering
- API routes
- Member or staff UI
- Camera/scanner access
- Check-in by token
- Email/SMS notifications
- Background jobs
- Native mobile or offline behavior
- New QR/crypto dependencies

No usable QR pass may be issued or scanned after deploying this patch.

## Token model

Adapt names/types to existing secure-token conventions.

Required logical fields:

- `id`
- tenant/organization/church ID
- event ID or event-occurrence ID
- registration ID
- attendee ID, nullable for a party-level pass
- `purpose`
- `tokenHash`
- `status`
- `expiresAt`
- `revokedAt`, nullable
- `revokedByUserId`, nullable
- `replacedByTokenId`, nullable
- `createdAt`
- `updatedAt` only if immutable-token records conventionally include it

Purpose:

- `EVENT_CHECK_IN`

Statuses, or equivalent derived state:

- `ACTIVE`
- `REVOKED`
- `EXPIRED`
- `REPLACED`

Do not store status redundantly when the existing token facility derives it safely from timestamps/fields.

## Security requirements

1. The database stores only a strong hash of the bearer token, never the raw token.
2. Use the existing password-reset/invitation token hashing strategy when appropriate.
3. The token must eventually be generated with a cryptographically secure random source; this patch adds storage only.
4. Do not store names, email, phone, date of birth, notes, tenant name, or other personal data in token records.
5. Token purpose must be explicit and enforced by future lookups.
6. Token hashes must not appear in normal DTOs, logs, audit metadata, exceptions, fixtures displayed in snapshots, or admin exports.
7. Raw-token columns, reversible encryption, sequential-ID-only passes, and plaintext lookup values are prohibited.
8. Do not add a database prefix containing meaningful tenant/event/registration information.

## Relationships and invariants

1. Tenant, event/occurrence, registration, and optional attendee must agree.
2. A bound attendee must belong to the bound registration and event/occurrence.
3. Party-level passes have null attendee ID and remain registration-bound.
4. `expiresAt` must be later than creation time under existing timestamp conventions.
5. Revoked/replaced state must have consistent timestamps/relationships.
6. Replacement tokens must share tenant, event/occurrence, registration, attendee binding, and purpose.
7. A token cannot replace itself.
8. Replacement chains must not form cycles; enforce through the established service/domain layer later if the database cannot express it safely.
9. Token records are never hard-deleted merely because they expire or are revoked.
10. Existing registrations/events require no backfill.

## Uniqueness

- Token hash must be globally unique or scoped according to the established secure-token design, with collision treated as failure.
- Permit at most one active pass for the same tenant + event/occurrence + registration + attendee-binding + purpose when the database can safely enforce it.
- Treat null attendee binding correctly for party-level uniqueness.
- Prefer a partial unique index or established active-token constraint.

Do not rely only on an application preflight query for active uniqueness.

## Repository/data-access boundary

Add the smallest internal data-access methods consistent with BITS:

- Persist a prepared hash-only token record for tests and future issuance services.
- Resolve an active candidate by token hash + purpose within the required trusted scope.
- Resolve/list tokens for one tenant-scoped registration for future rotation/revocation.
- Lock a token record for future rotation/revocation.

Do not expose raw token creation, issuance, validation, redemption, or public lookup yet.

Every resource lookup must require tenant and purpose scope or follow an established safe global-hash lookup that verifies tenant/purpose before returning any domain object. Document the chosen design.

## Migration

Use the repository’s migration generator.

The migration must:

- Create or extend the secure-token table/model.
- Add tenant-aware foreign keys.
- Add hash uniqueness and active-pass uniqueness.
- Add status/timestamp/replacement consistency constraints where supported.
- Add indexes for:
  - token hash + purpose
  - tenant + event/occurrence + registration
  - tenant + event/occurrence + attendee
  - active/expiry state
  - replacement relationship
- Extend RLS when used.
- Require no backfill.
- Preserve all existing token types and behaviors.
- Follow normal rollback policy.

Do not alter or weaken password-reset, invitation, session, promotion-offer, or other token security.

## Required tests

Add tests proving:

1. Migration applies to a clean test database.
2. Existing data and existing token facilities remain unchanged.
3. A valid hash-only party pass record can be persisted.
4. A valid hash-only attendee pass record can be persisted.
5. No raw-token field exists in the schema/model.
6. Token hash uniqueness is enforced.
7. Active-pass uniqueness correctly handles attendee and null party binding.
8. Cross-tenant/event/registration/attendee relationships are rejected.
9. Replacement linkage must preserve scope and purpose.
10. Self-replacement and invalid status/timestamp combinations are rejected where enforced.
11. Expiry must follow creation time.
12. Hashes are absent from safe DTOs, logs, audit snapshots, and normal serialization.
13. Repository lookups enforce purpose and tenant/scope rules.
14. Expired, revoked, and replaced tokens are not returned as active.
15. Token history is not hard-deleted.
16. Existing Blueprint 7.2–7.3O tests continue to pass.

Use a real test database for uniqueness and foreign-key constraints when supported.

## Verification order

Run and report:

1. Focused baseline tests for Blueprints 7.2–7.3O
2. Formatting/check
3. Migration generation and validation
4. Focused 7.3P model/repository tests
5. Real-database hash/active uniqueness tests
6. Token serialization/log-redaction tests
7. Existing secure-token regression tests
8. Blueprint 7.2–7.3O regression tests
9. Full suite when feasible
10. Lint/static analysis
11. Type checking
12. Production build

Report exact commands and actual results. Identify skipped, unavailable, or failing checks.

## Definition of done

- Secure hash-only QR pass persistence exists.
- Tokens are bound to tenant, event/occurrence, registration, and optional attendee.
- Purpose, expiry, revocation, and replacement fields/invariants exist.
- Database uniqueness and tenant-aware relationships are tested.
- Raw tokens and hashes cannot leak through ordinary serialization/logging.
- Existing secure-token behavior remains intact.
- No pass can yet be issued, displayed, or scanned.
- Existing tests remain passing.
- Documentation identifies Blueprint 7.3Q as the future secure issuance/rotation/revocation service.

## Required final response from Cursor

Provide:

1. Discovery summary and exact baseline result.
2. Existing token facility reused or reason for the chosen extension.
3. Exact files changed grouped by migration/schema, model/data access, tests, and documentation.
4. Hashing/storage, uniqueness, relationship, expiry, revocation, and replacement safeguards.
5. Serialization/log-redaction behavior.
6. Exact verification commands and results.
7. Genuine limitations or unexecuted checks.
8. Confirmation that no raw token issuance, API, UI, QR image, or scanning was added.

## Deployment

After review:

1. Back up the database using normal BITS procedures.
2. Apply the generated migration.
3. Deploy model/repository code.
4. Run tenant-relationship, hash-uniqueness, active-uniqueness, and redaction smoke tests.
5. Confirm existing token workflows still work.
6. Confirm no usable QR pass can yet be issued or scanned.

Record only the actual time spent on work allowed by the community-service program.
