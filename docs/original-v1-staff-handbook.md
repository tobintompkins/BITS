# Original v1 staff workflow handbook

October 30, 2026, with Core 19 batch next-step wording added November 2,
2026. Plain-language guide to the **original giving** screens as they exist
in this tree. This is not signed-in acceptance, not a launch certificate,
and not proof that original version 1 is complete.

Use this file for weekly staff work. Detailed increment notes stay in the
linked docs. Do not paste real names, emails, or private screenshots here.

## How to read this handbook

- **Implemented in source:** the route, label, or action exists in the app.
  That is not the same as a treasurer having clicked through it on a live
  church.
- **Live acceptance pending:** Clerk identities, invitation send/accept,
  statement storage restore, and Railway are still open. Do not treat a
  handbook walkthrough as those gates.

If the church name, fund list, or donor list looks like the wrong church,
**stop**. Do not save. Sign out and tell an administrator.

## Church and role context

Staff routes live under the Leadership Portal shell. Unsigned visitors are
sent to `/sign-in`.

The navy header still says **BITS · Leadership Portal** and **Bring In
The Sheaves**. Under that it shows the **authorized church name** and role
from the same organization/membership context as the page. It does **not**
invent a fallback church. If no church is selected, the bar says **No
church selected. Stop. Do not save.** Organization Settings still shows
**Access level:** Organization Admin, Treasurer, Data Entry, Report Viewer,
Donor, or Super Admin.

If you cannot tell which church you are working in, stop.

### Original staff roles (what the screens actually allow)

Server checks, not the navigation menu, are the security boundary. Hidden
buttons are not enough.

| Role | Typical original giving work |
|---|---|
| Organization Admin (`ORG_ADMIN`) | All original giving, reports, statements, staff access, organization settings |
| Treasurer (`TREASURER`) | Same giving, batch lock/deposit, reports, and statements as an admin for these screens |
| Data Entry (`DATA_ENTRY`) | Donors, giving households, offering types, draft batches and gift entry, complete entry, request a correction. Cannot export reports or open statements |
| Report Viewer (`REPORT_VIEWER`) | View donors, households, types, batches, reports, and statements. Cannot add gifts, complete, reconcile, or lock |
| Donor (`DONOR`) | No staff giving screens |

Later member, event, volunteer, and care screens may appear in the same
shell. They are **not** the original v1 weekly giving path.

## Weekly path (original giving)

1. Confirm the church on a giving page.
2. Keep **Donors**, **Giving Households**, and **Offering Types** current.
3. Create a **draft** offering batch for the week.
4. Enter cash, check, stock/non-cash, or other gifts. Do not invent Card or ACH.
5. Correct draft mistakes, then **Complete Entry**, **Reconcile Batch**, record
   deposit, and **Lock Batch**.
6. Run contribution reports / CSV when authorized.
7. Generate and review statements when authorized.

## Donors (people without accounts are allowed)

- Directory: `/donors` — heading **Donors**. Copy: “People whose contributions
  are recorded, with or without a portal account.”
- **Add donor** → `/donors/new`. Detail/edit → `/donors/[id]`.
- Search **name or email**. Status: Active, Inactive, All.
- A donor does **not** need a portal login. Do not create a Clerk user to
  record a gift.
- Deactivating a donor keeps history. Inactive donors cannot be chosen for
  new gifts.

Details: `docs/donor-management-core.md`.

## Giving households vs member households

These are two different lists.

| Screen | Route | Purpose |
|---|---|---|
| Giving Households | `/giving-households` | Groups donors for **statement mailing** |
| Households (People) | `/households` | Church **membership** households |

Giving Households copy: “Giving households group donors for statement mailing.
These are not church-membership households.”

- **Add giving household** → `/giving-households/new`. Detail →
  `/giving-households/[id]`.
- Link, move, or end a donor’s giving-household membership from the household
  or donor screens. History is kept. Archived statement PDFs are **not**
  rewritten when a membership changes.
- Delivery methods on file include Email, Mail / Postal mail, and Pickup.

If two staff save the same household at once, the later save can fail. Refresh
and review before saving again.

Details: `docs/donor-household-history.md`,
`docs/original-v1-household-concurrency.md`.

## Offering types (giving funds)

