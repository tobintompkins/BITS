# Original Core 12 / 12A household concurrency — October 19, 2026

Status: the nine Core 12 concurrency requirements are verified on isolated `bits_e2e` through production giving-household writers. Live signed-in Playwright acceptance is still pending configured Clerk identities. Existing `Household` / `HouseholdMembership` models are retained. Member `/households` is unchanged. Original v1 remains incomplete.

Authentication in these tests is mocked at the service boundary. That is not live Clerk acceptance.

## Coordination

`runWithObservedLockContention` uses two Prisma clients plus a third observer. Writer A records `pg_backend_pid()` inside its transaction, acquires household-then-donor `FOR UPDATE` locks, and holds. Writer B then starts and records its in-transaction PID. The observer waits until `pg_blocking_pids(B)` contains A before A is released. A 40 ms sleep or a promise-start signal is not used. If those locks were removed, the wait times out and the test fails. Barriers and audit-failure flags live in an async-local test context so a later control write cannot consume them. Transaction timeout is 20 seconds. Every waiter is bounded and both operations are reaped in `finally`.

These tests serialize participating writers only. They do not claim global deadlock freedom or lifecycle/role-revocation serialization.

## Per-scenario results

| Scenario | Sessions and barrier | Ordering | Final state / audits / cleanup | Result | Limits |
|---|---|---|---|---|---|
| Competing links of one unassigned donor | Two Prisma sessions; A holds after locks; B observed blocked | Link A then link B | One open membership; loser rejected (open-row or overlap); exactly one `GIVING_HOUSEHOLD_MEMBER_LINKED` | Passed on `bits_e2e` | Mocked Clerk |
| Competing moves from one membership | Same barrier | Move to target A then target B | Source closed D-1; one open dest starting D; exactly one `GIVING_HOUSEHOLD_MEMBER_MOVED` | Passed | Mocked Clerk |
| Move versus end | Same barrier, both orders | Move then end; end then move | Winner only; source contacts cleared; one `MOVED` then one `ENDED` | Passed | Mocked Clerk |
| Settings/contact versus move | Same barrier, both orders | Settings then move; move then settings | Moved donor is never an ineligible contact; settings-then-move both succeed; move-then-settings rejects stale/ineligible contact | Passed | Mocked Clerk |
| DATA_ENTRY basic save versus move/end | Same barrier | Basic save then move; move then basic; end then basic | Contacts stay cleared; DATA_ENTRY does not write financial fields | Passed | Mocked Clerk |
| Same-millisecond settings `updatedAt` | Scoped clock frozen to one ms | Two accepted saves, then stale `expectedUpdatedAt` | Timestamps strictly increase by `previous+1`; stale save rejects without a third audit | Passed | Clock injected only for `nextHouseholdVersion` |
| Opposite-direction moves | Same lock-wait barrier | A→B held, then B→A | Both succeed after observed wait; two `MOVED` audits | Passed | Not a global deadlock proof |
| Target deactivation versus link/move | Same barrier; target starts active | Deactivate then move; reactivate; deactivate then link; reverse move then deactivate | Competing link/move reject inactive target; reverse keeps the completed membership on the now-inactive household | Passed | No new rule against historical rows in inactive households |
| Overlapping versus adjacent backdated links | Same donor-lock barrier | Adjacent Jul 1 then overlap Jun 15; reverse | Overlap rejected by production `linkGivingHouseholdDonor`; adjacent accepted; two `LINKED` audits | Passed | No public closed-interval writer; closed history is fixture data, overlap is proven through link |
| Audit-failure rollback | Scoped `failAudit` after mutations, before commit | Link, move, end, settings each fail then succeed | Memberships, contacts, timestamps and audits match the pre-action snapshot; the following control write succeeds | Passed | Test seam only; no public fault endpoint |
| Cross-tenant / unauthorized | Sequential denials | Church B vs A, report viewer, donor, signed-out | No memberships or audits; signed-out message is exactly `Sign in to access giving households.` | Passed | Authorization before locks; concurrent role revocation is not serialized |
| D-1 / D attribution | Sequential move, then synthetic gifts | Move on D | D-1 attributes to old household; D to new. No statement storage writes | Passed | Synthetic donations only |
| Schema readiness | Read-only `pg_catalog` + `_prisma_migrations` | n/a | Unique, valid/ready index on public `household_memberships` (`organizationId`, `donorId`) where `endDate IS NULL`, with matching history | Passed | Tests do not ALTER TABLE |
| Fixture cleanup | Owned churches deleted after the suite | n/a | Owned orgs gone; unrelated isolated control org remained until explicit suite teardown | Passed | Not a full-database backup |

The unique open-row index is not interval-overlap proof. Overlap is rejected in the service after locks.

## Working-database fingerprints

Unchanged across the isolated run (not a complete database comparison):

- 336 audits, 24 events, 0 attendance actions, 2 memberships, 4 donations totaling 187.00, 0 batches, 0 households, 0 household memberships
- `audit_fp=0273d9542ea9ed36203f7745d03eb18b`
- `event_fp=02707b64498da9553ed5537d8b247e78`
- `membership_fp=2ac1c16d89d392d286f38ef92452461c`
- `donation_fp=58bdf9184a35c1bd7ff79b0b84833021`
- `batch_fp=d41d8cd98f00b204e9800998ecf8427e`
- `household_fp=d41d8cd98f00b204e9800998ecf8427e`
- `household_membership_fp=d41d8cd98f00b204e9800998ecf8427e`

Eight earlier working check-in audits remain. They were not deleted.

## Still open

Live Clerk two-church browser acceptance, including the Playwright stale-form case; invitation send/accept; live storage/restore; administrative CARD/ACH; formal locked-ledger adjustments; deployment readiness. Original v1 is not complete.
