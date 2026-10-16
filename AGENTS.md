<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

The Cloud Agent environment contains three repositories under `/agent/repos`: `BITS` (this app), `Matrix`, and `Matrix-parts-hub`. Startup brings up local PostgreSQL, applies BITS migrations, runs `npm run db:seed`, syncs the Matrix SQLite schema, and serves the apps.

- BITS: http://localhost:3000 and http://127.0.0.1:3000. Local database URL: `postgresql://bits:bits@127.0.0.1:5432/bits?schema=public`. That database is only the local cluster. Do not point it at a hosted church database.
- Matrix: http://localhost:3001. SQLite file `dev.db` in the Matrix repo. Checked-in migrations contain PostgreSQL-only SQL, so local setup uses `npx prisma db push` rather than `prisma migrate deploy`.
- Matrix Parts Hub: http://127.0.0.1:5000. Development sign-in is the demonstration identities at `/demo`. Run tests with `python -m pytest` from that repo's virtualenv (`.venv`).
- BITS checks: `npm test`, `npx tsc --noEmit`, and `npm run lint`.
- Clerk keys are optional for local development. Both Next apps run in Clerk keyless mode until real keys are present. Public BITS pages, including the prayer wall, work without them.
