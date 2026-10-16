import { describe, expect, it } from "vitest";

import {
  fingerprintManualDonationPayload,
  parseCreateOperationToken,
} from "./create-idempotency";

const fundA = "00000000-0000-4000-8000-00000000f001";
const fundB = "00000000-0000-4000-8000-00000000f002";

function payload() {
  return {
    donorId: "00000000-0000-4000-8000-00000000d001",
    anonymous: false,
    offeringDate: "2026-10-14",
    receivedDate: "2026-10-14",
    confirmOfferingDateOverride: false,
    paymentMethod: "CHECK" as const,
    checkNumber: "441",
    reference: null,
    note: null,
    isTaxDeductible: true,
    deductibleAmount: "30.00",
    goodsOrServicesProvided: false,
    goodsOrServicesDescription: null,
    goodsOrServicesEstimatedValue: null,
    intangibleReligiousBenefitsOnly: false,
    allocations: [
      { offeringTypeId: fundB, amount: "20.00" },
      { offeringTypeId: fundA, amount: "10.00" },
    ],
    totalAmount: "30.00",
  };
}

describe("manual gift create idempotency helpers", () => {
  it("canonicalizes allocation order before hashing", () => {
    const reversed = {
      ...payload(),
      allocations: [
        { offeringTypeId: fundA, amount: "10.00" },
        { offeringTypeId: fundB, amount: "20.00" },
      ],
    };
    expect(fingerprintManualDonationPayload(payload())).toBe(
      fingerprintManualDonationPayload(reversed),
    );
  });

  it("changes the fingerprint when the donor or split changes at the same total", () => {
    const sameTotalOtherDonor = {
      ...payload(),
      donorId: "00000000-0000-4000-8000-00000000d002",
    };
    const sameTotalOtherSplit = {
      ...payload(),
      allocations: [
        { offeringTypeId: fundA, amount: "15.00" },
        { offeringTypeId: fundB, amount: "15.00" },
      ],
    };
    expect(fingerprintManualDonationPayload(sameTotalOtherDonor)).not.toBe(
      fingerprintManualDonationPayload(payload()),
    );
    expect(fingerprintManualDonationPayload(sameTotalOtherSplit)).not.toBe(
      fingerprintManualDonationPayload(payload()),
    );
  });

  it("accepts only UUID operation tokens", () => {
    expect(
      parseCreateOperationToken("11111111-1111-4111-8111-111111111111"),
    ).toBe("11111111-1111-4111-8111-111111111111");
    expect(parseCreateOperationToken("not-a-token")).toBeNull();
    expect(parseCreateOperationToken("")).toBeNull();
  });
});
