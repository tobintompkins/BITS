import Link from "next/link";

import {
  formatGivingHouseholdDelivery,
  GIVING_HOUSEHOLD_DIRECTORY_COPY,
} from "@/lib/validation/giving-household";
import {
  GivingHouseholdError,
  listGivingHouseholdDirectory,
} from "@/server/services/giving-household.service";

export default async function GivingHouseholdsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const status = typeof params.status === "string" ? params.status : "active";
  let data;
  try {
    data = await listGivingHouseholdDirectory(q, status, Number(params.page ?? 1));
  } catch (error) {
    if (!(error instanceof GivingHouseholdError)) throw error;
    return <p role="alert">{error.message}</p>;
  }

  const href = (page: number) =>
    `/giving-households?${new URLSearchParams({ q: data.q, status, page: String(page) })}`;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-[var(--bits-muted)]">
          {data.organization.displayName ?? data.organization.name} · Giving
        </p>
        <h1 className="text-3xl font-semibold text-[var(--bits-navy)]">
          Giving Households
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          {GIVING_HOUSEHOLD_DIRECTORY_COPY}
        </p>
      </header>
      {data.canEdit ? (
        <Link
          href="/giving-households/new"
          className="inline-block rounded bg-[var(--bits-navy)] px-4 py-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          Add giving household
        </Link>
      ) : null}
      <form className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Search name or address
          <input
            name="q"
            defaultValue={data.q}
            maxLength={100}
            className="block rounded border bg-white p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
          />
        </label>
        <label className="text-sm">
          Status
          <select
            name="status"
            defaultValue={status}
            className="block rounded border bg-white p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
        </label>
        <button className="rounded border px-4 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]">
          Search
        </button>
        <Link
          href="/giving-households"
          className="underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          Reset
        </Link>
      </form>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left">
          <caption className="p-3 text-left">
            {data.total} matching giving households
          </caption>
          <thead>
            <tr>
              {["Name", "City", "Delivery", "Status"].map((heading) => (
                <th scope="col" className="p-3" key={heading}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="p-3">
                  <Link
                    className="underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                    href={`/giving-households/${row.id}`}
                  >
                    {row.displayName}
                  </Link>
                </td>
                <td className="p-3">{row.city}</td>
                <td className="p-3">
                  {formatGivingHouseholdDelivery(row.statementDeliveryMethod)}
                </td>
                <td className="p-3">{row.active ? "Active" : "Inactive"}</td>
              </tr>
            ))}
            {!data.rows.length ? (
              <tr>
                <td colSpan={4} className="p-5">
                  No giving households match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <nav aria-label="Giving household pages" className="flex gap-4">
        {data.page > 1 ? (
          <Link className="underline" href={href(data.page - 1)}>
            Previous
          </Link>
        ) : null}
        <span>Page {data.page}</span>
        {data.page * 25 < data.total ? (
          <Link className="underline" href={href(data.page + 1)}>
            Next
          </Link>
        ) : null}
      </nav>
    </div>
  );
}
