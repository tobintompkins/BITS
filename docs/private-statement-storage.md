# Private statement PDF storage — October 14, 2026

Original scope: FR-STMT-004 and the operations/storage requirement for
durable private statement artifacts. The original May specification is
unchanged.

This increment adds a server-only storage boundary with local and
S3-compatible backends behind the existing generation, publish, staff and
member PDF routes. It does not add a second generator, public document
library, or bucket. Adapter tests are not proof that production storage is
configured, that originals were migrated, or that restore works.

## Artifact identity

`ContributionStatement.pdfStorageKey` is the durable reference:

- Local legacy: `private/statements/{organizationId}/{statementId}/{file}.pdf`
- Remote: `s3v1:private/statements/{organizationId}/{statementId}/{file}.pdf`

Reads dispatch on that identity. Switching `BITS_STATEMENT_PDF_BACKEND` does
not reinterpret an existing local key as an object-store key. HTTP or
presigned URLs are rejected. Unknown prefixes are rejected. Remote
read/write failures never fall back to the local filesystem.

## New-write backend

- Development default: `local`
- Production: `BITS_STATEMENT_PDF_BACKEND=s3` is required unless
  `BITS_STATEMENT_ALLOW_LOCAL_PRODUCTION=1` is set on purpose
- S3 writes require `BITS_STATEMENT_S3_BUCKET` and `BITS_STATEMENT_S3_REGION`
- Optional: `BITS_STATEMENT_S3_ENDPOINT`, `BITS_STATEMENT_S3_FORCE_PATH_STYLE`,
  `BITS_STATEMENT_S3_PREFIX`
- Endpoints must be HTTPS unless `BITS_STATEMENT_S3_ALLOW_INSECURE_HTTP=1`
  for a local test service
- Credentials use ambient AWS identity or `AWS_ACCESS_KEY_ID` /
  `AWS_SECRET_ACCESS_KEY`. Never `NEXT_PUBLIC_*`.

Provider assumption: the bucket supports conditional `PutObject` with
`If-None-Match: *`. If a provider overwrites without that precondition, do
not use it. Do not treat object-store ETags as SHA-256. Content type is
`application/pdf`. No public-read ACL is set.

## Integrity and cleanup

PDFs are bounded to 15 MiB and must start with `%PDF-`. SHA-256 is computed
over the exact bytes and stored in `pdfChecksum`. Authorized downloads
verify the checksum before success or an access event. Missing or corrupt
objects return unavailable; they do not mint a replacement statement.

Generation still writes the artifact before the database row. Compensating
cleanup now re-reads the statement row and deletes only when that exact
reference is unreferenced. A possible committed row is retained as an
orphan for later reconciliation. Voiding does not erase bytes. Reissues
create new identifiers.

## Local development

Leave `BITS_STATEMENT_PDF_BACKEND` unset. Files stay under
`{BITS_FILE_STORAGE_ROOT|cwd}/storage/private/statements/...`, which Next.js
does not serve. Existing staff and portal PDF routes are unchanged.

## S3-compatible setup

1. Create a private bucket. Block public access. Require TLS.
2. Grant the app least privilege: `s3:PutObject`, `s3:GetObject`,
   `s3:DeleteObject` on `private/statements/*` only. Do not grant
   `s3:ListBucket` to application roles unless inventory is run separately
   with a break-glass identity.
3. Enable versioning as a planning control. Versioning is not a tested
   backup or recovery procedure.
4. Set the `BITS_STATEMENT_*` variables on the server. Run
   `npm run statements:storage-diagnostics` (no secrets printed).
5. Designate an isolated test target (`BITS_STATEMENT_S3_TEST_TARGET=1` and
   `BITS_STATEMENT_S3_TEST_BUCKET`, never the application bucket). Default
   `npm run statements:storage-probe` is read-only. `--apply` writes a
   reserved non-donor key, proves conditional create, rejects overwrite,
   verifies SHA-256, checks one unsigned object URL, and verifies the exact
   key is absent after delete. `cleanedUp` is true only after that inspect.
   AccessDenied or timeout is unknown, not absence.
6. `npm run statements:storage-restore -- --apply` is a separate synthetic
   restore rehearsal. See `docs/statement-storage-recovery.md`.

## Inventory and later migration

`npm run statements:storage-inventory` is read-only. It reports local
artifacts, missing files, checksum mismatches and target-key collisions.
`--apply` is refused. A later explicitly approved copy-and-verify
migration must: copy without overwrite, verify exact bytes/hash, update
only the expected statement reference with an optimistic predicate and
audit, retain the original local file, and stay resumable. Old application
code cannot read `s3v1:` references. Do not migrate until the new code is
deployed.

## Files and dependency

- `lib/storage/statement-pdf-ref.ts`
- `lib/storage/statement-pdf-config.ts`
- `lib/storage/statement-pdf-s3.ts`
- `lib/storage/statement-pdf.ts` (dispatch)
- `server/services/statement-pdf-cleanup.ts`
- `scripts/statement-storage-diagnostics.ts`
- `scripts/statement-storage-inventory.ts`
- `scripts/statement-storage-probe.ts`
- `scripts/statement-storage-restore.ts`
- `lib/storage/statement-pdf-probe.ts`
- `docs/statement-storage-recovery.md`
- `@aws-sdk/client-s3` (official S3-compatible SDK)

No schema migration. No existing `.env` credentials were changed.

## Validation performed

Core 08 (October 14, 2026) adds verified probe cleanup, incremental
bounded S3 reads, PUT/DELETE timeouts, a designated test-target guard,
and a synthetic restore rehearsal. After this increment: 207 files /
1,546 tests passed; lint, typecheck, and production build passed.
Read-only probe is blocked until `BITS_STATEMENT_S3_TEST_*` is
designated. Mocked adapter and probe tests are not live provider proof.
See `docs/original-v1-storage-verification.md`.

Not verified here: a live private bucket or S3-compatible test service,
signed-in staff/donor download against remote objects, production restore,
or cutover of existing local PDFs. Provider testing remains pending until
`BITS_STATEMENT_S3_TEST_*` is designated. Production storage is an adapter,
not marked configured or recovered.
