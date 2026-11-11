# Railway TEST configuration

`.railway/railway.ts` is the desired graph for project `bits-test`,
environment `test`. It is not linked or applied.

`@railway/cli` 5.71.0 loads this file. `npm run railway:check` is the local
validation. `railway config plan` is the remote plan. The remote plan needs
the project and the `test` environment to exist. The app service and
database stay uncreated until an approved apply.

`.railway/package.json` marks this directory as a module so the CLI receives
the configuration function. `variables.ignore` contains `bits/APP_BASE_URL`:
the first create does not send that variable, and a later plan does not
delete it.

`npm run railway:shared-check` reads the linked environment and stops when
either Clerk shared value is missing or empty. It writes
`.railway/.shared-check.json` with names only. That file is gitignored. A
plan or apply without it stops.

No repository source is declared, so this graph does not deploy. Migrations
stay in `npm run db:migrate`. The full sequence is in
`docs/original-v1-railway-test-setup.md`.
