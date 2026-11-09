# Original v1 development fixtures

These rows are the fictional section 17 dataset. They are opt-in. `npm run db:seed`, migrations, application startup, and the unit tests do not load them.

The default seed remains Demo Community Church and its member and event rows.

## Dry run

This prints the inventory and does not connect to a database or write files:

```bash
npx tsx prisma/seed.ts --original-v1-fixtures
```

The same dry run is available as `npm run fixtures:original-v1`.

## Apply

Apply is a separate command. It writes only when loopback Postgres is already running and the isolated database is exactly `bits_e2e`, is not the working `bits` database, and already has the application schema. The command does not start Postgres, migrate, reset, create, or drop a database.

```bash
npx tsx prisma/seed.ts --original-v1-fixtures --apply
```

`npm run fixtures:original-v1 -- --apply` is the same command.

Core 26 reviewed the dry run and did not run the apply. Core 26A then ran the integration-namespace SQL test on loopback `bits_e2e`: 1 file / 2 passed. That run created and removed only its own integration rows. It did not apply the Grace Community Church set. Working-database fingerprints were unchanged. Postgres.app 18 was started for the check and left running.

## What the persistent set contains

- Grace Community Church, slug `original-v1-grace-community`, fictional EIN `00-0000000`, and a fictional Example, TN address.
- Local identifiers for an organization administrator, treasurer, data entry, report viewer, and portal donor. These identifiers do not create a Clerk user, send an invitation, or sign anyone in.
- Smith Household, with Pat Smith and Alex Smith sharing one address.
- Jordan Taylor linked to the local portal identifier. Morgan Lee has no account. Riley Quinn is inactive.
- Offering types General Fund, Building Fund, Missions, and Benevolence.
- One draft weekly batch recorded at `0.00`.
- One locked historic batch recorded at `100.00`: an identified check for `25.00`, one split envelope gift with General Fund `10.00` and Missions `15.00`, and an anonymous cash gift for `50.00`.
- Two `GENERATED` statement rows and local synthetic PDF placeholders. The files say they are not tax statements. They are not durable-storage proof and they are not a provider restore.

A second successful apply does not insert another church, account, donor, gift, allocation, or statement. If an owned row has been edited, the command reports the conflict and does not reset it. A pre-existing church with the same name, slug, or email, or a pre-existing account with the same email or local identifier, stops the apply.

The integration test uses a different church name and different ids. It is not this persistent set.

## What this does not finish

The fixture command does not finish live Clerk sign-in, invitation delivery, durable statement recovery, signed-in use, or a Railway launch. Railway is the chosen host. The missing storage item is a provisioned isolated TEST object-storage target. This command does not create or purchase that resource.
