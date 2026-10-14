# Original v1 — Staff invitations and explicit onboarding (Core 10)

October 14, 2026. This increment extends `/administration/staff-access`
and the existing `OrganizationMembership` model so an active organization
administrator can authorize an original staff invitation. The recipient
must sign in and explicitly accept before a BITS role exists. It does not
create a second membership system, restore login-time grants, send live
mail by default, or mark original version 1 complete.

## Chosen acceptance flow

Clerk Organization Invitations are the delivery channel. BITS persists
local intent first, then calls
`clerkClient.organizations.createOrganizationInvitation` with Clerk role
`org:member`, a fixed redirect origin, and public metadata containing
only the local invitation id. That Clerk role is not a BITS financial
role.

After the recipient follows the provider link and signs in, BITS uses a
**signed-in explicit accept action** at `/staff-invitations/accept`. The
server reads the Clerk session and, separately, backend organization
membership evidence. A matching email, selected org, public metadata, or
unsigned callback cannot grant `OrganizationMembership`. Webhooks are not
the grant path, so a late provider event cannot revive a locally revoked
invitation.

## Invitation states

| Status | Meaning |
|---|---|
| `AUTHORIZED` | Local intent and audit persisted; provider not yet accepted |
| `SENT` | Provider accepted the create/retry request. This is not email delivery |
| `FAILED` | Provider returned an error |
| `UNKNOWN` | Provider timed out or the result is ambiguous |
| `REVOKED` | Local acceptance denied immediately |
| `ACCEPTED` | Consumed after a valid explicit accept |
| `EXPIRED` | Past `expiresAt` when acceptance was attempted |

Active rows keep `activeEmailKey = emailNormalized`. Terminal rows clear
it so the unique `(organizationId, activeEmailKey)` constraint allows a
later invite to the same address.

## Authorization and identity

- Create, retry, and revoke recheck an active `UserAccount` and an
  active `ORG_ADMIN` membership in the current church. `canEdit` is
  visibility only.
- Invite roles are `ORG_ADMIN`, `TREASURER`, `DATA_ENTRY`, and
  `REPORT_VIEWER`. Donor invites are rejected.
- Existing memberships are never overwritten or reactivated by an
  invitation. Use the existing Staff Access membership controls.
- Email is trimmed and lowercased only. Gmail-dot or plus aliases are
  not invented.
- Acceptance requires all of: signed-in account, verified email matching
  the invitation, active BITS church with the recorded Clerk mapping,
  pending unexpired local intent, inviter still a usable admin or an
  explicit current-admin reapproval, and provider organization
  membership evidence.
- Disabled `UserAccount` rows and pre-existing inactive memberships are
  rejected.
- Church B memberships are left untouched when church A is accepted.

Lock order is organization-first, compatible with Core 09:

1. Organization `FOR UPDATE`
2. Actor membership `FOR UPDATE` on admin mutations
3. Invitation `FOR UPDATE` when an existing intent is changed

Accept uses organization then invitation. Provider HTTP is never done
while those locks are held. Audit failure rolls back the local
authorization change.

## Delivery failures

The database transaction and Clerk request are not atomic. Intent is
persisted before the network call. A failed or timed-out provider
request is stored as `FAILED` or `UNKNOWN`, never `SENT`. Retry
claims the submitted version before provider work. A known provider invitation is reconciled; an accepted or pending provider invitation is not resent. Missing provider references or inconclusive lookup results block another send and require operator reconciliation. This is a safety stop, not a completed automated reconciliation workflow.
Revoke denies local acceptance first; remote cancel failure is recorded
for later retry.

No reusable plaintext acceptance secret is stored. Redirect URLs come
only from `BITS_STAFF_INVITATION_REDIRECT_ORIGIN` or `APP_BASE_URL`.

## Provider configuration

| Variable | Purpose |
|---|---|
| `BITS_STAFF_INVITATION_PROVIDER` | `mock` (default) or `clerk` |
| `BITS_STAFF_INVITATION_REDIRECT_ORIGIN` | Fixed accept origin |
| `APP_BASE_URL` | Fallback origin |
| `BITS_STAFF_INVITATION_ALLOW_LIVE` | Must be `1` for real Clerk sends |
| `BITS_STAFF_INVITATION_ALLOWED_EMAILS` | Fictional live-recipient allowlist |
| `CLERK_SECRET_KEY` | Test `sk_test_` only for live sends |
| `BITS_STAFF_BOOTSTRAP_APPLY` | Required with `--apply` for first-admin |

Default runtime uses the mock provider and does not create Clerk users,
organizations, or invitations.

## Migration status

Checked-in additive migration:
`20261014180000_add_staff_invitations`.

- Isolated apply: `npm run staff:invitation-schema-setup` against
  dedicated `bits_e2e` only, after the membership-version schema is
  ready.
