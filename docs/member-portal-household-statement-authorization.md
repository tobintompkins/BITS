# Member Portal — Household Statement Authorization

Signed-in donors may view or download a **published household** contribution
statement only when they are the church-selected preferred statement recipient
and still have an active membership in that household.

The same protected route is used for individual and household PDFs:

`/api/portal/statements/{id}/pdf?mode=view|download`

## Preferred-recipient policy

All of the following must be true at request time:

1. The signed-in Clerk user maps to an active donor in the current organization.
2. The household belongs to that organization and is `active`.
3. The donor has a `HouseholdMembership` for that household with `endDate` null.
4. `Household.preferredStatementRecipientId` equals the connected donor ID.
5. The statement belongs to that household and organization.
6. `statementType` is `HOUSEHOLD`.
7. `status` is `PUBLISHED`.
8. `pdfStorageKey` is present.

Authorized household IDs are resolved on the server from the signed-in account.
The browser never supplies `donorId` or `householdId`.

## Why membership alone is not enough

A spouse, child, or other current household member can see that a household
exists in church records, but household giving is still private financial data.
Only the person the church has named as `preferredStatementRecipientId` may
open the household statement in the Member Portal. Knowing the statement UUID,
sharing an address, or using the same email does not grant access.

## Why `primaryDonorId` is not a fallback

`primaryDonorId` is a household-contact convenience field. It is not a
statement-delivery authorization. If `preferredStatementRecipientId` is missing,
no donor — including the primary contact — receives household-statement access
through this portal. Staff must set the preferred recipient explicitly.

Administrator, treasurer, and other staff roles also do not grant access here.
Financial staff use the Leadership Portal.

## How access is revoked

The next request is denied, and the statement disappears from `/portal/statements`,
when any of these change:

- the donor’s household membership ends (`endDate` is set)
- the membership row is removed
- the household is marked inactive
- `preferredStatementRecipientId` is changed to another donor
- the donor record is deactivated or unlinked from the user account

No extra cache or client flag is consulted.

## Published-only and tenant boundaries

`GENERATED` and `VOIDED` statements are not listed or downloadable. A statement
from another organization never matches the current-organization query. A
household statement that still has a `donorId`, or an individual statement that
still has a `householdId`, is treated as malformed and denied.

Missing, unauthorized, unpublished, inactive, ended-membership, other-tenant,
malformed, and unavailable files all return the same generic not-found result.
The API does not reveal whether a forbidden statement exists.

## Access events

After authorization **and** a successful private-file open, the API writes one
`StatementAccessEvent`:

- `VIEWED` for `mode=view`
- `DOWNLOADED` for `mode=download`

Rejected requests create no event.

## Staff follow-up

A later leadership workflow should let authorized staff review and change the
preferred statement recipient with an audit trail. This increment does not add
that screen, generate PDFs, or publish statements.

## Limitations

- Individual statements remain scoped to the connected donor, `INDIVIDUAL`,
  `PUBLISHED`, and `householdId` null.
- Annual year selection, official totals, fund totals, receipts, and Stripe-test
  exclusions on `/portal/statements` are unchanged and still donor-scoped.
- Statement generation and publishing remain a separate leadership workflow.
