import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DeleteHouseholdButton } from "@/components/households/delete-household-button";
import { HouseholdMemberTable } from "@/components/households/household-member-table";
import { getGivingAccess } from "@/lib/auth/giving-permissions";
import {
  getHouseholdAccess,
  requireHouseholdViewAccess,
} from "@/lib/auth/household-permissions";
import { getMemberDisplayName } from "@/lib/validation/member";
import { getHouseholdById } from "@/app/(staff)/household/actions";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type HouseholdDetailPageProps = {
  params: Promise<{ id: string }>;
};

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
        {value?.trim() ? value : "—"}
      </dd>
    </div>
  );
}

export default async function HouseholdDetailPage({
  params,
}: HouseholdDetailPageProps) {
  const { id } = await params;
  const organization = await findPrimaryOrganization();

  if (!organization) {
    redirect("/settings/organization");
  }

  await requireHouseholdViewAccess(organization.id);
  const access = await getHouseholdAccess(organization.id);
  const givingAccess = await getGivingAccess(organization.id);
  const household = await getHouseholdById(id);

  if (!household) {
    notFound();
  }

  const address = [
    household.addressLine1,
    household.addressLine2,
    [household.city, household.state, household.postalCode]
      .filter(Boolean)
      .join(", "),
    household.country,
  ]
    .filter((part) => part?.trim())
    .join("\n");

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Link
            href="/households"
            className="text-sm font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-300"
          >
            ← Back to Households
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
            {household.householdName}
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {household.memberLinks.length} member
            {household.memberLinks.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {givingAccess.canViewStatements ? (
            <Link
              href="/households#giving-household-statements"
              className="inline-flex items-center justify-center rounded-md border border-[var(--bits-border)] px-4 py-2 text-sm font-medium text-[var(--bits-navy)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              Preview household statement
            </Link>
          ) : null}
          {access.canEdit ? (
            <Link
              href={`/household/${household.id}/edit`}
              className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Edit Household
            </Link>
          ) : null}
          {access.canDelete ? (
            <DeleteHouseholdButton
              householdId={household.id}
              householdName={household.householdName}
            />
          ) : null}
        </div>
      </header>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <dl className="grid gap-4 sm:grid-cols-2">
          <DetailItem
            label="Primary Contact"
            value={
              household.primaryContact
                ? getMemberDisplayName(household.primaryContact)
                : null
            }
          />
          <DetailItem label="Address" value={address || null} />
        </dl>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Household Members
        </h2>
        <HouseholdMemberTable
          householdId={household.id}
          primaryContactId={household.primaryContactId}
          memberLinks={household.memberLinks}
          canEdit={access.canEdit}
        />
      </section>
    </div>
  );
}
