# Original v1 live acceptance — local Clerk setup

October 23, 2026. Isolated `bits_e2e`, the target token, and local PDF storage
already exist. Live Playwright is blocked until two Clerk Development
organizations and seven fictional users are written into gitignored
`e2e/.local/acceptance.env`. Do not put those values in chat, Git, or tracker
docs. Do not invent emails as if the accounts already exist.

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
