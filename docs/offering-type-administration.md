# Offering-type administration — September 30, 2026

Original scope: FR-TYPE-001–003. The original May specification is unchanged.

Implemented `/offering-types`, `/offering-types/new`, `/offering-types/[id]`:
search by name/code, 25-row pagination, active/inactive/all filter, sort by
display order then name then id, create/edit, tax-deductible and online-giving
flags, optional integration code, display order, and deactivate/reactivate.
Deactivation does not delete funds, allocations, gifts, or archived statements.
No schema migration, destructive delete, or Stripe allowlist expansion is
introduced. Existing nonempty codes stay immutable; blank codes store as null.

Access requires an active local account and membership in the selected Clerk
organization. Without an active Clerk organization, exactly one active church
membership is required. Admin/treasurer may edit; data-entry and report viewers
may read; donors/unauthenticated users are denied. This write policy is
intentionally narrower than donor DATA_ENTRY write access. A form bound to
another organization is rejected after a church switch. Concurrent edits compare
`updatedAt`. Writes and audit events share a transaction; audit metadata records
changed field names, with description contents stored only as `changed`.

A name change is not snapshotted onto historical donation rows. Live screens,
previews, receipts and new statement generation read the current
`offeringType.name`. Already-written statement PDF files are not rewritten when
a fund is renamed or deactivated. Manual batch entry lists active same-church
funds and revalidates activity at save, so an already-open form cannot bypass
deactivation. Deactivate/reactivate require an explicit confirmation checkbox
and submit the intended active state.

Stripe test checkout still uses a **fixed allowlist**. The online-giving
checkbox only applies to a matching `STRIPE_*` offering type already in that
allowlist. Missing rows still allow a first checkout, which creates the type.
Later settlement of an already-created checkout does not rename, reactivate, or
re-enable an existing type. New public and member checkout reject inactive or
online-disabled matching funds and do not advertise them.

Validation performed:

- 21 new offering-type service tests passed (authorization, organization
  scoping, stale forms, validation, blank/normalized/duplicate codes, immutable
  existing codes, allocation-preserving deactivation, tax-default updates that
  do not rewrite donation history, concurrent `updatedAt` conflict, audit
  failure propagation, and intended-state reactivation).
- Stripe persist/checkout tests passed, including inactive-fund settlement
  without overwrite, webhook-style idempotent recording, and new-checkout
  rejection for inactive/online-disabled matching funds.
- Focused ESLint on changed files passed.
- Full TypeScript check passed.
- Production build passed, with existing middleware/file-tracing warnings.
  `/offering-types` routes are present in the build output.
- Donation/Stripe regression files passed (manual batch donation, Stripe
  donation validation, Stripe webhook).
- Full test suite: 174 files passed, 2 failed; 1,371 tests passed, 13 failed.
  Failures are in volunteer-service-schedule and volunteer-substitute-request
  suites. Both fail independently when run without offering-type tests (same 13
  failures). Those modules were not changed by this increment.

Not yet verified: authenticated treasurer/read-only/donor browser acceptance,
real database unique-constraint races, transaction rollback on a live database,
and a live Stripe TEST checkout session. The public `/give` form loaded with the
fixed allowlist; unauthenticated `/offering-types` redirected to sign-in. Mock-based
service tests are not evidence of live database or production acceptance.
Existing staff-shell navigation still uses the project's primary-organization
resolver; full multi-organization navigation is a separate integration gap. The
Stripe allowlist is unchanged; staff cannot add a new hosted-checkout fund by
checking online giving. A Stripe TEST secret is present locally, but a hosted
checkout session was not created in this increment.

Hands-on acceptance: as admin/treasurer create a fund, search, edit, deactivate
and reactivate, and inspect audit history. As data-entry/report viewer, confirm
read-only access; as donor/unauthorized user, confirm denial. Attempt a foreign
offering-type URL and submit a form after changing active church. Confirm
allocations and statements remain unchanged. Confirm public/member give pages
omit inactive or online-disabled matching Stripe funds and that new checkout is
rejected for those funds. Confirm a previously started checkout still records
against a later-deactivated matching type.

Remaining original core: donor-household history workflows, contribution
reports/CSV, production statement storage and launch verification. This
increment does not mark original v1 complete.

## October 3 corrective verification

Fixed activation redirect handling and atomic updatedAt conflict checks. Removed an unsupported ClerkProvider prop while retaining the SDK-supported environment version pin. Date-sensitive volunteer/equipment test fixtures now use controlled clocks. All 177 test files / 1,387 tests passed; changed-file ESLint and production build (including TypeScript) passed. Authenticated browser, real database and payment acceptance remain outstanding. Original roadmap unchanged.
