import { createHash } from "node:crypto";

import Decimal from "decimal.js";

import { parseCreateOperationToken } from "@/lib/batches/create-operation-token";
import type { ManualBatchDonationWriteInput } from "@/lib/validation/manual-batch-donation";

export { parseCreateOperationToken };

export const CREATE_MANUAL_BATCH_DONATION_ACTION = "CREATE_MANUAL_BATCH_DONATION";

function canonicalMoney(value: string | number | Decimal | null) {
  if (value == null) return null;
  return new Decimal(value.toString()).toFixed(2);
}

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
    deductibleAmount: canonicalMoney(input.deductibleAmount),
    goodsOrServicesProvided: input.goodsOrServicesProvided,
    goodsOrServicesDescription: input.goodsOrServicesDescription,
    goodsOrServicesEstimatedValue: canonicalMoney(
      input.goodsOrServicesEstimatedValue,
    ),
    intangibleReligiousBenefitsOnly: input.intangibleReligiousBenefitsOnly,
    allocations: [...input.allocations]
      .map((row) => ({
        offeringTypeId: row.offeringTypeId,
        amount: canonicalMoney(row.amount),
      }))
      .sort((left, right) =>
        left.offeringTypeId.localeCompare(right.offeringTypeId),
      ),
    totalAmount: canonicalMoney(input.totalAmount),
  };
  return createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
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
