# Original v1 — Staff membership administration (Core 09)

October 14, 2026. This increment extends the existing
`/administration/staff-access` directory so an active organization
administrator can change another existing original-role staff membership.
It does not invite staff, create Clerk users, provision the first
administrator, or mark original version 1 complete.

## Workflow

1. An authorized administrator opens Staff Access.
2. Name/email search, active/inactive filter, and pages of 25 rows list
   current-church memberships. Donor memberships stay off this directory.
3. Each manageable row shows the current role/status, the intended
   role/status, and a confirmation checkbox before save.
4. The server resolves the church and actor from the signed-in session
   (active Clerk org, or exactly one active BITS membership). Client
   church, actor, role, and `canEdit` claims are ignored.
5. A successful change writes role/status and an audit event in one
   transaction. A no-op save writes no audit.

Invitations, new account linking, and first-administrator bootstrap remain
incomplete. A church without an authorized administrator cannot be
repaired from this page.

## Access policy

- Directory visibility is unchanged: `getOrganizationAccess().canEdit`
  (organization administrator or Clerk super-admin metadata).
- Mutations are never authorized by `canEdit`. Every write rechecks an
  active `UserAccount`, an active `ORG_ADMIN` membership in the current
  church, and an original staff target role.
- Treasurer, data-entry, report-viewer, donor, signed-out, inactive actor
  accounts, and ambiguous tenants are denied.
- Super-admin metadata may still view the directory and receives
  read-only controls.
- Self-demotion and self-deactivation are rejected. Another authorized
  administrator may make those changes.
- The last usable administrator (active `ORG_ADMIN` membership whose
  user account is also active) cannot be removed.
- Reactivation requires an active underlying user account.
- Donor memberships and later custom/expanded roles are visible when they
  are not donor rows; unsupported roles explain that they cannot be
  changed here. Donor rows remain excluded by the existing staff-directory
  policy.
- Cross-tenant targets fail as not found and do not reveal the other
  church.

Login still does not create memberships (Core 07A). This page does not
add a bootstrap bypass.

## Concurrency

Lock order, acquired inside one transaction:

1. Organization row `FOR UPDATE`
2. Actor membership `FOR UPDATE`
3. Target membership `FOR UPDATE` when it is a different row

Actor authorization is rechecked after those locks. Competing demotions
in the same church are serialized by the organization lock. Updates use
`id + organizationId + version + updatedAt` and increment `version` so
same-millisecond saves still conflict instead of last-writer-wins.

This endpoint does not serialize `UserAccount.active` flips,
`Organization.active` flips, seed/fixture writes, or first-organization
bootstrap. Those remain uncovered concurrency paths. The last-admin rule
is enforced here; it is not a global database invariant.

An additive `organization_memberships.version` column is required.
`20261014130000_add_organization_membership_version` is the checked-in
Prisma migration. Ordinary unit/concurrency tests must not ALTER TABLE.
Isolated setup is `npm run staff:membership-schema-setup`. Local working
`bits` migrate is `npm run staff:membership-local-migrate` and refuses
any target that is not loopback `bits` with exactly this pending
migration. Production is unchanged.

## Revocation

There is no application permission cache. After deactivation or demotion,
the next protected server request re-reads active memberships and denies
the actor. Hiding navigation is not enforcement. Clerk sessions are not
revoked globally. Changing church A does not change the same user's
church B membership.

## Limitations

- No invitations, email, Clerk user creation, or Clerk role changes.
- No new BITS memberships and no automatic admin grants.
- No donor/account-linking edits and no financial data changes.
- Live Clerk two-tenant acceptance remains blocked on identities.
- Live object-store probe/restore, broader ledger acceptance, household
  locking, and deployment readiness remain separate gaps.
- Original version 1 is not complete.

## Verification (October 14, 2026)

Worktree: HEAD `1fef2d0` plus uncommitted Core 02–09 and earlier local
work. No commit was created for this increment. The additive
`organization_memberships.version` migration was created and applied only
to isolated `bits_e2e` for the concurrency test, not to production.

| Check | Result |
|---|---|
| Focused staff directory/admin/action tests | Passed |
| Isolated `bits_e2e` competing-admin serialization | Passed |
| `npx tsc --noEmit` | Passed |
| `npm run lint` | Passed |
| `git diff --check` | Passed |
| `npm run build` | Passed (existing middleware-to-proxy and member-document NFT warnings) |
| Full `npx vitest run` | 210 files / 1,572 tests passed, 1 skipped |
| `npm run test:e2e:acceptance` | Unchanged blocker: Clerk development organizations and seven fictional identities are not configured |

The skipped unit is the fallback assertion used when an isolated database
is absent; it was skipped because the real two-session `bits_e2e` test
ran. Playwright Staff Access cases were added to the existing harness and
were not executed live. Original version 1 is not complete.

## Core 09A review (October 14, 2026)

Server-side enforcement was reviewed and left in place: active account
plus active `ORG_ADMIN`, session church or exactly-one-membership
fallback, same-church targets, no client actor/tenant trust, no
login-time membership provisioning, no donor/custom-role mutation,
inactive-account reactivation denial, self-demotion denial, usable
last-admin protection, version/`updatedAt` predicates, no-op without
audit, and audit rollback. Actor authorization is rechecked after the
organization-then-actor-then-target locks. Church B is not updated when
church A changes. Lifecycle flips that do not take these locks are still
not globally serialized.

Confirmed repair: tests no longer issue `ALTER TABLE`. Schema readiness
is classified separately as ready, pending, column-without-history drift,
or incompatible. A passing fallback assertion is no longer counted as a
concurrency result.

### Actual database state after this follow-up

| Target | Host | Migration record | Column | Notes |
|---|---|---|---|---|
| Working `bits` | loopback:5432 | Applied | `INTEGER NOT NULL DEFAULT 1` | 2 pre-existing memberships unchanged, versions `1` |
| Isolated `bits_e2e` | loopback:5432 | Applied after explicit reconcile | Already present from Core 09 test DDL | Not the working database |

`pg_dump` / `psql` were not on PATH. The recoverable snapshot is
`e2e/.local/backups/bits-2026-10-14-staff-membership-version.json`
(gitignored; 2 membership rows; readable JSON). That is not a full
cluster dump.

Unsigned `GET /administration/staff-access` on a local production server
returned 307 to `/sign-in`, not a missing-column 500. Schema-ready is
not signed-in acceptance.

| Check | Result |
|---|---|
| Focused staff directory/admin/action/schema tests | Passed |
| Isolated `bits_e2e` two-session serialization | Ran and passed after history was ready |
| `npx tsc --noEmit` | Passed |
| `npm run lint` | Passed |
| `git diff --check` | Passed |
| `npx prisma validate` | Passed, with the existing SetNull/required-field relation warning |
| `npm run build` | Passed (existing middleware-to-proxy and member-document NFT warnings) |
| Full `npx vitest run` | 211 files / 1,577 tests passed |
| `npm run test:e2e:acceptance` | Unchanged blocker on Clerk identities |

Original version 1 is not complete. Next feature gap remains authorized
staff invitations/onboarding. Live Clerk, live storage/restore, broader
ledger, household locking, and launch verification remain separate.
