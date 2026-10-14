import Link from "next/link";
import { redirect } from "next/navigation";

import { StaffInvitationForm } from "@/components/staff/staff-invitation-form";
import { StaffInvitationList } from "@/components/staff/staff-invitation-list";
import { StaffMembershipEditForm } from "@/components/staff/staff-membership-edit-form";
import {
  STAFF_ACCESS_DIRECTORY_EMPTY_COPY,
  STAFF_ACCESS_DIRECTORY_FILTER_LABELS,
  STAFF_ACCESS_DIRECTORY_FILTERS,
  STAFF_ACCESS_DIRECTORY_NOTICE,
} from "@/lib/validation/staff-access-directory";
import {
  STAFF_INVITATION_FILTER_LABELS,
  STAFF_INVITATION_FILTERS,
} from "@/lib/validation/staff-invitation";
import { getStaffAccessDirectory } from "@/server/services/staff-access-directory.service";
import { getStaffInvitationDirectory } from "@/server/services/staff-invitation.service";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";
const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)]";

export default async function StaffAccessDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    q?: string;
    page?: string;
    invitations?: string;
    iq?: string;
    ipage?: string;
  }>;
}) {
  const query = await searchParams;
  const directory = await getStaffAccessDirectory(query);
  const invitations = await getStaffInvitationDirectory(query);

  if (directory.status === "SIGNED_OUT") redirect("/sign-in");
  if (directory.status === "NO_ORGANIZATION") redirect("/settings/organization");
  if (directory.status === "UNAUTHORIZED") redirect("/dashboard");

  const rows = directory.status === "READY" ? directory.rows : [];
  const filterStatus =
    directory.status === "READY" ? directory.filterStatus : null;
  const search = directory.status === "READY" ? directory.query : "";
  const page = directory.status === "READY" ? directory.page : 1;
  const total = directory.status === "READY" ? directory.total : 0;
  const pageSize = directory.status === "READY" ? directory.pageSize : 25;
  const invitationGapNotice =
    directory.status === "READY" ? directory.invitationGapNotice : "";

  const href = (nextPage: number) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (filterStatus) params.set("status", filterStatus);
    params.set("page", String(nextPage));
    return `/administration/staff-access?${params}`;
  };

  const invitationHref = (nextPage: number) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (filterStatus) params.set("status", filterStatus);
    params.set("page", String(page));
    if (invitations.status === "READY") {
      params.set("invitations", invitations.filter);
      if (invitations.query) params.set("iq", invitations.query);
    }
    params.set("ipage", String(nextPage));
    return `/administration/staff-access?${params}`;
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Administration
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Staff Access
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          {STAFF_ACCESS_DIRECTORY_NOTICE}
        </p>
        {invitationGapNotice ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
            {invitationGapNotice}
          </p>
        ) : null}
      </header>

      {directory.status === "INVALID_FILTER" ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          Choose a valid active or inactive filter.
        </p>
      ) : null}

      <form
        method="get"
        className="grid gap-4 rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm sm:grid-cols-[1fr_12rem_auto]"
      >
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Search name or email
          <input
            name="q"
            defaultValue={search}
            maxLength={100}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Membership status
          <select
            name="status"
            defaultValue={filterStatus ?? ""}
            className={fieldClass}
          >
            <option value="">All staff accounts</option>
            {STAFF_ACCESS_DIRECTORY_FILTERS.map((status) => (
              <option key={status} value={status}>
                {STAFF_ACCESS_DIRECTORY_FILTER_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className={`rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
          >
            Search
          </button>
        </div>
      </form>

      <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Leadership Portal accounts
        </h2>
        <p className="mt-1 text-sm text-[var(--bits-muted)]">
          {total} matching staff memberships
        </p>
        {rows.length === 0 ? (
          <p className="mt-4 text-sm leading-6 text-[var(--bits-muted)]">
            {STAFF_ACCESS_DIRECTORY_EMPTY_COPY}
          </p>
        ) : (
          <>
            <ul className="mt-4 grid gap-3 sm:hidden">
              {rows.map((row) => (
                <li
                  key={row.membershipId}
                  className="rounded-xl border border-[var(--bits-border)] p-4"
                >
                  <p className="font-semibold text-[var(--bits-navy)]">
                    {row.displayName}
                  </p>
                  <p className="mt-1 text-sm text-[var(--bits-muted)]">
                    {row.primaryEmail}
                  </p>
                  <p className="mt-2 text-sm text-[var(--bits-navy)]">
                    {row.roleName}
                    <span className="text-[var(--bits-muted)]">
                      {" "}
                      · {row.roleCode}
                    </span>
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--bits-navy)]">
                    {row.membershipStatusLabel}
                    {!row.userAccountActive ? " · Account disabled" : ""}
                  </p>
                  <p className="mt-1 text-sm text-[var(--bits-muted)]">
                    Added {row.createdOnLabel} · Updated {row.updatedOnLabel}
                  </p>
                  {row.canManage ? (
                    <StaffMembershipEditForm row={row} />
                  ) : row.managementNote ? (
                    <p className="mt-2 text-sm text-[var(--bits-muted)]">
                      {row.managementNote}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="mt-4 hidden overflow-x-auto sm:block">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">
                  Staff and leadership accounts with Leadership Portal access
                </caption>
                <thead>
                  <tr className="border-b border-[var(--bits-border)] text-[var(--bits-muted)]">
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Name
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Email
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Role
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Status
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Added
                    </th>
                    <th scope="col" className="py-3 font-medium">
                      Membership
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.membershipId}
                      className="border-b border-[var(--bits-border)] align-top last:border-0"
                    >
                      <th
                        scope="row"
                        className="py-3 pr-4 font-semibold text-[var(--bits-navy)]"
                      >
                        {row.displayName}
                      </th>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.primaryEmail}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.roleName}
                        <span className="block text-[var(--bits-muted)]">
                          {row.roleCode}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.membershipStatusLabel}
                        {!row.userAccountActive ? (
                          <span className="block text-[var(--bits-muted)]">
                            Account disabled
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.createdOnLabel}
                      </td>
                      <td className="py-3 text-[var(--bits-navy)]">
                        {row.canManage ? (
                          <StaffMembershipEditForm row={row} />
                        ) : (
                          <p className="text-sm text-[var(--bits-muted)]">
                            {row.managementNote ?? `Updated ${row.updatedOnLabel}`}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <nav aria-label="Staff membership pages" className="mt-4 flex gap-4">
          {page > 1 ? (
            <Link className="underline" href={href(page - 1)}>
              Previous
            </Link>
          ) : null}
          <span>
            Page {page}
          </span>
          {page * pageSize < total ? (
            <Link className="underline" href={href(page + 1)}>
              Next
            </Link>
          ) : null}
        </nav>
      </section>

      {invitations.status === "SCHEMA" ? (
        <p
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {invitations.message}
        </p>
      ) : null}

      {invitations.status === "READY" ? (
        <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
            Staff invitations
          </h2>
          <p className="mt-1 text-sm text-[var(--bits-muted)]">
            Authorized administrators invite original staff roles. An invitation
            is not access until the recipient signs in and explicitly accepts.
          </p>
          {invitations.canMutate ? (
            <StaffInvitationForm churchName={invitations.churchName} />
          ) : (
            <p className="mt-3 text-sm text-[var(--bits-muted)]">
              Invitation changes require an active organization administrator
              membership.
            </p>
          )}
          <form
            method="get"
            className="mt-5 grid gap-4 sm:grid-cols-[1fr_12rem_auto]"
          >
            {search ? <input type="hidden" name="q" value={search} /> : null}
            {filterStatus ? (
              <input type="hidden" name="status" value={filterStatus} />
            ) : null}
            <input type="hidden" name="page" value={String(page)} />
            <label className="text-sm font-medium text-[var(--bits-navy)]">
              Search invitation email
              <input
                name="iq"
                defaultValue={invitations.query}
                maxLength={100}
                className={fieldClass}
              />
            </label>
            <label className="text-sm font-medium text-[var(--bits-navy)]">
              Invitation view
              <select
                name="invitations"
                defaultValue={invitations.filter}
                className={fieldClass}
              >
                {STAFF_INVITATION_FILTERS.map((filter) => (
                  <option key={filter} value={filter}>
                    {STAFF_INVITATION_FILTER_LABELS[filter]}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                className={`rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
              >
                Filter invitations
              </button>
            </div>
          </form>
          <p className="mt-3 text-sm text-[var(--bits-muted)]">
            {invitations.total} matching invitations
          </p>
          <StaffInvitationList rows={invitations.rows} />
          <nav aria-label="Staff invitation pages" className="mt-4 flex gap-4">
            {invitations.page > 1 ? (
              <Link className="underline" href={invitationHref(invitations.page - 1)}>
                Previous invitations
              </Link>
            ) : null}
            <span>Invitation page {invitations.page}</span>
            {invitations.page * invitations.pageSize < invitations.total ? (
              <Link className="underline" href={invitationHref(invitations.page + 1)}>
                Next invitations
              </Link>
            ) : null}
          </nav>
        </section>
      ) : null}
    </div>
  );
}
