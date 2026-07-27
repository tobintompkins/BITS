# Blueprint 7.3P — Secure QR Pass Data Foundation

**Status:** COMPLETE (foundation hardening; no new issuance/API/scanning surface)

## Decision: reuse existing QR pass model

`EventQrPass` already existed from Blueprint 7.3 ops (`event_qr_passes`, hash of bearer token via `lib/events/qr-pass-token.ts`).  
**7.3P does not create a parallel token system.** It hardens constraints, status/lineage fields, hash-only fallback storage, tenant-aware FKs, and an internal foundation repository—same keep-ops posture as 7.3I.

Pre-existing ops issue/resolve/display paths remain; this patch does not add a new public QR lifecycle API. Ops paths were updated to store **fallback code hashes** (plaintext `fallbackCode` removed) so the security model matches the foundation.

## What this patch delivered

- Purpose enum `EVENT_CHECK_IN` and status enum `ACTIVE | REVOKED | EXPIRED | REPLACED`
- Hash-only storage: `tokenHash` + `fallbackCodeHash` (SHA-256 hex); no raw token / plaintext fallback columns
- Lineage/revocation: `revokedAt`, `revokedByUserId`, `replacedByTokenId`, `rotatedAt`, `lastUsedAt`
- Database CHECK constraints for expiry-after-created, no self-replacement, and status/field consistency
- Global uniqueness on `tokenHash` and `fallbackCodeHash`
- Partial unique indexes: at most one **ACTIVE** party pass and one **ACTIVE** attendee pass per tenant + event + registration + purpose
- Tenant-aware composite FKs to event / registration / attendee
- Foundation repository: `server/repositories/event-qr-pass.repository.ts`
  - `persistHashOnlyQrPass` (hashes only)
  - `findActiveQrPassByHashAndPurpose` (tenant + purpose; clock-checked expiry)
  - `listQrPassesForRegistration`
  - `lockQrPassForUpdate`
  - `toSafeQrPassDto` (never includes hashes)
- Validation: `lib/validation/event-qr-pass.ts`
- Constants: `lib/constants/event-qr-pass.ts`

## Lookup design

Token hashes are globally unique, but every foundation lookup requires `organizationId` + `purpose` (default `EVENT_CHECK_IN`) before returning a domain row. Wrong-tenant hashes resolve to “not found.”

## Intentionally unchanged / out of scope

- No new issuance service (7.3Q), API routes, member/staff QR UI, camera/scanner, or check-in-by-token redesign
- No hard-delete helper (history retained after revoke/expire/replace)
- No raw token generation in the foundation repository
- Password-reset / invitation / promotion-offer token facilities untouched

## Migration

`20260725160000_harden_event_qr_pass_foundation`

## Next

Blueprint **7.3Q** — secure QR pass issuance / rotation / revocation service (complete; see `docs/blueprint-7-3q.md`).
