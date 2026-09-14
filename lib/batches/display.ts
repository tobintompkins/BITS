import { OfferingBatchStatus } from "@/app/generated/prisma/client";

import { formatMoney } from "@/lib/money/decimal";

export function formatBatchDate(value: Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(value);
}

export function formatBatchMoney(value: string | null | undefined) {
  return formatMoney(value);
}

export function batchStatusLabel(status: OfferingBatchStatus | string) {
  switch (status) {
    case OfferingBatchStatus.DRAFT:
      return "Draft";
    case OfferingBatchStatus.ENTERED:
      return "Entered";
    case OfferingBatchStatus.RECONCILED:
      return "Reconciled";
    case OfferingBatchStatus.LOCKED:
      return "Locked";
    default:
      return status;
  }
}

export function paymentMethodLabel(method: string) {
  switch (method) {
    case "CASH":
      return "Cash";
    case "CHECK":
      return "Check";
    case "CARD":
      return "Card";
    case "ACH":
      return "ACH";
    case "STOCK_OR_NONCASH":
      return "Stock or non-cash";
    case "OTHER":
      return "Other";
    default:
      return method;
  }
}

export function batchStatusClassName(status: OfferingBatchStatus | string) {
  switch (status) {
    case OfferingBatchStatus.DRAFT:
      return "bg-amber-100 text-amber-900";
    case OfferingBatchStatus.ENTERED:
      return "bg-[var(--bits-navy)]/10 text-[var(--bits-navy)]";
    case OfferingBatchStatus.RECONCILED:
      return "bg-emerald-50 text-emerald-800";
    case OfferingBatchStatus.LOCKED:
      return "bg-slate-800 text-white";
    default:
      return "bg-[var(--bits-bg)] text-[var(--bits-navy)]";
  }
}
