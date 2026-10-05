import { GivingHouseholdForm } from "@/components/giving-households/giving-household-form";
import {
  GivingHouseholdError,
  requireGivingHouseholdAccess,
} from "@/server/services/giving-household.service";

export default async function NewGivingHouseholdPage() {
  let access;
  try {
    access = await requireGivingHouseholdAccess(true);
  } catch (error) {
    if (!(error instanceof GivingHouseholdError)) throw error;
    return <p role="alert">{error.message}</p>;
  }

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-semibold text-[var(--bits-navy)]">
        Add giving household
      </h1>
      <GivingHouseholdForm
        organizationId={access.organization.id}
        canAssignFinancial={access.canAssignFinancial}
        canViewHouseholdStatements={access.canViewHouseholdStatements}
      />
    </div>
  );
}
