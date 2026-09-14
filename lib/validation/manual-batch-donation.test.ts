import { describe, expect, it } from "vitest";

import {
  manualBatchDonationWriteSchema,
  parseBatchDonationListQuery,
} from "./manual-batch-donation";

const fundA = "00000000-0000-4000-8000-00000000f001";
const fundB = "00000000-0000-4000-8000-00000000f002";
const donorId = "00000000-0000-4000-8000-00000000d001";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    donorId,
    anonymous: false,
    offeringDate: "2026-09-06",
    receivedDate: "2026-09-06",
    confirmOfferingDateOverride: false,
    paymentMethod: "CASH",
    checkNumber: "",
    reference: "",
    note: "",
    isTaxDeductible: true,
    deductibleAmount: "25.00",
    goodsOrServicesProvided: false,
    goodsOrServicesDescription: "",
    goodsOrServicesEstimatedValue: "",
    intangibleReligiousBenefitsOnly: false,
    allocations: [{ offeringTypeId: fundA, amount: "25.00" }],
    ...overrides,
  };
}

describe("manual batch donation validation", () => {
  it("accepts a valid cash donation and computes the total from allocations", () => {
    const parsed = manualBatchDonationWriteSchema.safeParse(validInput());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.totalAmount).toBe("25.00");
      expect(parsed.data.donorId).toBe(donorId);
      expect(parsed.data.checkNumber).toBeNull();
      expect("stripeCheckoutSessionId" in parsed.data).toBe(false);
    }
  });

  it("forces donorId null for anonymous gifts and requires a donor otherwise", () => {
    const anonymous = manualBatchDonationWriteSchema.safeParse(
      validInput({ anonymous: true, donorId: "" }),
    );
    expect(anonymous.success).toBe(true);
    if (anonymous.success) expect(anonymous.data.donorId).toBeNull();

    expect(
      manualBatchDonationWriteSchema.safeParse(
        validInput({ anonymous: true, donorId }),
      ).success,
    ).toBe(false);
    expect(
      manualBatchDonationWriteSchema.safeParse(validInput({ donorId: "" }))
        .success,
    ).toBe(false);
  });

  it("rejects CARD and ACH and requires a check number only for CHECK", () => {
    expect(
      manualBatchDonationWriteSchema.safeParse(
        validInput({ paymentMethod: "CARD" }),
      ).success,
    ).toBe(false);
    expect(
      manualBatchDonationWriteSchema.safeParse(
        validInput({ paymentMethod: "ACH" }),
      ).success,
    ).toBe(false);
    expect(
      manualBatchDonationWriteSchema.safeParse(
        validInput({ paymentMethod: "CHECK", checkNumber: "" }),
      ).success,
    ).toBe(false);
    expect(
      manualBatchDonationWriteSchema.safeParse(
        validInput({ paymentMethod: "CASH", checkNumber: "101" }),
      ).success,
    ).toBe(false);
    const check = manualBatchDonationWriteSchema.safeParse(
      validInput({ paymentMethod: "CHECK", checkNumber: "101" }),
    );
    expect(check.success).toBe(true);
  });

  it("rejects duplicate funds, non-positive allocations, and invalid deductibility", () => {
    expect(
      manualBatchDonationWriteSchema.safeParse(
        validInput({
          allocations: [
            { offeringTypeId: fundA, amount: "10.00" },
            { offeringTypeId: fundA, amount: "15.00" },
          ],
        }),
      ).success,
    ).toBe(false);
    expect(
      manualBatchDonationWriteSchema.safeParse(
        validInput({ allocations: [{ offeringTypeId: fundA, amount: "0.00" }] }),
      ).success,
    ).toBe(false);
    expect(
      manualBatchDonationWriteSchema.safeParse(
        validInput({ deductibleAmount: "30.00" }),
      ).success,
    ).toBe(false);
    const nonDeductible = manualBatchDonationWriteSchema.safeParse(
      validInput({ isTaxDeductible: false, deductibleAmount: "0.00" }),
    );
    expect(nonDeductible.success).toBe(true);
    if (nonDeductible.success) {
      expect(nonDeductible.data.deductibleAmount).toBe("0.00");
    }
    expect(
      manualBatchDonationWriteSchema.safeParse(
        validInput({ isTaxDeductible: false, deductibleAmount: "5.00" }),
      ).success,
    ).toBe(false);
  });

  it("requires goods or services details when that box is checked", () => {
    expect(
      manualBatchDonationWriteSchema.safeParse(
        validInput({ goodsOrServicesProvided: true }),
      ).success,
    ).toBe(false);
    expect(
      manualBatchDonationWriteSchema.safeParse(
        validInput({
          goodsOrServicesProvided: true,
          goodsOrServicesDescription: "Dinner",
          goodsOrServicesEstimatedValue: "40.00",
        }),
      ).success,
    ).toBe(false);
    const valid = manualBatchDonationWriteSchema.safeParse(
      validInput({
        goodsOrServicesProvided: true,
        goodsOrServicesDescription: "Dinner",
        goodsOrServicesEstimatedValue: "10.00",
        allocations: [
          { offeringTypeId: fundA, amount: "15.00" },
          { offeringTypeId: fundB, amount: "10.00" },
        ],
        deductibleAmount: "25.00",
      }),
    );
    expect(valid.success).toBe(true);
    if (valid.success) expect(valid.data.totalAmount).toBe("25.00");
  });

  it("validates donation list pagination", () => {
    const parsed = parseBatchDonationListQuery({ donationsPage: "2" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.page).toBe(2);
    expect(parseBatchDonationListQuery({ donationsPage: "0" }).success).toBe(
      false,
    );
  });
});
