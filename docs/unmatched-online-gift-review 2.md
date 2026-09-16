# Unmatched Online Gift Review

Financial staff can review Stripe gifts that were recorded without a matched
donor and connect each gift to an existing donor at `/statements/unmatched`.

## Permissions

- `ORG_ADMIN` and `TREASURER` may view the queue and confirm a match.
- `REPORT_VIEWER` may view the queue but cannot match.
- `DATA_ENTRY`, `DONOR`, signed-out users, and other roles cannot view or match.
- The Leadership Statements page and this queue both require statement view
  access. Match actions require statement manage access on the server.
- Hiding the Match button is not the security boundary.

## Organization boundary

Every queue, donor-search, and match query includes the current organization
ID. Cross-organization donation IDs and donor IDs resolve to the same generic
not-found result. Search never returns donors from another church.

## Candidate search behavior

Staff search only **active** donors in the current organization by normalized
email, first name, last name, and first-plus-last combinations. Results show
name, masked email, masked phone, and household name when an active household
membership exists. Internal notes and other giving history are not returned.

Name-only similarity never creates a match automatically.

## Exact-email recommendation

If the search text is an email address and it exactly matches a donor in the
current organization, that donor is listed first as an “Exact email
recommendation.” Staff must still select the donor and confirm. The
recommendation is organization-scoped.

## Confirmation workflow

A permitted user selects one unmatched Stripe donation and one active donor.
The confirmation step repeats gift date, amount, fund, selected donor, and
test/live status. The server rejects the request unless `confirmed` is true.

Matching updates only `Donation.donorId`. Amount, date, allocation, tax
status, Stripe IDs, and test/live status are not changed.

## Concurrency protection

The donation and donor are re-read inside a transaction and must belong to the
current organization. The donation must still have `donorId` null and a Stripe
checkout session ID. The update is `updateMany` with `donorId: null`. If
another staff member matched first, the update count is zero and the staff
member receives a friendly conflict message. The existing donor assignment is
not overwritten.

## Audit behavior

A successful match writes one `AuditEvent` in the **same transaction**:

- action: `MATCH_ONLINE_GIFT_TO_DONOR`
- entityType: `Donation`
- entityId: donation ID
- actorUserAccountId
- organizationId
- `donorId` old value `null`, new value the selected donor ID
- `isTestGift` true/false

Rejected, unauthorized, and conflicting attempts do not write a success audit.
If the audit write fails, the donor assignment rolls back.

Audit metadata does not include donor email, card data, raw Stripe payloads,
secrets, or full checkout session IDs.

## One-way matching limitation

This increment does not unmatch or reassign a gift. Corrections require a later
restricted financial-correction workflow with stronger approval rules.

## Future financial-correction workflow

Later work should add two-person review for changing a matched donor,
unmatching a gift, refunds, disputes, batches, and deposits. Live payments
remain disabled in this increment.
