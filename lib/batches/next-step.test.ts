import { describe, expect, it } from "vitest";

import { OfferingBatchStatus, RoleCode } from "@/app/generated/prisma/client";
import { getGivingCapabilitiesForRole } from "@/lib/auth/giving-permissions";

import { BATCH_INTEGRITY_MESSAGES } from "./integrity";
import {
  batchNextStep,
  batchNextStepHref,
  directoryBatchNextStep,
} from "./next-step";

const roles = [
  RoleCode.ORG_ADMIN,
  RoleCode.TREASURER,
  RoleCode.DATA_ENTRY,
  RoleCode.REPORT_VIEWER,
] as const;

function accessFor(role: RoleCode) {
  return getGivingCapabilitiesForRole(role);
}

function directoryStep(
  role: RoleCode,
  row: {
    status: OfferingBatchStatus;
    depositDate?: Date | null;
    depositReference?: string | null;
  },
) {
  return directoryBatchNextStep(accessFor(role), {
    status: row.status,
    depositDate: row.depositDate ?? null,
    depositReference: row.depositReference ?? null,
  });
}

describe("directory batch guidance", () => {
  it("keeps Enter gifts on editable drafts and view-only for report viewers", () => {
    for (const role of [RoleCode.ORG_ADMIN, RoleCode.TREASURER, RoleCode.DATA_ENTRY]) {
      expect(
        directoryStep(role, { status: OfferingBatchStatus.DRAFT }),
      ).toMatchObject({ action: "add", label: "Enter gifts", tone: "action" });
    }
    expect(
      directoryStep(RoleCode.REPORT_VIEWER, { status: OfferingBatchStatus.DRAFT }),
    ).toMatchObject({
      action: "view",
      label: "View only",
      tone: "readonly",
    });
  });

  it("does not claim Complete Entry when gift integrity was not loaded", () => {
    const step = directoryBatchNextStep(
      {
        canAddBatchDonations: false,
        canCompleteBatchEntry: true,
        canReconcileBatches: false,
        canRecordBatchDeposits: false,
        canLockBatches: false,
      },
      {
        status: OfferingBatchStatus.DRAFT,
        depositDate: null,
        depositReference: null,
      },
    );
    expect(step.action).toBe("review");
    expect(step.label).toBe("Review batch");
  });

  it("does not advertise reconcile or lock from stored totals", () => {
    const deposit = new Date("2026-09-06T00:00:00.000Z");
    for (const role of [RoleCode.ORG_ADMIN, RoleCode.TREASURER]) {
      const entered = directoryStep(role, { status: OfferingBatchStatus.ENTERED });
      const reconciled = directoryStep(role, {
        status: OfferingBatchStatus.RECONCILED,
        depositDate: deposit,
        depositReference: "SLIP-1",
      });
      expect(entered).toMatchObject({
        action: "review",
        label: "Review batch",
        tone: "uncertain",
      });
      expect(reconciled.action).not.toBe("lock");
      expect(reconciled.label).not.toBe("Lock batch");
      expect(reconciled).toMatchObject({
        action: "review",
        label: "Review batch",
      });
    }
  });

  it("offers Record deposit only when that matches review permission and no deposit exists", () => {
    for (const role of [RoleCode.ORG_ADMIN, RoleCode.TREASURER]) {
      expect(
        directoryStep(role, { status: OfferingBatchStatus.RECONCILED }),
      ).toMatchObject({ action: "deposit", label: "Record deposit", tone: "action" });
    }
    for (const role of [RoleCode.DATA_ENTRY, RoleCode.REPORT_VIEWER]) {
      expect(
        directoryStep(role, { status: OfferingBatchStatus.RECONCILED }),
      ).toMatchObject({ action: "view", tone: "readonly" });
      expect(
        directoryStep(role, { status: OfferingBatchStatus.ENTERED }).action,
      ).not.toBe("reconcile");
    }
  });

  it("uses locked-history guidance for every role", () => {
    for (const role of roles) {
      const step = directoryStep(role, { status: OfferingBatchStatus.LOCKED });
      expect(step).toMatchObject({
        action: "view",
        label: "Locked history",
        tone: "locked",
      });
      expect(step.explanation).not.toMatch(/your role/i);
    }
  });

  it("links gift entry to the donation form and other steps to the batch", () => {
    expect(
      batchNextStepHref("batch-1", {
        action: "add",
        label: "Enter gifts",
        tone: "action",
        explanation: "",
      }),
    ).toBe("/batches/batch-1/donations/new");
    expect(
      batchNextStepHref("batch-1", {
        action: "review",
        label: "Review batch",
        tone: "uncertain",
        explanation: "",
      }),
    ).toBe("/batches/batch-1");
  });
});

