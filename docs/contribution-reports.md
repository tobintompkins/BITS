# Contribution reports and CSV — October 3, 2026

Original scope: FR-REPORT-001–002, section 14 (the four operational contribution
views and matching CSV). The original May specification is unchanged.

Replaced the `/reports` placeholder with four offering-date views: donation
detail, by donor, by giving household, and by offering type, plus a matching
CSV export at `/api/staff/reports/contributions/csv`. The screens reuse
existing `Donation`, `DonationAllocation`, `OfferingBatch`, `Household`, and
`HouseholdMembership` rows. They do not add a reporting database, a second
household model, or a schema migration. Member households at `/households`
remain a separate system.

Filters require an inclusive offering-date range. The query uses that start
date and an exclusive next-day end. The default period is January 1 of the
church calendar year through church today (`Intl` `en-CA` in the organization
time zone). Optional filters: donor, giving household, offering type, batch,
and payment method. Pickers are searchable and bounded to 25 rows. Filter
state lives in the URL. Received date is not used.

Money uses Decimal amounts formatted with `toFixed(2)` only. Test gifts are
excluded unless Test gifts only is selected; test and real gifts are never
mixed. When a fund is selected, gift totals stay whole-gift amounts and the
matching-fund column is only the allocation to that fund. The offering-type
view sums selected allocations only.

Household attribution uses inclusive membership on the offering date: a move
on calendar day D keeps D-1 with the old household and D with the new one.
Anonymous, unmatched, and unassigned gifts stay out of household totals.
Distinct overlapping memberships are marked Needs household review and counted
once. Same-household duplicate rows are not treated as overlap.

Totals cover every matching gift, not only the current page. The detail view
paginates at 25 or 50 rows. The range may not exceed 366 inclusive days. More
than 5,000 matching gifts is rejected on screen and export; CSV is never
truncated.

CSV values neutralize formula prefixes after leading whitespace or control
characters. Filenames are built from the validated view and dates only. The
export is audited (`CONTRIBUTION_REPORT_EXPORTED`) before delivery. Audit
metadata records view, dates, test-only vs real-only, and row count. An audit
failure does not release the file and does not mutate gifts.

Access requires an active local account and membership in the selected Clerk
organization. Without an active Clerk organization, exactly one active church
membership is required. Admin, treasurer, and report viewer may view and
export. DATA_ENTRY, donors, and unauthenticated users are denied. A hidden
organization id is a stale-church check only; it is never the tenant
authority. The page links existing batch reconciliation and the statement
registry when the actor may view those screens. This increment does not
rebuild PDFs, audit UI, or reconciliation.

Validation performed:

- 19 focused contribution-report tests passed (CSV formula/whitespace
  protection; exclusive next-day range and safe filename; D-1/D household
  attribution, same-household dedupe, and anonymous/unmatched/unassigned
  buckets; signed-out/DATA_ENTRY/donor denial; report-viewer export;
  foreign filter ids; stale church; split-gift counting; exact decimals and
  inactive funds; household-move dates; overflow without audit; audit-fail
  without release; screen/CSV inclusion parity; CSV route headers and
  authorization mapping).
- Focused ESLint on changed files passed.
- Full TypeScript check passed.
- `git diff --check` passed.
- Production build passed, with existing middleware/file-tracing warnings.
  `/reports` and `/api/staff/reports/contributions/csv` are present alongside
  unchanged `/giving-households` and `/households` routes.
- Full test suite: 184 files passed; 1,430 tests passed (October 3 baseline
  after Core 03A was 179 / 1,411). Volunteer-service schedule and
  volunteer-substitute-request failures from the earlier 13-test baseline
  did not reappear.

Unauthenticated `/reports` redirected to Clerk sign-in. Unauthenticated CSV
export returned 401. Member-household `/households` still redirects separately
and was not renamed.

Not yet verified: authenticated treasurer/report-viewer/DATA_ENTRY/donor
browser acceptance against live gifts; a live export that writes an audit
row; and printable batch-reconciliation CSV or statement-access CSV. Those
remaining catalog items are follow-ups, not this slice. Existing
staff-shell navigation still uses the project's primary-organization
resolver; full multi-organization navigation is a separate integration gap.

Hands-on acceptance: as treasurer or report viewer, open `/reports`, change
views, apply donor/household/fund/batch/payment filters, confirm totals cover
all matching rows, export CSV, and confirm the audit row. Confirm test-only
mode never mixes real gifts. Confirm a fund filter keeps whole-gift totals
plus the matching allocation. Confirm a D-1/D household move attributes
correctly and that an overlapping membership is marked, not doubled. As
DATA_ENTRY or donor, confirm denial. As an unauthenticated visitor, confirm
sign-in.

Remaining original core: durable private statement storage, authenticated
giving-household acceptance, remaining report-catalog CSVs, and launch
verification. This increment does not mark the full original report catalog
or original v1 complete.