- Working-app apply is a **separate explicit step**:
  `npm run staff:invitation-local-migrate` inspects every checked-in
  pending migration and unresolved `_prisma_migrations` history, then
  refuses any target that is not loopback `bits` with exactly this
  pending migration. The October 14 follow-up applied it to local `bits`
  after a full custom-format pg_dump backup.
- Tests must not `ALTER TABLE`.
- Local `bits` now has the invitation table (zero rows). Staff Access
  still shows a schema notice if a database is missing the table.

## First-administrator procedure

`npm run staff:first-admin-bootstrap -- --organization-id=<uuid> --clerk-user-id=user_... --approval-note='...'`

Default is read-only dry-run. Apply also requires
`BITS_STAFF_BOOTSTRAP_APPLY=1` and `--apply`. Implementing the tool does
not authorize a grant. The tool requires the exact church id and Clerk
user id, a mapped Clerk organization relationship, no usable admin, and
no existing inactive membership. It does not use oldest/lone church,
email domain, development environment, or Clerk org selection as
authorization. No production or working-app grant was run for this
increment.

The earlier first-organization create path in organization settings is
unchanged and is not this operator tool.

## Runbook

1. Confirm Staff Access membership-version schema is ready.
2. Apply invitation storage only to the intended isolated or reviewed
   local target.
3. Keep `BITS_STAFF_INVITATION_PROVIDER=mock` unless fictional live
   recipients are explicitly authorized.
4. An administrator invites from Staff Access and confirms the
   recipient, church, and role.
5. The recipient signs in and accepts at `/staff-invitations/accept`.
6. Protected staff routes still fail closed until that accept succeeds.

## Tests

Mocked unit coverage includes role/tenant denial, email verification and
identity mismatch, forged invitation ids, wrong org, duplicate invites,
revoked inviter reapproval, expiration, revoke-before-grant, repeated
accept, existing/inactive membership preservation, disabled accounts,
role tampering via schema, audit rollback, provider timeout/failure,
resend reconciliation, and first-admin dry-run denials.

Isolated `bits_e2e` concurrency coverage is real SQL serialization and is
reported separately from mocked tests. Live Clerk two-church acceptance
remains blocked on configured identities. No real invitation was sent
while implementing this increment.

## Remaining

Live two-church Clerk execution, live object-storage/recovery, broader
ledger checks, household locking, and deployment readiness remain
visible. Staff invitation code completion is not original v1 completion.


## Independent review and local migration follow-up — October 14, 2026

- Restricted invitation preview details to the verified recipient and active matching church; malformed IDs fail closed.
- First-admin setup now requires a matching active provider identity with at least one verified email. No first-admin grant was executed.
- Acceptance checks provider evidence identity and organization. A failed invitation-consumption predicate throws so membership creation rolls back.
- Retry claims the version before provider work. Unknown delivery without a provider reference and inconclusive lookup results cannot send another email. Operator reconciliation is still needed for unknown delivery; do not advertise automatic resolution.
- Corrected the local migration command to inspect ALL checked-in pending migrations and unresolved migration history before calling migrate deploy.
- Local `bits`: invitation migration applied; both pre-existing membership rows unchanged; invitation table empty.
- Full local database backup: `e2e/.local/backups/bits-core10-before-invitations.dump` (gitignored, restrictive file permissions). pg_restore archive inventory verified. This is not a completed restore rehearsal or cluster backup.
- Retry no longer creates a replacement provider invitation when lookup returns `not_found`, error, timeout, revoked, or expired. Unknown outcomes stay `UNKNOWN` until an operator reconciles them.
- Fresh unit suite after this review: 219 files / 1,625 tests passed. Lint, typecheck, production build and git diff --check passed. Unsigned Staff Access and invitation-acceptance 307 checks are not authenticated acceptance.
- Live recipient testing remains pending: no authorized fictional recipient was supplied, and the two Clerk organization IDs and seven acceptance identities remain unset. No email, remote user/org, or bootstrap grant was created. Use isolated `bits_e2e` and the established harness; do not manufacture acceptance evidence on the working church.

The working database is schema-ready, not signed-in accepted. Original v1 remains incomplete.

## Readiness check — October 14, 2026

Bounded source review and local automated/runtime check. No new blocker was found in the reviewed invitation repairs. Continue original-roadmap development. Do not mark invitations live-accepted or approve production use.

Fresh results: 219 files / 1,625 tests passed, including configured isolated-database membership/invitation concurrency. Lint, TypeScript, `git diff --check`, and production build passed. Prisma validation passed with the existing SetNull/required-field warning. Read-only local `bits` had zero pending or unresolved migrations; both membership rows matched the pre-invitation snapshot; `staff_invitations` had zero rows. A temporary production-mode local server returned 307 for unsigned Staff Access and invitation-acceptance routes and was stopped afterward.

No application source was changed, no migration reapplied, no invitations sent, and no administrator grants made during this check. Original v1 remains incomplete.
