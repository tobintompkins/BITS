import { OfferingBatchStatus } from "@/app/generated/prisma/client";

import {
  BATCH_INTEGRITY_MESSAGES,
  type BatchIntegrityIssue,
} from "@/lib/batches/integrity";

export type BatchNextStepAction =
  | "add"
  | "complete"
  | "reconcile"
  | "deposit"
  | "lock"
  | "review"
  | "view";

/** Role permission, integrity block, locked history, or directory uncertainty. */
export type BatchGuidanceTone =
  | "action"
  | "blocked"
  | "readonly"
  | "locked"
  | "uncertain";

export type BatchNextStep = {
  action: BatchNextStepAction;
  label: string;
  tone: BatchGuidanceTone;
  explanation: string;
};

type StagePermission = {
  canAddDonations: boolean;
  canCompleteEntry: boolean;
  canReconcile: boolean;
  canRecordDeposit: boolean;
  canLock: boolean;
};

type GuidanceInput = {
  permitted: StagePermission;
  /**
   * True only when this surface used the same checks as review/transition.
   * Directory reconcile/lock stay false because gift and deposit integrity
   * are not loaded with the page of batches.
   */
  confirmed: StagePermission;
  depositRecorded: boolean;
  isLocked: boolean;
  integrity: "unknown" | "known";
  issues: BatchIntegrityIssue[];
};

const DEPOSIT_ISSUES = new Set<BatchIntegrityIssue>([
  "DEPOSIT_REQUIRED",
  "DEPOSIT_DATE_BEFORE_OFFERING",
  "DEPOSIT_DATE_IN_FUTURE",
]);

const ROLE_LIMIT =
  "You can view this batch. Your role cannot change it at this stage.";

function actionStep(
  action: BatchNextStepAction,
  label: string,
): BatchNextStep {
  return { action, label, tone: "action", explanation: "" };
}

function issueSentences(issues: BatchIntegrityIssue[]) {
  return issues
    .filter((issue) => issue !== "INVALID_STATUS" && issue !== "CONCURRENT_CHANGE")
    .map((issue) => BATCH_INTEGRITY_MESSAGES[issue]);
}

function presentBatchGuidance(input: GuidanceInput): BatchNextStep {
  if (input.isLocked) {
    return {
      action: "view",
      label: "Locked history",
      tone: "locked",
      explanation:
        "This batch is locked. Gifts, deposit information, and totals stay as recorded. A correction request does not rewrite them.",
    };
  }

  if (input.confirmed.canAddDonations) {
    return actionStep("add", "Enter gifts");
  }
  if (input.confirmed.canCompleteEntry) {
    return actionStep("complete", "Complete Entry");
  }
  if (input.confirmed.canReconcile) {
    return actionStep("reconcile", "Reconcile");
  }
  if (input.confirmed.canRecordDeposit && !input.depositRecorded) {
    return actionStep("deposit", "Record deposit");
  }
  if (input.confirmed.canLock) {
    return actionStep("lock", "Lock batch");
  }

  if (input.integrity === "unknown") {
    const uncertain =
      (input.permitted.canReconcile && !input.confirmed.canReconcile) ||
      (input.permitted.canCompleteEntry &&
        !input.confirmed.canCompleteEntry &&
        !input.confirmed.canAddDonations) ||
      (input.permitted.canLock &&
        !input.confirmed.canLock &&
        (input.depositRecorded || !input.confirmed.canRecordDeposit));
    if (uncertain) {
      return {
        action: "review",
        label: "Review batch",
        tone: "uncertain",
        explanation: "",
      };
    }
  }

  const blockedStage = input.permitted.canReconcile && !input.confirmed.canReconcile
    ? "Reconcile"
    : input.permitted.canLock && !input.confirmed.canLock
      ? "Lock"
      : input.permitted.canCompleteEntry && !input.confirmed.canCompleteEntry
        ? "Complete Entry"
        : null;

  if (input.integrity === "known" && blockedStage) {
    const sentences = issueSentences(input.issues);
    const listed = sentences.join(" ");
    const depositOnly =
      blockedStage === "Lock" &&
      input.issues.length > 0 &&
      input.issues.every((issue) => DEPOSIT_ISSUES.has(issue)) &&
      input.permitted.canRecordDeposit;
    if (depositOnly) {
      return {
        action: "deposit",
        label: "Review deposit",
        tone: "blocked",
        explanation: listed
          ? `${listed} Lock stays unavailable until the deposit date and reference are valid.`
          : "Lock stays unavailable until the deposit date and reference are valid.",
      };
    }

    const resolution =
      blockedStage === "Complete Entry"
        ? "Complete Entry stays unavailable until this is resolved. An authorized staff member must correct the batch before entry can be completed."
        : `${blockedStage} stays unavailable. Gift entry and batch edits are closed on this batch, so those records cannot be changed here. An authorized staff member must resolve the issue before the batch can move forward.`;
    return {
      action: "view",
      label: `${blockedStage} unavailable`,
      tone: "blocked",
      explanation: listed ? `${listed} ${resolution}` : resolution,
    };
  }

  if (
    input.confirmed.canRecordDeposit &&
    input.depositRecorded &&
    !input.permitted.canLock
  ) {
    return actionStep("deposit", "Review deposit");
  }

  return {
    action: "view",
    label: "View only",
    tone: "readonly",
    explanation: ROLE_LIMIT,
  };
}

