# Original v1 — local synthetic database recovery (Core 20)

November 4, 2026. Git HEAD `7787b2f`, plus uncommitted Core 18–20 work.
This records one local PostgreSQL logical backup and restore of fictional
rows. It does not certify production backups, and original version 1 remains
incomplete.

## What was rehearsed

`npm run recovery:local-database` is dry-run by default. `--apply` is allowed
to create only these two new databases:

- `bits_e2e_recovery_<runId>_source`
- `bits_e2e_recovery_<runId>_restored`

The command requires an explicit loopback host, port, username, and
maintenance database `postgres`. It refuses raw URLs, `hostaddr`, service
files, libpq `options`, Unix sockets, multi-host targets, `bits`,
`bits_e2e`, `template0`, `template1`, and an existing rehearsal name. Passwords
stay in `BITS_RECOVERY_PASSWORD` and in the child environment. They are not
command arguments and are not written to the manifest. `pg_restore` uses
`--exit-on-error` and `--single-transaction`, without `--clean` or `--create`.

Checked-in Prisma migrations were applied to the new source. The global seed
was not used. The fixture is two fictional churches, the five original roles,
two memberships, an accountless donor, a giving household with an ended
membership and one open membership, an offering type, a draft batch at
review version 4, a cash gift split `4.10 + 6.20 = 10.30`, an audit row, and
one create-idempotency row.

## Evidence from the apply

Postgres.app client tools are `pg_dump` and `pg_restore` 18.6. The local
cluster was stopped; this rehearsal started it, used loopback port 5432, and
stopped it afterward. Server version `18.6 (Postgres.app)`. No package was
installed.

| Item | Result |
|---|---|
| Source | `bits_e2e_recovery_2026110502432060350d59_source` |
| Restored | `bits_e2e_recovery_2026110502432060350d59_restored` |
| Dump | 390,300 bytes, SHA-256 `8fdfcdb23c31472f2f5538e023c2d4f8fac70b278c40212447fe1c885070aa9e` |
| Restore exit | 0 |
| Snapshot | Match, including migration names, the open-household and idempotency index definitions, foreign keys, Decimal totals, household dates, audit, and idempotency links |
| Constraint probes | Second open household membership `23505`; duplicate idempotency token `23505`; missing offering type `23503`. Each probe was rolled back |
| Archive | `e2e/.local/database-recovery/2026110502432060350d59/` mode 0700; dump and manifest mode 0600 |

An earlier attempt the same night refused the session before creating a
database because `inet_server_addr()` includes a network mask. That check now
accepts `127.0.0.1/32`. No database was created for that attempt.

Safety tests in `lib/ops/local-database-recovery.test.ts`: 5 passed. Lint
passed for the new command. `tsc --noEmit` passed. `git diff --check` passed
for the tracked edits. `npm test` was not pointed at a database.

## Cleanup still waiting for review

Leave these databases until a later reviewed cleanup. Do not drop by prefix
and do not drop `bits` or `bits_e2e`:

- `bits_e2e_recovery_2026110502432060350d59_source`
- `bits_e2e_recovery_2026110502432060350d59_restored`

The dump remains in the gitignored folder above.

## What this does not prove

Production backup scheduling, permissions and roles outside this archive,
point-in-time recovery, writes that happen after a backup, provider failure,
and statement-PDF recovery are still open. The backup-readiness page was not
changed and is still not a backup. Live Clerk, invitation send/accept, and
Railway remain open. No application connection string was replaced.
