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

## Isolated SQL evidence — November 16, 2026

`npm run test:isolated -- server/services/statement-coverage.integration.test.ts` passed 1 file / 1 test on `bits_e2e`. Clerk sign-in was stubbed to run-owned memberships. Statement writes used the local PDF adapter, and the test deleted those files with its organization. No remote bucket was configured or written. This is not a signed-in browser pass. The November 11 result remains the browser evidence that donor A1 could open authorized published PDFs and donor A2 could not.

The SQL case kept an individual deductible total of 0.40: a 0.10 gift on January 1 and a 0.30 gift on December 31 whose allocations were 0.10 and 0.20. It excluded the prior December 31, the next January 1, anonymous gifts, and a test gift. The household total was 1.00. Membership history included the start day and the end day, and excluded the day before a start and the day after an end. Data Entry, Report Viewer, and Donor could not generate. A generated statement was not downloadable. The linked donor could download the published individual statement. Another donor, a household member who was not the preferred recipient, and a preferred recipient whose membership had ended were denied. Denied attempts wrote no access events. The two successful downloads wrote `DOWNLOADED`. Generation audits recorded the two totals. No product defect was confirmed. Durable provider recovery and Railway deployment remain open.

## Production object-storage follow-up

Replace the local adapter with a private object-store bucket (S3/R2/GCS) and
short-lived signed URLs. Continue serving through this authenticated API.
Do not make the storage directory public and do not generate placeholder PDFs
here — statement generation/publishing is a separate leadership workflow.