- Directory: `/offering-types` — heading **Offering Types**.
- **Add** → `/offering-types/new`. Edit → `/offering-types/[id]`.
- Deactivating a fund keeps historical gifts, allocations, and statements.
- Codes that already have gifts are not rewritten. New gifts can only use
  **active** funds.

Details: `docs/offering-type-administration.md`.

## Offering batches (the weekly envelope)

- Directory: `/batches` — heading **Offering Batches**. **Add Batch** →
  `/batches/new`.
- Detail: `/batches/[id]`. Draft gift entry: `/batches/[id]/donations/new`.
  Draft gift edit: `/batches/[id]/donations/[donationId]/edit`.
- Statuses staff will see: Draft, Entered, Reconciled, Locked (labels from
  the batch status helper).

### What you may enter by hand

The **Payment method** list is only:

- Cash
- Check (requires **Check number**)
- Stock or non-cash
- Other

**Card** and **ACH** are not on this form. Online card/ACH gifts come from
Stripe later. Do not type a Stripe id, card number, or bank account into
notes to “make it a card gift.” Owner decision: keep that restriction for
v1. See `docs/original-v1-payment-method-assessment.md`.

You may record:

- A named active donor from **Search donors**, or
- **Anonymous** (no donor on the gift). Anonymous cash counts in church
  totals, not on a person’s statement.

Split one gift across funds with **Giving fund 1 / Amount 1**, and so on.
The server adds the amounts. The browser total is ignored.

If the offering date is not the batch date, confirm **Use this different
offering date**.

### Complete, reconcile, lock (actual button labels)

On the batch detail page, native dialogs use these labels:

| Button | Dialog title | What it does |
|---|---|---|
| **Complete Entry** | Complete batch entry? | Marks the batch Entered. Gift entry and draft editing stop. Totals do not change by themselves. |
| **Reconcile Batch** | Reconcile this batch? | Certifies expected total = recorded total. Does **not** lock and does **not** create a deposit. |
| **Lock Batch** | Lock this batch? | Permanent in the current workflow. Gifts, deposit, and batch edits stop. |

Complete Entry can proceed when expected and recorded totals differ.
Reconcile cannot: “Expected and recorded totals must match exactly.”
Lock also needs a deposit date and deposit reference, a recorded total
greater than zero, and gift allocations that match.

### What the Next action line means

The directory does not read every gift. It will not say **Reconcile** or
**Lock batch** from the stored totals alone.

- **Enter gifts** — you can add gifts to this draft. Opens the existing
  gift form. **Complete Entry** stays on the batch page.
- **Record deposit** — the batch is reconciled and you are allowed to
  record a deposit that is not on file yet.
- **Review batch** — you may be allowed to reconcile or lock, but the
  list has not checked gifts, allocations, or deposit dates. Open the
  batch. The detail page runs that check.
- **View only** — your role cannot change the batch at this stage.
- **Locked history** — the batch is locked. Totals stay as recorded.

On the batch page, a treasurer or organization admin who is blocked sees
the review message (for example, no gifts, totals that do not match, or
a deposit date before the offering). That is not a permissions error.
Data Entry and Report Viewer still see **View only** when the stage is
not theirs, even if the batch also has a review problem. Gift edits are
not offered once the batch is entered or locked.

**Reconciliation report** on the batch page is shown only to Organization
Admin, Treasurer, and Report Viewer. Data Entry does not get that link.
Opening the report directly is still checked by the report permission.

Details: `docs/original-v1-batch-guidance.md`.

### If two people work the same batch

You may see:

- “This batch changed since you opened it. Refresh and review again.”
- “This batch changed while the request was running. Refresh and try again.”

Refresh, read the current totals and gift list, and start the dialog again.
Do not keep clicking Confirm on an old window.

Saving a new gift uses a hidden one-time token so a double-click or retry
does not create a second gift. If the original gift is gone you may see
“This gift was already recorded and is no longer available.” Do not enter
it again until you have checked the batch list.

Details: `docs/manual-batch-donation-entry.md`,
`docs/offering-batch-entry-and-reconciliation.md`,
`docs/offering-batch-deposit-and-locking.md`,
`docs/original-v1-ledger-acceptance.md`.

## Draft corrections vs locked / Stripe gifts

