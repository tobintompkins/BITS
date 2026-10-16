import { createHash } from "node:crypto";

import type { ManualBatchDonationWriteInput } from "@/lib/validation/manual-batch-donation";

export const CREATE_MANUAL_BATCH_DONATION_ACTION = "CREATE_MANUAL_BATCH_DONATION";

export function fingerprintManualDonationPayload(
  input: ManualBatchDonationWriteInput,
) {
  const canonical = {
    donorId: input.donorId,
    anonymous: input.anonymous,
    offeringDate: input.offeringDate,
    receivedDate: input.receivedDate,
    paymentMethod: input.paymentMethod,
    checkNumber: input.checkNumber,
    reference: input.reference,
    note: input.note,
    isTaxDeductible: input.isTaxDeductible,
    deductibleAmount: input.deductibleAmount,
    goodsOrServicesProvided: input.goodsOrServicesProvided,
    goodsOrServicesDescription: input.goodsOrServicesDescription,
    goodsOrServicesEstimatedValue: input.goodsOrServicesEstimatedValue,
    intangibleReligiousBenefitsOnly: input.intangibleReligiousBenefitsOnly,
    allocations: [...input.allocations]
      .map((row) => ({
        offeringTypeId: row.offeringTypeId,
        amount: row.amount,
      }))
      .sort((left, right) =>
        left.offeringTypeId.localeCompare(right.offeringTypeId),
      ),
    totalAmount: input.totalAmount,
  };
  return createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
}

export function parseCreateOperationToken(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      trimmed,
    )
  ) {
    return null;
  }
  return trimmed.toLowerCase();
}

export function safeCreateDonationResult(input: {
  id: string;
  batchId: string;
  totalAmount: string;
}) {
  return {
    id: input.id,
    batchId: input.batchId,
    totalAmount: input.totalAmount,
  };
}
