# Donor management core — September 30, 2026

Original scope: FR-DONOR-001–003. The original May specification is unchanged.

Implemented `/donors`, `/donors/new`, `/donors/[id]`: search by name/email,
25-row pagination, active/inactive filter, accountless creation, profile edits,
mailing address, communication preference, internal notes and deceased fields.
Deactivation preserves donor identity, account links, gifts and statements.
No migration, deployment, deletion, or automatic account linking is introduced.

Access requires an active local account and membership in the selected Clerk
organization. Without an active Clerk organization, exactly one active church
membership is required. Admin/treasurer/data-entry may edit; report viewers
may read; donors/other roles are denied. A form bound to another organization
is rejected after a church switch. Writes and audit events share a transaction;
audit metadata records changed field names without private field contents.

Validation performed:

- 16 new donor service tests passed (authorization, organization scoping,
  stale forms, validation, accountless creation, history-preserving updates,
  audit failure propagation and private-note redaction).
- Focused ESLint passed.
- Full TypeScript check passed.
- Production build passed, with existing middleware/file-tracing warnings.
- Full test suite: 173 files passed, 2 failed; 1,347 tests passed, 13 failed.
  Failures are in volunteer-service-schedule and volunteer-substitute-request
  suites. Both fail independently when run without donor tests (same 13 failures).
  Those modules were not changed by this increment.

Not yet verified: authenticated browser acceptance, real database transaction
rollback and the full multi-tenant end-to-end workflow. Mock-based service tests
are not evidence of live database or production acceptance. Existing staff-shell
navigation still uses the project's primary-organization resolver; full
multi-organization navigation is a separate integration gap.

Hands-on acceptance: as admin/treasurer/data-entry create an accountless donor,
search, edit, deactivate/reactivate and inspect audit history. As report viewer,
confirm read-only access; as donor/unauthorized user, confirm denial. Attempt a
foreign donor URL and submit a form after changing active church. Confirm gifts,
statements and account links remain unchanged.

Remaining original core: offering-type administration, donor-household history
workflows, contribution reports/CSV, production statement storage and launch
verification. This increment does not mark original v1 complete.
