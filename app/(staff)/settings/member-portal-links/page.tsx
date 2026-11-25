import { connectPersonRecordsAction, createLinkedDonorAction } from "./actions";

import { getPortalLinkAdminData } from "@/server/services/member-portal-link.service";

const fieldClass = "w-full rounded-lg border border-[var(--bits-border)] px-3 py-2";

export default async function MemberPortalLinksPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const [{ success, error }, data] = await Promise.all([
    searchParams,
    getPortalLinkAdminData(),
  ]);
  const unlinkedDonors = data.donors.filter((donor) => !donor.userAccountId);
  const unlinkedMembers = data.members.filter((member) => !member.userAccountId);
  const unlinkedProfiles = data.profiles.filter((profile) => !profile.linkedUserAccountId);

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
          Connect one BITS account in {data.organizationName} to the existing donor, membership, and church profile that belong to that person. The connection uses the account id. A matching name or email does not connect a record, and this page does not merge records.
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
          Connect existing records
        </h2>
        <p className="mt-1 text-sm leading-6 text-[var(--bits-muted)]">
          Choose the account and every unlinked record that belongs to that person. Giving, statements, household, training, and ministry then use those same links.
        </p>
        <form action={connectPersonRecordsAction} className="mt-4 grid gap-4">
          <label className="space-y-1 text-sm">
            <span className="font-medium">BITS account</span>
            <select name="userAccountId" required className={fieldClass}>
              <option value="">Choose an account</option>
              {data.accounts.map((membership) => (
                <option key={membership.userAccount.id} value={membership.userAccount.id}>
                  {membership.userAccount.displayName || "Church member"}
                  {membership.userAccount.primaryEmail ? ` · ${membership.userAccount.primaryEmail}` : ""}
                  {membership.active && membership.churchAccess === "ACTIVE" ? "" : " · closed"}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Donor record</span>
            <select name="donorId" className={fieldClass}>
              <option value="">Leave unconnected</option>
              {unlinkedDonors.map((donor) => (
                <option key={donor.id} value={donor.id}>
                  {donor.lastName}, {donor.firstName}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Membership record</span>
            <select name="memberId" className={fieldClass}>
              <option value="">Leave unconnected</option>
              {unlinkedMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.lastName}, {member.firstName}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Church profile</span>
            <select name="profileId" className={fieldClass}>
              <option value="">Leave unconnected</option>
              {unlinkedProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.officialName}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-start gap-2 text-sm text-[var(--bits-navy)]">
            <input type="checkbox" name="confirmed" required />
            I confirm these records belong to the selected account.
          </label>
          <button type="submit" className="w-fit rounded-lg bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white">
            Connect selected records
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
          Create a donor when none exists
        </h2>
        <p className="mt-1 text-sm leading-6 text-[var(--bits-muted)]">
          Use this only when the person has no donor record. It does not create gifts, a household, training, or a ministry assignment.
        </p>
        <form action={createLinkedDonorAction} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">BITS account</span>
            <select name="userAccountId" required className={fieldClass}>
              <option value="">Choose an account</option>
              {data.accounts.filter((membership) => membership.userAccount.active).map((membership) => (
                <option key={membership.userAccount.id} value={membership.userAccount.id}>
                  {membership.userAccount.displayName || "Church member"}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">First name</span>
            <input name="firstName" required autoComplete="given-name" className={fieldClass} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Last name</span>
            <input name="lastName" required autoComplete="family-name" className={fieldClass} />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">Phone (optional)</span>
            <input name="phone" type="tel" autoComplete="tel" className={fieldClass} />
          </label>
          <button type="submit" className="rounded-lg bg-[var(--bits-gold)] px-4 py-3 text-sm font-bold text-[var(--bits-navy-deep)] sm:col-span-2">
            Create donor and connect account
          </button>
        </form>
      </section>
    </div>
  );
}
