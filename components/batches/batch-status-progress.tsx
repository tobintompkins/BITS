import { OfferingBatchStatus } from "@/app/generated/prisma/client";

import { batchStatusLabel } from "@/lib/batches/display";

const STEPS = [
  OfferingBatchStatus.DRAFT,
  OfferingBatchStatus.ENTERED,
  OfferingBatchStatus.RECONCILED,
  OfferingBatchStatus.LOCKED,
] as const;

export function BatchStatusProgress({
  status,
}: {
  status: OfferingBatchStatus | string;
}) {
  const currentIndex = STEPS.indexOf(status as (typeof STEPS)[number]);

  return (
    <ol
      className="flex flex-wrap items-center gap-2 text-sm"
      aria-label="Batch status progress"
    >
      {STEPS.map((step, index) => {
        const isCurrent = step === status;
        const isComplete = currentIndex > index;
        return (
          <li key={step} className="flex items-center gap-2">
            {index > 0 ? (
              <span aria-hidden className="text-[var(--bits-muted)]">
                →
              </span>
            ) : null}
            <span
              className={
                isCurrent
                  ? "rounded-full bg-[var(--bits-navy)] px-3 py-1 text-xs font-bold text-white"
                  : isComplete
                    ? "rounded-full bg-[var(--bits-gold)]/20 px-3 py-1 text-xs font-bold text-[var(--bits-navy)]"
                    : "rounded-full bg-[var(--bits-bg)] px-3 py-1 text-xs font-bold text-[var(--bits-muted)]"
              }
              aria-current={isCurrent ? "step" : undefined}
            >
              {batchStatusLabel(step)}
              <span className="sr-only">
                {isCurrent ? ", current status" : isComplete ? ", completed" : ", later"}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
