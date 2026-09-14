import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { OfferingBatchForm } from "@/components/batches/offering-batch-form";
import { toOfferingBatchFormValues } from "@/lib/validation/offering-batch";
import {
  OfferingBatchError,
  getOfferingBatchDetail,
} from "@/server/services/offering-batch.service";

export default async function EditOfferingBatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let detail;
  try {
    detail = await getOfferingBatchDetail(id);
  } catch (error) {
    if (error instanceof OfferingBatchError && error.code === "FORBIDDEN") {
      redirect("/dashboard");
    }
    if (error instanceof OfferingBatchError && error.code === "SIGNED_OUT") {
      redirect("/sign-in");
    }
    if (error instanceof OfferingBatchError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  if (!detail.canEdit) {
    redirect(`/batches/${detail.batch.id}`);
  }

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={`/batches/${detail.batch.id}`}
          className="text-sm font-medium text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          ← Back to {detail.batch.name}
        </Link>
        <p className="mt-4 text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Giving
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Edit Offering Batch
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          Only draft batches can be edited. Recorded totals, deposits, and
          status are not changed here.
        </p>
      </header>

      <OfferingBatchForm
        mode="edit"
        batchId={detail.batch.id}
        initialValues={toOfferingBatchFormValues(detail.batch)}
        canEdit
      />
    </div>
  );
}
