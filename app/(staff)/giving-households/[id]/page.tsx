import Link from "next/link";

import { GivingHouseholdForm } from "@/components/giving-households/giving-household-form";
import { GivingHouseholdMembershipPanel } from "@/components/giving-households/giving-household-membership-panel";
import {
  emptyGivingHousehold,
  givingHouseholdUpdatedAtToken,
  type GivingHouseholdFormValues,
} from "@/lib/validation/giving-household";
import {
  GivingHouseholdError,
  getGivingHousehold,
} from "@/server/services/giving-household.service";

export default async function GivingHouseholdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let data;
  try {
    data = await getGivingHousehold(id);
  } catch (error) {
    if (!(error instanceof GivingHouseholdError)) throw error;
    return <p role="alert">{error.message}</p>;
  }

  const { household, canEdit, organization } = data;
  const values: GivingHouseholdFormValues = {
    ...emptyGivingHousehold,
    displayName: household.displayName,
    mailingAddressLine1: household.mailingAddressLine1,
    mailingAddressLine2: household.mailingAddressLine2 ?? "",
    city: household.city,
    state: household.state,
    postalCode: household.postalCode,
    country: household.country,
    statementDeliveryMethod: household.statementDeliveryMethod ?? "",
    active: household.active,
    primaryDonorId: household.primaryDonorId ?? "",
    preferredStatementRecipientId: household.preferredStatementRecipientId ?? "",
  };

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-semibold text-[var(--bits-navy)]">
        {household.displayName}
      </h1>
      <p className="text-sm text-[var(--bits-muted)]">
        {household.active ? "Active" : "Inactive"}
        {data.needsRecipientReview ? " · Needs preferred recipient review" : ""}
      </p>
      {canEdit ? (
        <GivingHouseholdForm
          organizationId={organization.id}
          id={household.id}
          values={values}
          expectedUpdatedAt={givingHouseholdUpdatedAtToken(household.updatedAt)}
          canAssignFinancial={data.canAssignFinancial}
          canViewHouseholdStatements={data.canViewHouseholdStatements}
          eligibleDonors={data.eligibleDonors}
          needsRecipientReview={data.needsRecipientReview}
        />
      ) : (
        <div className="space-y-3 rounded-xl border bg-white p-6">
          <p>
            {[
              household.mailingAddressLine1,
              household.mailingAddressLine2,
              household.city,
              household.state,
              household.postalCode,
              household.country,
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
          {data.canViewHouseholdStatements ? (
            <Link className="block underline" href={`/statements/households/${household.id}`}>
              Open household statement preview
            </Link>
          ) : null}
          <Link className="underline" href="/giving-households">
            Back to giving households
          </Link>
        </div>
      )}
      <GivingHouseholdMembershipPanel
        organizationId={organization.id}
        householdId={household.id}
        canEdit={canEdit}
        canBackdate={data.canBackdate}
        churchToday={data.churchToday}
        memberships={household.memberships}
        unassignedDonors={{
          message: "",
          q: data.unassignedDonors.q,
          page: data.unassignedDonors.page,
          total: data.unassignedDonors.total,
          selectedId: "",
          rows: data.unassignedDonors.rows.map((row) => ({
            id: row.id,
            label: `${row.lastName}, ${row.firstName}${row.email ? ` · ${row.email}` : ""}`,
          })),
        }}
        moveTargets={{
          message: "",
          q: data.moveTargets.q,
          page: data.moveTargets.page,
          total: data.moveTargets.total,
          selectedId: "",
          rows: data.moveTargets.rows.map((row) => ({
            id: row.id,
            label: row.displayName,
          })),
        }}
      />
    </div>
  );
}
