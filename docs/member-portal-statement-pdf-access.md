# Member Portal — Secure Statement PDF Access

Signed-in members can view or download their own **published** contribution
statement PDFs from `/portal/statements`.

## Ownership boundary

Authorization always starts from the signed-in Clerk user → BITS user account
→ **active donor** linked in the current organization. A known UUID is never
enough.

### Individual statements

The query requires all of:

- current `organizationId`
- connected `donorId`
- `householdId` is null
- `statementType = INDIVIDUAL`
- `status = PUBLISHED`
- requested statement UUID

### Household statements

Household IDs are resolved on the server. The donor must be the active
preferred statement recipient of an active household in the current
organization, with `HouseholdMembership.endDate` null. The statement query
then requires:

- current `organizationId`
- `statementType = HOUSEHOLD`
- `status = PUBLISHED`
- `donorId` is null
- `householdId` contained in that authorized list

If no household is authorized, the household branch is omitted so the query
cannot become an unscoped household lookup. `primaryDonorId` is never used as
a fallback. See `docs/member-portal-household-statement-authorization.md`.

Another donor, another organization, a non-recipient household member, an
unpublished row, or a malformed relationship all resolve to the same
not-found result.

## Published-only rule

`GENERATED` and `VOIDED` statements are not retrievable through this API.
Leadership generation and publishing remain a separate workflow.

## Private storage boundary

PDFs are stored outside the Next.js public directory:

`{BITS_FILE_STORAGE_ROOT|cwd}/storage/private/statements/{orgId}/{statementId}/`

The stored key must stay under that organization/statement prefix. Absolute
paths, `..` traversal, escaped symlinks, non-PDF content (`%PDF-` magic), and
checksum mismatches are rejected. Clients never receive a storage key or
filesystem path. Links use only `/api/portal/statements/{id}/pdf?mode=view|download`.

## View/download access history

After authorization **and** a successful file open, the API writes exactly one
`StatementAccessEvent`:

- `VIEWED` for `mode=view` (`Content-Disposition: inline`)
- `DOWNLOADED` for `mode=download` (`Content-Disposition: attachment`)

Rejected or missing requests do not create an event. A stream setup failure
cannot be recorded as a successful access.

## Error behavior

- Signed out → `401`
- Invalid statement UUID or mode → `400`
- Missing, unpublished, unauthorized, cross-organization, inactive-household,
  ended-membership, malformed, or unavailable files → the same `404`
  `{ "error": "Not found" }`
- Responses include `Cache-Control: private, no-store` and
  `X-Content-Type-Options: nosniff`

Logs must not include statement contents, storage keys, donor details, or
filesystem paths.

## Production object-storage follow-up

Replace the local adapter with a private object-store bucket (S3/R2/GCS) and
short-lived signed URLs. Continue serving through this authenticated API.
Do not make the storage directory public and do not generate placeholder PDFs
here — statement generation/publishing is a separate leadership workflow.
