# Donor household history — October 3, 2026

Original scope: FR-HH-001–004. The original May specification is unchanged.

Implemented `/giving-households`, `/giving-households/new` and
`/giving-households/[id]`: search by name/address, 25-row pagination,
active/inactive/all filter, create/edit mailing details and delivery method,
link/move/end donor memberships, and donor-detail history on `/donors/[id]`.
These screens administer Prisma `Household` / `HouseholdMembership` giving
households. They do not merge, rename, or replace member households at
`/households` and `/household/...`.

Membership dates are inclusive, date-only UTC values. An open row has a null
`endDate`. A move on calendar day D closes the current row on D-1 and creates a
new row starting on D in one transaction. The existing membership row is never
rewritten to a different household. Adjacent intervals are allowed; overlapping
intervals, including already-ended history, are rejected. Future-effective
changes are rejected. A move cannot start on or before the current membership
start date. Church “today” uses the organization time zone. Backdating requires
administrator/treasurer permission and an explicit confirmation. DATA_ENTRY
cannot backdate.

One open membership per donor per church is enforced by the partial unique
index `household_memberships_one_open_per_donor` on
`(organizationId, donorId) WHERE endDate IS NULL`. The migration fails loudly
if duplicate open rows already exist; it does not delete or repair history.
All writers use one lock order: tenant-scoped household rows `FOR UPDATE` in
sorted ID order, then tenant-scoped donor rows `FOR UPDATE` in sorted ID
order. Settings, link, move and end re-read eligibility after those locks.
Household settings updates use `updateMany` with `id + organizationId +
updatedAt` and advance `updatedAt` even for same-millisecond writes. Zero
updated rows is a friendly conflict and skips the audit. DATA_ENTRY updates
omit `primaryDonorId` and `preferredStatementRecipientId` entirely, so a basic
edit cannot restore a concurrently cleared contact. Recipient cleanup on
move/end also bumps household `updatedAt`. If the moved or ended donor was the
primary donor or preferred statement recipient, those pointers are cleared and
not auto-replaced.

Access requires an active local account and membership in the selected Clerk
organization. Without an active Clerk organization, exactly one active church
membership is required. Admin/treasurer may edit all fields, including primary
donor and preferred recipient. DATA_ENTRY may create/edit basic details and
link/move/end memberships, but cannot change financial-contact fields or
backdate. Report viewers are read-only. Donors/unauthenticated users are
denied. The household statement preview link is shown only when the actor can
view statements (admin, treasurer, report viewer). Membership alone never
grants portal statement access. Archived PDFs are not rewritten. Gift
attribution continues to use offering date against inclusive memberships.

Writes and audit events share a transaction. Audit metadata records changed
field names without mailing-address or note contents.

October 3 corrective increment (03A): settings writes are atomic; pickers
search/paginate instead of capping at 25/200; link/move/end return
server-derived `donorId` and household IDs and revalidate those paths.
Unassigned-donor lookup uses a tenant-scoped “no open membership” relation
exclusion rather than an unbounded assigned-ID list. Inactive households are
rejected as new link/move targets. Search is read-authorized and does not
grant mutation rights.

Validation performed:

- 24 focused giving-household tests passed (5 date/attribution helpers plus
  service tests for role denial, DATA_ENTRY create/basic-edit/resurrect
  rejection, competing `updateMany` zero-row conflict with no audit,
  ineligible recipient after lock, church-switch stale forms, accountless
  donor link, D-1/D move, reversed household lock order, inactive target
  rejection, same-household and start-date rejections, future/backdate
  rules, overlap and audit rollback, inclusive end, report-viewer denial,
  picker page 2 / household 201 discovery, and donor-path refresh that never
  uses a membership ID).
- Focused ESLint on changed files passed.
- Full TypeScript check passed.
- `git diff --check` passed.
- Production build passed, with existing middleware/file-tracing warnings.
  `/giving-households` routes are present in the build output alongside
  unchanged `/households` member-household routes.
- Full test suite: 179 files passed; 1,411 tests passed (October 3 baseline
  after Core 03 was 179 / 1,403). Volunteer-service schedule and
  volunteer-substitute-request failures from the earlier 13-test baseline
  did not reappear.

Unauthenticated `/giving-households` and `/giving-households/new` redirected to
Clerk sign-in. Member-household `/households` still redirects separately and
was not renamed.

Not yet verified: authenticated treasurer/data-entry/report-viewer/donor
browser acceptance, including picker pages beyond the first 25; two-session
database concurrency against an isolated test database; and live transaction
rollback. Mock lock/updateMany tests are not evidence of PostgreSQL
serialization. Existing staff-shell navigation still uses the project's
primary-organization resolver; full multi-organization navigation is a
separate integration gap.

Hands-on acceptance: as admin/treasurer create a giving household, link a
donor, move on D, and confirm a gift on D-1 stays with the old household while
a gift on D belongs to the new one. As data-entry, confirm basic edit/link
works and financial-contact/backdate actions are denied. As report viewer,
confirm read-only access and the statement-preview link. As donor/unauthorized
user, confirm denial. Confirm member-household screens still operate separately.

Remaining original core: contribution reports/CSV, production statement storage
and launch verification. This increment does not mark original v1 complete.
