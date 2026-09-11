import { createLinkedDonorAction, linkExistingDonorAction } from "./actions";

import { getPortalLinkAdminData } from "@/server/services/member-portal-link.service";

export default async function MemberPortalLinksPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const [{ success, error }, data] = await Promise.all([
    searchParams,
    getPortalLinkAdminData(),
  ]);
  const unlinked = data.donors.filter((donor) => !donor.userAccount);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Administration
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Member Portal Connections
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          Connect a signed-in email account to the correct donor record for{" "}
          {data.organizationName}. Always verify the person before connecting
          private giving information.
        </p>
      </header>

      {success || error ? (
        <p
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            error
              ? "border-rose-300 bg-rose-50 text-rose-800"
              : "border-emerald-300 bg-emerald-50 text-emerald-800"
          }`}
        >
          {error ?? success}
        </p>
      ) : null}

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
          Connect an Existing Donor
        </h2>
        <p className="mt-1 text-sm text-[var(--bits-muted)]">
          The person must sign in to BITS once before their email can be found.
        </p>
        <form action={linkExistingDonorAction} className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Unlinked donor</span>
            <select name="donorId" required className="w-full rounded-lg border border-[var(--bits-border)] px-3 py-2">
              <option value="">Choose a donor</option>
              {unlinked.map((donor) => (
                <option key={donor.id} value={donor.id}>
                  {donor.lastName}, {donor.firstName}
                  {donor.email ? ` · ${donor.email}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Signed-in account email</span>
            <input name="accountEmail" type="email" required autoComplete="email" className="w-full rounded-lg border border-[var(--bits-border)] px-3 py-2" />
          </label>
          <button type="submit" className="rounded-lg bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white">
            Connect Account
          </button>
        </form>
        {unlinked.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--bits-muted)]">
            There are no unlinked donor records yet. Use the form below to
            create the first one.
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
          Create and Connect a Donor
        </h2>
        <form action={createLinkedDonorAction} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">Signed-in account email</span>
            <input name="accountEmail" type="email" required autoComplete="email" className="w-full rounded-lg border border-[var(--bits-border)] px-3 py-2" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">First name</span>
            <input name="firstName" required autoComplete="given-name" className="w-full rounded-lg border border-[var(--bits-border)] px-3 py-2" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Last name</span>
            <input name="lastName" required autoComplete="family-name" className="w-full rounded-lg border border-[var(--bits-border)] px-3 py-2" />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">Phone (optional)</span>
            <input name="phone" type="tel" autoComplete="tel" className="w-full rounded-lg border border-[var(--bits-border)] px-3 py-2" />
          </label>
          <button type="submit" className="rounded-lg bg-[var(--bits-gold)] px-4 py-3 text-sm font-bold text-[var(--bits-navy-deep)] sm:col-span-2">
            Create Donor and Connect Account
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
          Current Connections
        </h2>
        <ul className="mt-3 divide-y divide-[var(--bits-border)] text-sm">
          {data.donors.filter((donor) => donor.userAccount).map((donor) => (
            <li key={donor.id} className="flex flex-wrap justify-between gap-2 py-3">
              <span className="font-medium">{donor.firstName} {donor.lastName}</span>
              <span className="text-[var(--bits-muted)]">{donor.userAccount?.primaryEmail}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
