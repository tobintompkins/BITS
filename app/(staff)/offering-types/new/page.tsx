import { OfferingTypeForm } from "@/components/offering-types/offering-type-form";
import {
  OfferingTypeError,
  requireOfferingTypeAccess,
} from "@/server/services/offering-type.service";

export default async function NewOfferingTypePage() {
  let access;
  try {
    access = await requireOfferingTypeAccess(true);
  } catch (error) {
    if (!(error instanceof OfferingTypeError)) throw error;
    return <p role="alert">{error.message}</p>;
  }

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-semibold text-[var(--bits-navy)]">
        Add offering type
      </h1>
      <OfferingTypeForm organizationId={access.organization.id} />
    </div>
  );
}
