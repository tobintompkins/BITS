import { describe, expect, it, vi } from "vitest";

import {
  emptyManualBatchDonationFormValues,
  manualBatchDonationFormSchema,
} from "@/lib/validation/manual-batch-donation";
import {
  allocationRowBindings,
  applyDottedFieldErrors,
  collectManualDonationFieldErrors,
  describedFieldBinding,
  donorSearchFeedback,
  DONOR_SEARCH_EMPTY_STATUS,
  OFFERING_DATE_CONFIRMATION_MESSAGE,
  offeringDateConfirmationFieldErrors,
  shouldClearCreateOperationToken,
  withOfferingDateConfirmation,
} from "@/lib/validation/manual-donation-field-errors";

const fundA = "00000000-0000-4000-8000-00000000f001";
const fundB = "00000000-0000-4000-8000-00000000f002";
const donorId = "00000000-0000-4000-8000-00000000d001";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    ...emptyManualBatchDonationFormValues("2026-09-06"),
    donorId,
    deductibleAmount: "25.00",
    allocations: [{ offeringTypeId: fundA, amount: "25.00" }],
    ...overrides,
  };
}

describe("manual donation field-error presentation", () => {
  it("keeps per-row fund and amount errors that flatten() collapses", () => {
    const parsed = manualBatchDonationFormSchema.safeParse(
      validInput({
        allocations: [
          { offeringTypeId: "", amount: "" },
          { offeringTypeId: fundB, amount: "0.00" },
        ],
      }),
    );
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const flattened = parsed.error.flatten().fieldErrors as Record<
      string,
      string[] | undefined
    >;
    expect(flattened.allocations).toEqual([
      "Choose a giving fund.",
      "Allocation amounts must be greater than zero.",
      "Allocation amounts must be greater than zero.",
    ]);
    expect(flattened["allocations.0.offeringTypeId"]).toBeUndefined();
    expect(flattened["allocations.0.amount"]).toBeUndefined();
    expect(flattened["allocations.1.amount"]).toBeUndefined();

    const collected = collectManualDonationFieldErrors(parsed.error);
    expect(collected["allocations.0.offeringTypeId"]).toEqual([
      "Choose a giving fund.",
    ]);
    expect(collected["allocations.0.amount"]).toEqual([
      "Allocation amounts must be greater than zero.",
    ]);
    expect(collected["allocations.1.amount"]).toEqual([
      "Allocation amounts must be greater than zero.",
    ]);
    expect(collected["allocations.1.offeringTypeId"]).toBeUndefined();
  });

  it("rejects invalid rows without producing a write payload", () => {
    const parsed = manualBatchDonationFormSchema.safeParse(
      validInput({
        allocations: [
          { offeringTypeId: "", amount: "10.00" },
          { offeringTypeId: fundA, amount: "-1" },
        ],
      }),
    );
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect("data" in parsed).toBe(false);
    expect(collectManualDonationFieldErrors(parsed.error)["allocations.0.offeringTypeId"]?.[0]).toBe(
      "Choose a giving fund.",
    );
  });

  it("binds row errors to stable field identity and rebinds after a row is removed", () => {
    const formId = "gift-form";
    const rows = [{ id: "row-a" }, { id: "row-b" }];
    const errors = {
      0: { offeringTypeId: { message: "Choose a giving fund." } },
      1: { amount: { message: "Allocation amounts must be greater than zero." } },
    };

    const before = rows.map((row, index) =>
      allocationRowBindings(formId, row.id, errors, index),
    );
    expect(before[0]?.offeringTypeId.invalid).toBe(true);
    expect(before[0]?.offeringTypeId.describedBy).toBe(
      "gift-form-allocation-row-a-fund-error",
    );
    expect(before[1]?.amount.describedBy).toBe(
      "gift-form-allocation-row-b-amount-error",
    );
    expect(before[0]?.offeringTypeId.errorId).not.toBe(before[1]?.amount.errorId);

    const afterRemoveFirst = allocationRowBindings(
      formId,
      "row-b",
      { 0: errors[1] },
      0,
    );
    expect(afterRemoveFirst.fieldIdentity).toBe("row-b");
    expect(afterRemoveFirst.amount.message).toBe(
      "Allocation amounts must be greater than zero.",
    );
    expect(afterRemoveFirst.amount.errorId).toBe(
      "gift-form-allocation-row-b-amount-error",
    );
    expect(afterRemoveFirst.offeringTypeId.invalid).toBeUndefined();

    const cleared = allocationRowBindings(formId, "row-b", {}, 0);
    expect(cleared.amount.message).toBeUndefined();
    expect(cleared.amount.invalid).toBeUndefined();
    expect(cleared.amount.describedBy).toBeUndefined();
  });

  it("associates donor, date, check, deductible, goods, and date-confirmation errors", () => {
    const donor = describedFieldBinding("donor-error", "Select a donor or mark the gift as anonymous.");
    expect(donor.invalid).toBe(true);
    expect(donor.describedBy).toBe("donor-error");

    const dateHelp = "offering-date-help";
    const date = describedFieldBinding("offering-date-error", "Enter a valid date.", dateHelp);
    expect(date.describedBy).toBe("offering-date-error offering-date-help");

    const check = describedFieldBinding("check-error", "Enter a check number.");
    expect(check.message).toBe("Enter a check number.");

    const deductible = describedFieldBinding(
      "deductible-error",
      "Deductible amount cannot exceed the donation total.",
    );
    expect(deductible.invalid).toBe(true);

    const goods = describedFieldBinding(
      "goods-error",
      "Describe the goods or services provided.",
    );
    expect(goods.describedBy).toBe("goods-error");

    const confirm = describedFieldBinding(
      "date-confirm-error",
      OFFERING_DATE_CONFIRMATION_MESSAGE,
    );
    expect(confirm.message).toBe(OFFERING_DATE_CONFIRMATION_MESSAGE);

    const parsed = withOfferingDateConfirmation("2026-09-06").safeParse(
      validInput({
        offeringDate: "2026-09-13",
        confirmOfferingDateOverride: false,
      }),
    );
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(
      collectManualDonationFieldErrors(parsed.error).confirmOfferingDateOverride,
    ).toEqual([OFFERING_DATE_CONFIRMATION_MESSAGE]);
  });

  it("does not treat empty donor search results as a donor-input validation failure", () => {
    const empty = donorSearchFeedback({
      failed: false,
      resultCount: 0,
      searched: true,
    });
    expect(empty).toEqual({
      kind: "status",
      message: DONOR_SEARCH_EMPTY_STATUS,
      invalidatesSearch: false,
    });

    const failed = donorSearchFeedback({
      failed: true,
      failureMessage: "Donor search failed.",
      resultCount: 0,
      searched: true,
    });
    expect(failed.kind).toBe("alert");
    expect(failed.invalidatesSearch).toBe(true);
  });

  it("applies dotted server keys and keeps a failed save from clearing the create token", () => {
    const applied: Array<{ name: string; message: string }> = [];
    applyDottedFieldErrors(
      {
        "allocations.0.offeringTypeId": ["Choose a giving fund."],
        "allocations.1.amount": ["Allocation amounts must be greater than zero."],
        confirmOfferingDateOverride: [OFFERING_DATE_CONFIRMATION_MESSAGE],
      },
      (name, error) => applied.push({ name, message: error.message }),
    );
    expect(applied).toEqual([
      { name: "allocations.0.offeringTypeId", message: "Choose a giving fund." },
      {
        name: "allocations.1.amount",
        message: "Allocation amounts must be greater than zero.",
      },
      {
        name: "confirmOfferingDateOverride",
        message: OFFERING_DATE_CONFIRMATION_MESSAGE,
      },
    ]);
    expect(
      offeringDateConfirmationFieldErrors(OFFERING_DATE_CONFIRMATION_MESSAGE),
    ).toEqual({
      confirmOfferingDateOverride: [OFFERING_DATE_CONFIRMATION_MESSAGE],
    });
    expect(
      shouldClearCreateOperationToken({ status: "error", isEdit: false }),
    ).toBe(false);
    expect(
      shouldClearCreateOperationToken({ status: "success", isEdit: false }),
    ).toBe(true);
    expect(
      shouldClearCreateOperationToken({ status: "success", isEdit: true }),
    ).toBe(false);
  });

  it("does not call a write callback when nested validation fails", () => {
    const write = vi.fn();
    const parsed = manualBatchDonationFormSchema.safeParse(
      validInput({
        allocations: [
          { offeringTypeId: "", amount: "5.00" },
          { offeringTypeId: fundA, amount: "0" },
        ],
      }),
    );
    if (!parsed.success) {
      expect(collectManualDonationFieldErrors(parsed.error)["allocations.1.amount"]?.[0]).toBe(
        "Allocation amounts must be greater than zero.",
      );
    } else {
      write(parsed.data);
    }
    expect(write).not.toHaveBeenCalled();
  });
});
