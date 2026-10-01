import Link from "next/link";
import { OfferingTypeForm } from "@/components/offering-types/offering-type-form";
import {
  emptyOfferingType,
  offeringTypeUpdatedAtToken,
  type OfferingTypeFormValues,
} from "@/lib/validation/offering-type";
import {
  OfferingTypeError,
  getOfferingType,
} from "@/server/services/offering-type.service";

export default async function OfferingTypePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let data;
  try {
    data = await getOfferingType(id);
  } catch (error) {
    if (!(error instanceof OfferingTypeError)) throw error;
    return <p role="alert">{error.message}</p>;
  }

  const { offeringType, canEdit, organization, allocationCount } = data;
  const values: OfferingTypeFormValues = {
    ...emptyOfferingType,
    name: offeringType.name,
    description: offeringType.description ?? "",
    code: offeringType.code ?? "",
    defaultTaxDeductible: offeringType.defaultTaxDeductible,
    onlineGivingEnabled: offeringType.onlineGivingEnabled,
    displayOrder: String(offeringType.displayOrder),
    active: offeringType.active,
  };

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-semibold text-[var(--bits-navy)]">
        {offeringType.name}
      </h1>
      <p className="text-sm text-[var(--bits-muted)]">
        {offeringType.active ? "Active" : "Inactive"}
        {offeringType.code ? ` · ${offeringType.code}` : ""}
        {` · ${allocationCount} recorded allocation${allocationCount === 1 ? "" : "s"}`}
      </p>
      {canEdit ? (
        <OfferingTypeForm
          organizationId={organization.id}
          id={offeringType.id}
          values={values}
          expectedUpdatedAt={offeringTypeUpdatedAtToken(offeringType.updatedAt)}
          codeLocked={Boolean(offeringType.code)}
          allocationCount={allocationCount}
        />
      ) : (
        <div className="space-y-3 rounded-xl border bg-white p-6">
          <p>{offeringType.description || "No description"}</p>
          <p>
            Online giving: {offeringType.onlineGivingEnabled ? "Yes" : "No"}
          </p>
          <p>
            Normally tax-deductible:{" "}
            {offeringType.defaultTaxDeductible ? "Yes" : "No"}
          </p>
          <p>Display order: {offeringType.displayOrder}</p>
          <Link className="underline" href="/offering-types">
            Back to offering types
          </Link>
        </div>
      )}
    </div>
  );
}
