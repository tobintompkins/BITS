import Link from "next/link";
import { redirect } from "next/navigation";

import { HouseholdDirectory } from "@/components/households/household-directory";
import { getGivingAccess } from "@/lib/auth/giving-permissions";
import {
  getHouseholdAccess,
  requireHouseholdViewAccess,
} from "@/lib/auth/household-permissions";
import { currentStatementYear } from "@/lib/validation/statement-readiness";
import { getHouseholds } from "@/app/(staff)/household/actions";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";
import { listHouseholdsForStatementPreview } from "@/server/services/household-statement-preview.service";

type HouseholdsPageProps = {
  searchParams: Promise<{ search?: string }>;
};

export default async function HouseholdsPage({
  searchParams,
}: HouseholdsPageProps) {
  const organization = await findPrimaryOrganization();

  if (!organization) {
    redirect("/settings/organization");
  }

  await requireHouseholdViewAccess(organization.id);
  const access = await getHouseholdAccess(organization.id);
  const givingAccess = await getGivingAccess(organization.id);
  const { search } = await searchParams;
  const households = await getHouseholds({ search });
  const statementYear = currentStatementYear();
  const givingHouseholds = givingAccess.canViewStatements
    ? await listHouseholdsForStatementPreview()
    : [];

  return (
    <div className="space-y-6">
      <HouseholdDirectory households={households} canCreate={access.canCreate} />
      {givingAccess.canViewStatements ? (
        <section
          id="giving-household-statements"
          className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm"
        >
          <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
            Giving household statements
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
            Preview official household contribution statements for {statementYear}.
            This does not create or publish a statement.
          </p>
          {givingHouseholds.length ? (
            <ul className="mt-4 divide-y divide-[var(--bits-border)] text-sm">
              {givingHouseholds.map((household) => (
                <li
                  key={household.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <p className="font-medium text-[var(--bits-navy)]">
                    {household.displayName}
                  </p>
                  <Link
                    href={`/statements/households/${household.id}?year=${statementYear}`}
                    className="font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                  >
                    Preview household statement
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-[var(--bits-muted)]">
              No giving households are on file yet.
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
