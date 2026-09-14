import { describe, expect, it } from "vitest";

import { OfferingBatchStatus } from "@/app/generated/prisma/client";

import { evaluateOfferingBatchIntegrity } from "./integrity";

function donation(total: string, allocations: string[]) {
  return {
    totalAmount: total,
    allocations: allocations.map((amount) => ({ amount })),
  };
}

describe("offering batch integrity", () => {
  it("accepts a balanced draft batch with matching allocations", () => {
    const result = evaluateOfferingBatchIntegrity({
      status: OfferingBatchStatus.DRAFT,
      expectedStatus: OfferingBatchStatus.DRAFT,
      expectedTotal: "25.00",
      recordedTotal: "25.00",
      donations: [donation("25.00", ["10.00", "15.00"])],
    });
    expect(result.ok).toBe(true);
    expect(result.donationCount).toBe(1);
    expect(result.allocationCount).toBe(2);
    expect(result.donationTotal).toBe("25.00");
  });

  it("reports empty batches and allocation problems without donor data", () => {
    expect(
      evaluateOfferingBatchIntegrity({
        status: OfferingBatchStatus.DRAFT,
        expectedStatus: OfferingBatchStatus.DRAFT,
        expectedTotal: null,
        recordedTotal: "0.00",
        donations: [],
      }).issues,
    ).toContain("NO_DONATIONS");

    const missingAllocations = evaluateOfferingBatchIntegrity({
      status: OfferingBatchStatus.DRAFT,
      expectedStatus: OfferingBatchStatus.DRAFT,
      expectedTotal: null,
      recordedTotal: "10.00",
      donations: [donation("10.00", [])],
    });
    expect(missingAllocations.issues).toContain("DONATION_WITHOUT_ALLOCATIONS");
    expect(JSON.stringify(missingAllocations)).not.toMatch(/@|check|stripe/i);

    expect(
      evaluateOfferingBatchIntegrity({
        status: OfferingBatchStatus.DRAFT,
        expectedStatus: OfferingBatchStatus.DRAFT,
        expectedTotal: null,
        recordedTotal: "10.00",
        donations: [donation("10.00", ["9.99"])],
      }).issues,
    ).toContain("ALLOCATION_TOTAL_MISMATCH");

    expect(
      evaluateOfferingBatchIntegrity({
        status: OfferingBatchStatus.DRAFT,
        expectedStatus: OfferingBatchStatus.DRAFT,
        expectedTotal: null,
        recordedTotal: "20.00",
        donations: [donation("10.00", ["10.00"])],
      }).issues,
    ).toContain("BATCH_RECORDED_TOTAL_MISMATCH");
  });

  it("requires a matching expected total only when reconciling", () => {
    const draftUnbalanced = evaluateOfferingBatchIntegrity({
      status: OfferingBatchStatus.DRAFT,
      expectedStatus: OfferingBatchStatus.DRAFT,
      expectedTotal: "30.00",
      recordedTotal: "25.00",
      donations: [donation("25.00", ["25.00"])],
    });
    expect(draftUnbalanced.ok).toBe(true);
    expect(draftUnbalanced.difference).toBe("5.00");

    const reconcile = evaluateOfferingBatchIntegrity({
      status: OfferingBatchStatus.ENTERED,
      expectedStatus: OfferingBatchStatus.ENTERED,
      expectedTotal: "30.00",
      recordedTotal: "25.00",
      donations: [donation("25.00", ["25.00"])],
      requireBalancedExpected: true,
    });
    expect(reconcile.issues).toContain("BATCH_NOT_BALANCED");

    expect(
      evaluateOfferingBatchIntegrity({
        status: OfferingBatchStatus.ENTERED,
        expectedStatus: OfferingBatchStatus.ENTERED,
        expectedTotal: null,
        recordedTotal: "25.00",
        donations: [donation("25.00", ["25.00"])],
        requireBalancedExpected: true,
      }).issues,
    ).toContain("EXPECTED_TOTAL_REQUIRED");
  });

  it("requires a positive recorded total and valid deposit before locking", () => {
    expect(
      evaluateOfferingBatchIntegrity({
        status: OfferingBatchStatus.RECONCILED,
        expectedStatus: OfferingBatchStatus.RECONCILED,
        expectedTotal: "0.00",
        recordedTotal: "0.00",
        donations: [donation("0.00", ["0.00"])],
        requireBalancedExpected: true,
        requirePositiveRecorded: true,
      }).issues,
    ).toContain("RECORDED_TOTAL_NOT_POSITIVE");

    expect(
      evaluateOfferingBatchIntegrity({
        status: OfferingBatchStatus.RECONCILED,
        expectedStatus: OfferingBatchStatus.RECONCILED,
        expectedTotal: "25.00",
        recordedTotal: "25.00",
        donations: [donation("25.00", ["25.00"])],
        requireBalancedExpected: true,
        requirePositiveRecorded: true,
        requireDeposit: true,
        depositDate: null,
        depositReference: null,
        offeringDate: "2026-09-06",
      }).issues,
    ).toContain("DEPOSIT_REQUIRED");

    expect(
      evaluateOfferingBatchIntegrity({
        status: OfferingBatchStatus.RECONCILED,
        expectedStatus: OfferingBatchStatus.RECONCILED,
        expectedTotal: "25.00",
        recordedTotal: "25.00",
        donations: [donation("25.00", ["25.00"])],
        requireBalancedExpected: true,
        requirePositiveRecorded: true,
        requireDeposit: true,
        depositDate: "2026-09-01",
        depositReference: "SLIP-1001",
        offeringDate: "2026-09-06",
      }).issues,
    ).toContain("DEPOSIT_DATE_BEFORE_OFFERING");

    const future = new Date();
    future.setUTCDate(future.getUTCDate() + 2);
    expect(
      evaluateOfferingBatchIntegrity({
        status: OfferingBatchStatus.RECONCILED,
        expectedStatus: OfferingBatchStatus.RECONCILED,
        expectedTotal: "25.00",
        recordedTotal: "25.00",
        donations: [donation("25.00", ["25.00"])],
        requireBalancedExpected: true,
        requirePositiveRecorded: true,
        requireDeposit: true,
        depositDate: future.toISOString().slice(0, 10),
        depositReference: "SLIP-1001",
        offeringDate: "2026-09-06",
      }).issues,
    ).toContain("DEPOSIT_DATE_IN_FUTURE");
  });

  it("rejects the wrong status", () => {
    expect(
      evaluateOfferingBatchIntegrity({
        status: OfferingBatchStatus.DRAFT,
        expectedStatus: OfferingBatchStatus.ENTERED,
        expectedTotal: "25.00",
        recordedTotal: "25.00",
        donations: [donation("25.00", ["25.00"])],
        requireBalancedExpected: true,
      }).issues,
    ).toContain("INVALID_STATUS");
  });
});