describe("detail batch guidance", () => {
  it("prefers Enter gifts over Complete Entry on an editable draft", () => {
    expect(
      batchNextStep({
        canAddDonations: true,
        showCompleteEntry: true,
        canCompleteEntry: true,
        showReconcile: false,
        canReconcile: false,
        showDepositForm: false,
        canRecordDeposit: false,
        showLock: false,
        canLock: false,
        depositRecorded: false,
        isLocked: false,
        issues: [],
      }).action,
    ).toBe("add");
  });

  it("explains an integrity block without blaming the role", () => {
    const step = batchNextStep({
      canAddDonations: false,
      showCompleteEntry: false,
      canCompleteEntry: false,
      showReconcile: true,
      canReconcile: false,
      showDepositForm: false,
      canRecordDeposit: false,
      showLock: false,
      canLock: false,
      depositRecorded: false,
      isLocked: false,
      issues: ["NO_DONATIONS", "BATCH_NOT_BALANCED"],
    });
    expect(step.action).not.toBe("reconcile");
    expect(step.tone).toBe("blocked");
    expect(step.label).toBe("Reconcile unavailable");
    expect(step.explanation).toContain(BATCH_INTEGRITY_MESSAGES.NO_DONATIONS);
    expect(step.explanation).toContain(BATCH_INTEGRITY_MESSAGES.BATCH_NOT_BALANCED);
    expect(step.explanation).not.toMatch(/your role/i);
    expect(step.explanation).not.toMatch(/enter gifts/i);
  });

  it("keeps a read-only role on read-only guidance when the batch is also blocked", () => {
    const step = batchNextStep({
      canAddDonations: false,
      showCompleteEntry: false,
      canCompleteEntry: false,
      showReconcile: false,
      canReconcile: false,
      showDepositForm: false,
      canRecordDeposit: false,
      showLock: false,
      canLock: false,
      depositRecorded: false,
      isLocked: false,
      issues: ["BATCH_NOT_BALANCED"],
    });
    expect(step).toMatchObject({
      action: "view",
      label: "View only",
      tone: "readonly",
    });
    expect(step.explanation).toMatch(/your role/i);
    expect(step.explanation).not.toContain(BATCH_INTEGRITY_MESSAGES.BATCH_NOT_BALANCED);
  });

  it("links a deposit the treasurer can still correct and does not offer Lock", () => {
    const step = batchNextStep({
      canAddDonations: false,
      showCompleteEntry: false,
      canCompleteEntry: false,
      showReconcile: false,
      canReconcile: false,
      showDepositForm: true,
      canRecordDeposit: true,
      showLock: true,
      canLock: false,
      depositRecorded: true,
      isLocked: false,
      issues: ["DEPOSIT_DATE_BEFORE_OFFERING"],
    });
    expect(step).toMatchObject({
      action: "deposit",
      label: "Review deposit",
      tone: "blocked",
    });
    expect(step.explanation).toContain(
      BATCH_INTEGRITY_MESSAGES.DEPOSIT_DATE_BEFORE_OFFERING,
    );
    expect(step.explanation).not.toMatch(/your role/i);
  });

  it("does not point allocation failures at the deposit form or gift entry", () => {
    const step = batchNextStep({
      canAddDonations: false,
      showCompleteEntry: false,
      canCompleteEntry: false,
      showReconcile: false,
      canReconcile: false,
      showDepositForm: true,
      canRecordDeposit: true,
      showLock: true,
      canLock: false,
      depositRecorded: true,
      isLocked: false,
      issues: ["ALLOCATION_TOTAL_MISMATCH", "DEPOSIT_DATE_IN_FUTURE"],
    });
    expect(step.action).toBe("view");
    expect(step.label).toBe("Lock unavailable");
    expect(step.explanation).toContain(
      BATCH_INTEGRITY_MESSAGES.ALLOCATION_TOTAL_MISMATCH,
    );
    expect(step.explanation).not.toMatch(/enter gifts/i);
  });
});
