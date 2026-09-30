import { redirect } from "next/navigation";

import {
  STAFF_ACCESS_DIRECTORY_EMPTY_COPY,
  STAFF_ACCESS_DIRECTORY_FILTER_LABELS,
  STAFF_ACCESS_DIRECTORY_FILTERS,
  STAFF_ACCESS_DIRECTORY_NOTICE,
} from "@/lib/validation/staff-access-directory";
import { getStaffAccessDirectory } from "@/server/services/staff-access-directory.service";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";
const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)]";

export default async function StaffAccessDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const query = await searchParams;
  const directory = await getStaffAccessDirectory(query);

  if (directory.status === "SIGNED_OUT") redirect("/sign-in");
  if (directory.status === "NO_ORGANIZATION") redirect("/settings/organization");
  if (directory.status === "UNAUTHORIZED") redirect("/dashboard");

  const rows = directory.status === "READY" ? directory.rows : [];
  const filterStatus =
    directory.status === "READY" ? directory.filterStatus : null;

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
        className="grid gap-4 rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm sm:grid-cols-[1fr_auto]"
      >
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
            Apply filter
          </button>
        </div>
      </form>

      <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Leadership Portal accounts
        </h2>
        {rows.length === 0 ? (
          <p className="mt-4 text-sm leading-6 text-[var(--bits-muted)]">
            {STAFF_ACCESS_DIRECTORY_EMPTY_COPY}
          </p>
        ) : (
          <>
            <ul className="mt-4 grid gap-3 sm:hidden">
              {rows.map((row) => (
                <li
                  key={`${row.primaryEmail}-${row.roleCode}`}
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
                  </p>
                  <p className="mt-1 text-sm text-[var(--bits-muted)]">
                    Added {row.createdOnLabel} · Updated {row.updatedOnLabel}
                  </p>
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
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={`${row.primaryEmail}-${row.roleCode}`}
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
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.createdOnLabel}
                      </td>
                      <td className="py-3 text-[var(--bits-navy)]">
                        {row.updatedOnLabel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
