import Link from "next/link";
import { redirect } from "next/navigation";

import { OfferingBatchForm } from "@/components/batches/offering-batch-form";
import { requireBatchManageAccess } from "@/lib/auth/giving-permissions";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export default async function NewOfferingBatchPage() {
  const organization = await findPrimaryOrganization();
  if (!organization) {
    redirect("/settings/organization");
  }

  try {
    await requireBatchManageAccess(organization.id);
  } catch {
    redirect("/batches");
  }

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/batches"
          className="text-sm font-medium text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          ← Back to Offering Batches
        </Link>
        <p className="mt-4 text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Giving
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Add Offering Batch
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          New batches start as drafts with a recorded total of zero. Donation
          entry is the next milestone.
        </p>
      </header>

      <OfferingBatchForm mode="create" canEdit />
    </div>
  );
}
