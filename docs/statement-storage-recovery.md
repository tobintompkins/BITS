# Statement PDF recovery runbook

October 14, 2026. This is the operator procedure for Core 08 synthetic
verification and a later reviewed restore. It does not mark disaster
recovery complete.

## What this covers

- Inventory of expected statement metadata and checksums
- Synthetic probe and restore rehearsal against a designated test target
- Reviewed restore of a statement PDF reference after a verified backup copy
- Authorized staff/portal download checks after restore

## What this does not cover

- PostgreSQL backup or restore
- Real-tenant cutover
- Historical local-to-`s3v1:` migration (still dry-run only)
- Production bucket purchase, ACL, IAM, or lifecycle changes
- Proof that every object in a versioned bucket is permanently gone

Distinguish these outcomes: local/emulator rehearsal, live provider
copy/restore, provider version restoration, durable independent backup, and
full database-plus-PDF disaster recovery. A same-bucket copy is not an
independent durable backup.

## 1. Inventory expected metadata

```bash
npm run statements:storage-diagnostics
npm run statements:storage-inventory
```

Diagnostics print no secrets. Inventory is read-only and refuses `--apply`.
Preserve `pdfStorageKey`, `pdfChecksum`, organization id, and statement id
for each row you may restore. Do not treat inventory as a backup.

## 2. Designate an isolated test target

Required names only:

- `BITS_STATEMENT_S3_TEST_TARGET=1`
- `BITS_STATEMENT_S3_TEST_BUCKET` (dedicated test/e2e name, not
  `BITS_STATEMENT_S3_BUCKET`)
- `BITS_STATEMENT_S3_TEST_REGION` or `BITS_STATEMENT_S3_REGION`
- optional test endpoint / prefix / path-style / insecure-HTTP flags

```bash
npm run statements:storage-probe
```

The default command is read-only. It does not write objects.

## 3. Synthetic provider probe

```bash
npm run statements:storage-probe -- --apply
```

This writes a reserved non-donor key, proves conditional create, rejects
overwrite, verifies SHA-256 (never ETag), checks one unsigned object URL,
and verifies the exact key is absent after delete. AccessDenied or timeout
is unknown, not absence. Cleanup failure writes a redacted manifest under
`e2e/.local/`.

## 4. Synthetic restore rehearsal

```bash
npm run statements:storage-restore -- --apply
```

This creates a recovery copy, verifies it independently, removes only the
synthetic source, restores from the backup object (not memory), and checks
the restored checksum. It is not a durable offsite backup.

## 5. Reviewed restore of a real statement PDF

Do this only with a reviewed plan and recovery credentials that are not the
application role:

1. Confirm the statement row still has the expected `pdfStorageKey` and
   `pdfChecksum`.
2. Confirm a verified backup copy of those exact bytes exists outside the
   failed object.
3. Restore to a new key, or to the original key only after inspect proves
   it is absent, using conditional create (`If-None-Match: *`).
4. Update the statement reference only with an optimistic predicate and an
   audit event. Retain the previous key.
5. Download through the authorized staff or portal route and confirm the
   checksum. Do not use an auth-bypass endpoint.

Legacy local files stay in place. Migration remains dry-run only.

## 6. Afterward

Record the command, date, target kind (emulator vs live provider), and each
check status. Missing identities or an undesignated bucket are blockers, not
passes. Original version 1 remains incomplete until live Clerk acceptance,
broader financial/staff workflows, concurrency, and deployment checks exist.
