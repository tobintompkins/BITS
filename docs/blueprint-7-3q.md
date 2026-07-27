# Blueprint 7.3Q — Secure QR Pass Issuance, Rotation, and Revocation

**Status:** COMPLETE (internal service only; no API/UI/QR image/scanner)

## Decision

Build formal issue / rotate / revoke services over the 7.3P `EventQrPass` foundation and existing `lib/events/qr-pass-token.ts` helpers.  
Pre-existing ops `issueOrGetQrPass` / resolve paths remain (keep-ops). This service is the blueprint contract for future **7.3R** API work.

## Authorization

**Staff-only** for this patch:

- `canOperateCheckIn || canManageCheckIn || canManageRegistration`

Member/household ownership is **not** safely reusable yet (ops `memberOwned` skipped permission without verifying ownership). Documented as a prerequisite for a future member-facing API.

Cross-tenant and mismatched event/registration/attendee references return safe not-found / ineligible errors.

## Eligibility (issue / rotate)

- Event in tenant, not `CANCELLED`
- Registration on that event with status `CONFIRMED` or `CHECKED_IN` (stricter than general check-in; excludes `PENDING`)
- Optional attendee on that registration with status `REGISTERED`, `CONFIRMED`, or `CHECKED_IN`
- Check-in settings: `checkInEnabled` and `qrPassEnabled`

Revoke requires tenant-scoped registration existence but not issue eligibility (so outstanding passes can still be revoked).

## Behavior

| Operation | Behavior |
| --- | --- |
| Issue | Lock registration → expire stale ACTIVE → if unexpired ACTIVE exists, return metadata **without** raw token (`reused`); else generate token+fallback, store hashes only, audit, return raw token once |
| Rotate | Lock registration + active pass → demote → create successor → finalize `REPLACED` lineage → audit → return new raw token once |
| Revoke | Lock registration + pass → mark `REVOKED` with actor/time → one audit on transition; idempotent thereafter |

Concurrency: registration `FOR UPDATE` serializes mutations; partial unique ACTIVE indexes prevent forks.

## Expiry

`max(event.endDateTime, issuanceTime) + 24 hours` (documented default; no new settings UI).

## Secret-bearing result

`QrPassSecretResult` holds the raw token privately. `toJSON` / `toString` / `util.inspect` redact it. Never place the object in audit metadata. Audits include only opaque IDs, purpose, expiry, and outcome.

## Key files

- `server/services/event-qr-pass-lifecycle.service.ts`
- `lib/events/qr-pass-secret-result.ts`
- Repository helpers added in `server/repositories/event-qr-pass.repository.ts` (lock/demote/finalize/revoke)
- Constants in `lib/constants/event-qr-pass.ts`

## Intentionally out of scope

- API routes, QR image rendering, scanner/camera, email/SMS, self check-in, member UI
- Token validation/resolution redesign (ops resolve remains)
- Schema migration (none required beyond 7.3P)

## Next

Blueprint **7.3R** — secure QR pass API (complete; see `docs/blueprint-7-3r.md`).
