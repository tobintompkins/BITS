import Link from "next/link";

import {
  OfferingTypeError,
  listOfferingTypeDirectory,
} from "@/server/services/offering-type.service";

export default async function OfferingTypesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const status = typeof params.status === "string" ? params.status : "active";
  let data;
  try {
    data = await listOfferingTypeDirectory(q, status, Number(params.page ?? 1));
  } catch (error) {
    if (!(error instanceof OfferingTypeError)) throw error;
    return <p role="alert">{error.message}</p>;
  }

  const href = (page: number) =>
    `/offering-types?${new URLSearchParams({ q: data.q, status, page: String(page) })}`;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-[var(--bits-muted)]">
          {data.organization.displayName ?? data.organization.name} · Giving
        </p>
        <h1 className="text-3xl font-semibold text-[var(--bits-navy)]">
          Offering Types
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          Create and maintain giving funds. Deactivation keeps historical gifts,
          allocations, and statements on file.
        </p>
      </header>
      {data.canEdit ? (
        <Link
          href="/offering-types/new"
          className="inline-block rounded bg-[var(--bits-navy)] px-4 py-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          Add offering type
        </Link>
      ) : null}
      <form className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Search name or code
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
          href="/offering-types"
          className="underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          Reset
        </Link>
      </form>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left">
          <caption className="p-3 text-left">
            {data.total} matching offering types
          </caption>
          <thead>
            <tr>
              {["Name", "Code", "Online", "Tax-deductible", "Status"].map(
                (heading) => (
                  <th scope="col" className="p-3" key={heading}>
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="p-3">
                  <Link
                    className="underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                    href={`/offering-types/${row.id}`}
                  >
                    {row.name}
                  </Link>
                </td>
                <td className="p-3">{row.code ?? "—"}</td>
                <td className="p-3">
                  {row.onlineGivingEnabled ? "Yes" : "No"}
                </td>
                <td className="p-3">
                  {row.defaultTaxDeductible ? "Yes" : "No"}
                </td>
                <td className="p-3">{row.active ? "Active" : "Inactive"}</td>
              </tr>
            ))}
            {!data.rows.length ? (
              <tr>
                <td colSpan={5} className="p-5">
                  No offering types match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <nav aria-label="Offering type pages" className="flex gap-4">
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
