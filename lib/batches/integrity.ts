import { OfferingBatchStatus } from "@/app/generated/prisma/client";

import {
  toDateOnlyString,
  utcTodayDateString,
} from "@/lib/batches/dates";
import {
  moneyDifference,
  moneyEquals,
  moneyIsPositive,
  sumMoneyAmounts,
} from "@/lib/money/decimal";

export const BATCH_INTEGRITY_ISSUES = [
  "NO_DONATIONS",
  "DONATION_WITHOUT_ALLOCATIONS",
  "ALLOCATION_TOTAL_MISMATCH",
  "BATCH_RECORDED_TOTAL_MISMATCH",
  "EXPECTED_TOTAL_REQUIRED",
  "BATCH_NOT_BALANCED",
  "RECORDED_TOTAL_NOT_POSITIVE",
  "DEPOSIT_REQUIRED",
  "DEPOSIT_DATE_BEFORE_OFFERING",
  "DEPOSIT_DATE_IN_FUTURE",
  "INVALID_STATUS",
  "CONCURRENT_CHANGE",
] as const;

export type BatchIntegrityIssue = (typeof BATCH_INTEGRITY_ISSUES)[number];

export const BATCH_INTEGRITY_MESSAGES: Record<BatchIntegrityIssue, string> = {
  NO_DONATIONS: "This batch has no donations.",
  DONATION_WITHOUT_ALLOCATIONS:
    "Every donation must have at least one fund allocation.",
  ALLOCATION_TOTAL_MISMATCH:
    "A donation total does not match its allocation sum.",
  BATCH_RECORDED_TOTAL_MISMATCH:
    "The recorded batch total does not match the donation totals.",
  EXPECTED_TOTAL_REQUIRED: "An expected total is required before reconciliation.",
  BATCH_NOT_BALANCED: "Expected and recorded totals must match exactly.",
  RECORDED_TOTAL_NOT_POSITIVE: "Recorded total must be greater than zero.",
  DEPOSIT_REQUIRED:
    "A deposit date and deposit reference are required before locking.",
  DEPOSIT_DATE_BEFORE_OFFERING:
    "Deposit date cannot be before the offering date.",
  DEPOSIT_DATE_IN_FUTURE: "Deposit date cannot be in the future.",
  INVALID_STATUS: "This batch is not in the required status.",
  CONCURRENT_CHANGE:
    "This batch changed while the request was running. Refresh and try again.",
};

export type BatchIntegrityDonation = {
  totalAmount: { toString(): string } | string;
  allocations: Array<{ amount: { toString(): string } | string }>;
};

export function evaluateDepositDates(input: {
  depositDate: Date | string;
  offeringDate: Date | string;
  today?: string;
}) {
  const issues: BatchIntegrityIssue[] = [];
  const depositDate = toDateOnlyString(input.depositDate);
  const offeringDate = toDateOnlyString(input.offeringDate);
  const today = input.today ?? utcTodayDateString();
  if (depositDate < offeringDate) {
    issues.push("DEPOSIT_DATE_BEFORE_OFFERING");
  }
  if (depositDate > today) {
    issues.push("DEPOSIT_DATE_IN_FUTURE");
  }
  return issues;
}

export function evaluateOfferingBatchIntegrity(input: {
  status: OfferingBatchStatus | string;
  expectedStatus: OfferingBatchStatus | string;
  expectedTotal: { toString(): string } | string | null;
  recordedTotal: { toString(): string } | string;
  donations: BatchIntegrityDonation[];
  requireBalancedExpected?: boolean;
  requirePositiveRecorded?: boolean;
  requireDeposit?: boolean;
  depositDate?: Date | string | null;
  depositReference?: string | null;
  offeringDate?: Date | string;
  today?: string;
}) {
  const issues: BatchIntegrityIssue[] = [];
  const expectedTotal =
    input.expectedTotal == null ? null : input.expectedTotal.toString();
  const recordedTotal = input.recordedTotal.toString();

  if (input.status !== input.expectedStatus) {
    issues.push("INVALID_STATUS");
  }
  if (input.donations.length === 0) {
    issues.push("NO_DONATIONS");
  }

  let allocationCount = 0;
  for (const donation of input.donations) {
    if (donation.allocations.length === 0) {
      issues.push("DONATION_WITHOUT_ALLOCATIONS");
    }
    allocationCount += donation.allocations.length;
    const allocationSum = sumMoneyAmounts(
      donation.allocations.map((row) => row.amount.toString()),
    );
    if (!moneyEquals(allocationSum, donation.totalAmount.toString())) {
      issues.push("ALLOCATION_TOTAL_MISMATCH");
    }
  }

  const donationTotal = sumMoneyAmounts(
    input.donations.map((donation) => donation.totalAmount.toString()),
  );
  if (
    input.donations.length > 0 &&
    !moneyEquals(donationTotal, recordedTotal)
  ) {
    issues.push("BATCH_RECORDED_TOTAL_MISMATCH");
  }

  if (input.requireBalancedExpected) {
    if (expectedTotal == null) {
      issues.push("EXPECTED_TOTAL_REQUIRED");
    } else if (!moneyEquals(expectedTotal, recordedTotal)) {
      issues.push("BATCH_NOT_BALANCED");
    }
  }

  if (input.requirePositiveRecorded && !moneyIsPositive(recordedTotal)) {
    issues.push("RECORDED_TOTAL_NOT_POSITIVE");
  }

  if (input.requireDeposit) {
    const depositReference = input.depositReference?.trim() || null;
    if (!input.depositDate || !depositReference) {
      issues.push("DEPOSIT_REQUIRED");
    } else if (input.offeringDate) {
      issues.push(
        ...evaluateDepositDates({
          depositDate: input.depositDate,
          offeringDate: input.offeringDate,
          today: input.today,
        }),
      );
    }
  }

  const uniqueIssues = [...new Set(issues)];
  return {
    ok: uniqueIssues.length === 0,
    issues: uniqueIssues,
    donationCount: input.donations.length,
    allocationCount,
    donationTotal,
    expectedTotal,
    recordedTotal,
    difference: moneyDifference(expectedTotal, recordedTotal),
  };
}
