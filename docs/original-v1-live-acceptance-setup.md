# Original v1 live acceptance — local Clerk setup

October 23, 2026. Isolated `bits_e2e`, the target token, and local PDF storage
already exist. Live Playwright is blocked until two Clerk Development
organizations and seven fictional users are written into gitignored
`e2e/.local/acceptance.env`. Do not put those values in chat, Git, or tracker
docs. Do not invent emails as if the accounts already exist.

## Core 28 (November 5, 2026)

Readiness was checked again. `e2e/.local/acceptance.env` is present and
ignored by `/e2e/.local/`. The target token file and
`e2e/.local/statement-storage` are present. `BITS_E2E_DATABASE_URL` is
loopback `bits_e2e`, and the fixture tables are already there. No migration,
reset, seed, or persistent Grace apply was run. The acceptance server was
not started. `npm run test:e2e:acceptance:preflight` exited 2:
`readyForFixtures=false`, `readyForLiveAcceptance=false`, missing the two
organization IDs and seven emails, and `server_unreachable` because that
dedicated server is not running. Development `sk_test_` and `pk_test_` keys
are present. No live Playwright case ran.

A read-only Clerk call returned
`organization_not_enabled_in_instance`. Organizations are disabled on this
Development instance. The instance already has one user. That account was
not inspected and is not treated as one of the seven acceptance identities.
This workspace did not enable Organizations, create users, or send mail.

Railway deployment, the `bits-statements-test` bucket, and live storage
recovery are deferred by the owner. They were not resumed.

### Owner checklist

Use the Development instance that already holds the `sk_test_` / `pk_test_`
keys. Switch to it with the instance dropdown
([Instances](https://clerk.com/docs/guides/development/managing-environments)).
Do not use Production.

1. In the Clerk Dashboard, open Organization settings and select Enable
   Organizations
   ([Configure Organizations](https://clerk.com/docs/guides/organizations/configure)).
   Choose Membership optional. Leave Create first organization automatically
   off. Do not enable the B2B Authentication add-on. Free plans include up
   to 50 monthly retained organizations in development
   ([Organizations](https://clerk.com/docs/guides/organizations/overview)).
2. On the Organizations page, select Create Organization twice
   ([Create and manage Organizations](https://clerk.com/docs/guides/organizations/create-and-manage)).
   Use two fictional church names. Copy each organization ID into
   `E2E_CLERK_ORG_A_ID` and `E2E_CLERK_ORG_B_ID`.
3. The default membership limit is 5. Church A needs 7 members. Raise that
   organization's membership limit to at least 7. The documented cap without
   the B2B add-on is 20. Church B needs one member.
4. On the Users page, select Create user seven times
   ([Users](https://clerk.com/docs/guides/users/managing)). Use seven
   distinct fictional email addresses. Do not reuse the existing Development
   user unless you decide that account is one of these identities. The
   harness signs in with `@clerk/testing` by that email.
5. Add the already-created users to the organizations without sending an
   invitation email. Clerk's invitation flow sends mail
   ([Invite users](https://clerk.com/docs/guides/organizations/add-members)).
   The no-email path is `createOrganizationMembership()` for an existing
   user. Clerk membership can stay the default member role. BITS roles are
   assigned later by `e2e/acceptance/fixtures/prepare.ts`.

| Env name | Clerk membership | BITS role, assigned by the fixture runner |
|---|---|---|
| `E2E_CLERK_ORG_ADMIN_EMAIL` | A only | `ORG_ADMIN` |
| `E2E_CLERK_TREASURER_EMAIL` | A only | `TREASURER` |
| `E2E_CLERK_DATA_ENTRY_EMAIL` | A only | `DATA_ENTRY` |
| `E2E_CLERK_REPORT_VIEWER_EMAIL` | A only | `REPORT_VIEWER` |
| `E2E_CLERK_DONOR_A1_EMAIL` | A only | `DONOR` |
| `E2E_CLERK_DONOR_A2_EMAIL` | A only | `DONOR` |
| `E2E_CLERK_MULTI_ORG_EMAIL` | A and B | `ORG_ADMIN` in both |

Write only those names into `e2e/.local/acceptance.env`. Do not commit the
file and do not paste the values into chat. This package cannot create the
identities for you, and no live pass is claimed.

Core 28A on November 9, 2026 added the Giving Audit and Organization Settings
cases to this same harness. `playwright test -c playwright.acceptance.config.ts --list`
listed 33 tests in 10 files and did not run setup or any case. The nine
identity names were still absent, so the live command was not started.

BITS financial roles are assigned by `e2e/acceptance/fixtures/prepare.ts`.
Do not create matching Clerk dashboard roles.

## Add these names to `e2e/.local/acceptance.env`

| Name | Membership |
|---|---|
| `E2E_CLERK_ORG_A_ID` | First fictional Clerk Development church |
| `E2E_CLERK_ORG_B_ID` | Second fictional Clerk Development church |
| `E2E_CLERK_ORG_ADMIN_EMAIL` | Member of A only |
| `E2E_CLERK_TREASURER_EMAIL` | Member of A only |
| `E2E_CLERK_DATA_ENTRY_EMAIL` | Member of A only |
| `E2E_CLERK_REPORT_VIEWER_EMAIL` | Member of A only |
| `E2E_CLERK_DONOR_A1_EMAIL` | Member of A only |
| `E2E_CLERK_DONOR_A2_EMAIL` | Member of A only |
| `E2E_CLERK_MULTI_ORG_EMAIL` | Member of A and B |

Each email must be distinct. The two organization IDs must be distinct.
Use the same development instance as the existing `sk_test_` / `pk_test_`
keys. Leave `BITS_E2E_*`, `PLAYWRIGHT_BASE_URL`, and storage keys already
written by setup as they are.

## Next commands after the file is saved

```bash
npm run test:e2e:acceptance:preflight
npm run test:e2e:acceptance:server
```

The server picks a free loopback port (default `http://127.0.0.1:3017`) and
does not stop a working `next dev` on 3000. Record the printed URL. Then:

```bash
npm run test:e2e:acceptance:preflight
npm run test:e2e:acceptance
```

Preflight and Playwright fail closed. Missing identities are a blocker, not
a skip-pass. Do not recreate, reset, or copy working `bits`. Do not send
invitation emails or create remote users from this chat.