export function directoryBatchNextStep(
  access: {
    canAddBatchDonations: boolean;
    canCompleteBatchEntry: boolean;
    canReconcileBatches: boolean;
    canRecordBatchDeposits: boolean;
    canLockBatches: boolean;
  },
  row: {
    status: OfferingBatchStatus;
    depositDate: Date | null;
    depositReference?: string | null;
  },
): BatchNextStep {
  const draft = row.status === OfferingBatchStatus.DRAFT;
  const entered = row.status === OfferingBatchStatus.ENTERED;
  const reconciled = row.status === OfferingBatchStatus.RECONCILED;
  const depositRecorded = Boolean(row.depositDate && row.depositReference?.trim());
  const permitted = {
    canAddDonations: access.canAddBatchDonations && draft,
    canCompleteEntry: access.canCompleteBatchEntry && draft,
    canReconcile: access.canReconcileBatches && entered,
    canRecordDeposit: access.canRecordBatchDeposits && reconciled,
    canLock: access.canLockBatches && reconciled,
  };
  return presentBatchGuidance({
    permitted,
    confirmed: {
      canAddDonations: permitted.canAddDonations,
      canCompleteEntry: false,
      canReconcile: false,
      canRecordDeposit: permitted.canRecordDeposit,
      canLock: false,
    },
    depositRecorded,
    isLocked: row.status === OfferingBatchStatus.LOCKED,
    integrity: "unknown",
    issues: [],
  });
}

export function batchNextStep(input: {
  canAddDonations: boolean;
  showCompleteEntry: boolean;
  canCompleteEntry: boolean;
  showReconcile: boolean;
  canReconcile: boolean;
  showDepositForm: boolean;
  canRecordDeposit: boolean;
  showLock: boolean;
  canLock: boolean;
  depositRecorded: boolean;
  isLocked: boolean;
  issues: BatchIntegrityIssue[];
}): BatchNextStep {
  return presentBatchGuidance({
    permitted: {
      canAddDonations: input.canAddDonations,
      canCompleteEntry: input.showCompleteEntry,
      canReconcile: input.showReconcile,
      canRecordDeposit: input.showDepositForm,
      canLock: input.showLock,
    },
    confirmed: {
      canAddDonations: input.canAddDonations,
      canCompleteEntry: input.canCompleteEntry,
      canReconcile: input.canReconcile,
      canRecordDeposit: input.canRecordDeposit,
      canLock: input.canLock,
    },
    depositRecorded: input.depositRecorded,
    isLocked: input.isLocked,
    integrity: "known",
    issues: input.issues,
  });
}

export function batchNextStepHref(batchId: string, step: BatchNextStep) {
  if (step.action === "add") {
    return `/batches/${batchId}/donations/new`;
  }
  return `/batches/${batchId}`;
}