- **Draft only:** edit or delete a manual gift from the batch donation
  table (**Edit donation from …**). That adjusts the recorded total and
  writes an audit row.
- After **Complete Entry**, those draft edits stop.
- After **Lock Batch**, gifts cannot be added or edited. A later
  **Correction Review Queue** at `/batches/corrections` (and per-batch
  `/batches/[id]/corrections`) records a request. It does **not** rewrite
  a locked gift in the current workflow.
- Stripe online gifts are not edited on the batch form. Unmatched Stripe
  gifts are reviewed at `/statements/unmatched` with **Review & match**.
  Matching assigns an active donor in this church and cannot be undone
  from that screen.

There is no original-v1 “adjustment journal” for locked batches. Do not
invent one by editing a note on a locked gift.

## Reports and CSV

- `/reports` — heading **Contribution reports**.
- Views: donation detail, by donor, by giving household, by offering type
  (the selected view is the current page in the filter links).
- Matching CSV: `/api/staff/reports/contributions/csv` (authorized
  Treasurer / Organization Admin / Report Viewer).
- Related: `/reports/batch-reconciliation` and `/reports/statement-access`.
- Data Entry cannot export. Test gifts stay out of official totals unless
  the test-only filter is on. Test and real gifts are never mixed.
- Totals cover every matching gift, not only the page on screen.

Details: `docs/contribution-reports.md`, `docs/report-catalog-exports.md`.

## Statements

- Hub: `/statements` — **Statements & Online Giving**. Official gifts are
  separate from Stripe sandbox/test gifts.
- Readiness, recipient review, run review, registry, unmatched gifts, and
  void requests are linked from Giving navigation when the role allows.
- Registry `/statements/registry` uses **Open review** and **View timeline**
  for each statement identifier.
- Anonymous gifts and test gifts do not belong on a personal statement.
- PDF files are not public URLs. Authorized staff or portal download only.

Statement object storage and restore are **not** production-verified.
Operator procedure: `docs/statement-storage-recovery.md`,
`docs/private-statement-storage.md`,
`docs/original-v1-storage-verification.md`.

## Staff access and invitations

- `/administration/staff-access` — **Staff Access**.
- Lists existing Leadership Portal memberships. An active organization
  administrator can invite original staff roles, change another existing
  original staff role, or deactivate that membership.
- It does **not** change Clerk organization roles or assign the first
  administrator.
- **Save membership for {name}** and **Revoke invitation for {email}** are
  the action labels. Confirm the person before saving.
- Invitations default to a **mock** delivery provider. That records the
  intent in BITS; it does not email a real person or create a Clerk user
  unless live invitation send is explicitly configured and authorized.
- Recipients accept at `/staff-invitations/accept` after they can sign in.

Do not send live invitations, create Clerk users, or enable Organizations
from this handbook. Details:
`docs/original-v1-staff-invitations.md`,
`docs/original-v1-staff-membership-administration.md`.

## Practical recovery

`/administration/backup-readiness` is a **log**. It does not take a
backup. Record a successful backup only after the backup actually exists
outside the app.

- Application / database rollback procedure:
  `docs/original-v1-launch-runbook.md`
- Statement PDF probe/restore (designated test target only):
  `docs/statement-storage-recovery.md`
- Railway TEST setup (no project is created by this handbook):
  `docs/original-v1-railway-test-setup.md`

Reverting git does not roll back gifts. Do not restore over the live
church database from chat instructions.

## Accessibility and display

Staff screens include **Display options** (text size and motion) and a
**Skip to main content** link. Idle timeout offers **Stay Signed In** and
**Sign Out Now**.

The bounded source review for original staff screens is
`docs/original-v1-accessibility-review.md`. That review does **not** claim
WCAG conformance. Keyboard and screen-reader checks on protected screens
still need a signed-in treasurer.

## What remains open

Keep these as open, not as handbook tasks:

- Live Clerk two-church and role acceptance
- Live invitation send/accept
- Designated statement storage restore
- Railway TEST / production
- Formal locked-ledger adjustments
- Phase 2 payments (recurring, refunds, fee coverage)

Original version 1 is **incomplete**. In-app `/help/leadership` and
`/portal/help` are fragments, not this handbook.
