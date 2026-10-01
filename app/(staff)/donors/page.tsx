import Link from "next/link";
import { DonorManagementError, listDonors } from "@/server/services/donor-management.service";
export default async function DonorsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const status = typeof params.status === "string" ? params.status : "active";
  let data;
  try { data = await listDonors(q, status, Number(params.page ?? 1)); }
  catch (e) { if (!(e instanceof DonorManagementError)) throw e; return <p role="alert">{e.message}</p>; }
  const href = (page: number) => `/donors?${new URLSearchParams({ q: data.q, status, page: String(page) })}`;
  return <div className="space-y-6">
    <header><p className="text-sm text-[var(--bits-muted)]">{data.organization.displayName ?? data.organization.name} · Giving</p><h1 className="text-3xl font-semibold text-[var(--bits-navy)]">Donors</h1><p>People whose contributions are recorded, with or without a portal account.</p></header>
    {data.canEdit && <Link href="/donors/new" className="inline-block rounded bg-[var(--bits-navy)] px-4 py-2 text-white">Add donor</Link>}
    <form className="flex flex-wrap items-end gap-3">
      <label>Search name or email<input name="q" defaultValue={data.q} maxLength={100} className="block rounded border bg-white p-2" /></label>
      <label>Status<select name="status" defaultValue={status} className="block rounded border bg-white p-2"><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All</option></select></label>
      <button className="rounded border px-4 py-2">Search</button><Link href="/donors" className="underline">Reset</Link>
    </form>
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left"><caption className="p-3 text-left">{data.total} matching donors</caption><thead><tr>{["Name", "Email", "Phone", "Status"].map(h => <th scope="col" className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>
      {data.donors.map(d => <tr key={d.id} className="border-t"><td className="p-3"><Link className="underline" href={`/donors/${d.id}`}>{d.lastName}, {d.firstName}</Link></td><td className="p-3">{d.email ?? "—"}</td><td className="p-3">{d.phone ?? "—"}</td><td className="p-3">{d.active ? "Active" : "Inactive"}{d.deceased ? " · Deceased" : ""}</td></tr>)}
      {!data.donors.length && <tr><td colSpan={4} className="p-5">No donors match these filters.</td></tr>}
    </tbody></table></div>
    <nav aria-label="Donor pages" className="flex gap-4">{data.page > 1 && <Link className="underline" href={href(data.page - 1)}>Previous</Link>}<span>Page {data.page}</span>{data.page * 25 < data.total && <Link className="underline" href={href(data.page + 1)}>Next</Link>}</nav>
  </div>;
}
