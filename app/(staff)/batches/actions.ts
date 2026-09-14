"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import {
  createOfferingBatchActionState,
  offeringBatchFormSchema,
  type OfferingBatchActionState,
  type OfferingBatchFormValues,
} from "@/lib/validation/offering-batch";
import {
  createManualBatchDonationActionState,
  manualBatchDonationFormSchema,
  type ManualBatchDonationActionState,
  type ManualBatchDonationFormValues,
} from "@/lib/validation/manual-batch-donation";
import {
  ManualBatchDonationError,
  createManualBatchDonation,
  searchDonorsForBatchDonation,
} from "@/server/services/manual-batch-donation.service";
import {
  createOfferingBatchDepositActionState,
  offeringBatchDepositFormSchema,
  type OfferingBatchDepositActionState,
  type OfferingBatchDepositFormValues,
} from "@/lib/validation/offering-batch-deposit";
import { offeringBatchTransitionSchema } from "@/lib/validation/offering-batch-transition";
import {
  OfferingBatchDepositError,
  lockOfferingBatch,
  recordOfferingBatchDeposit,
} from "@/server/services/offering-batch-deposit.service";
import {
  OfferingBatchTransitionError,
  completeOfferingBatchEntry,
  reconcileOfferingBatch,
} from "@/server/services/offering-batch-transition.service";
import {
  OfferingBatchError,
  createOfferingBatch,
  updateDraftOfferingBatch,
} from "@/server/services/offering-batch.service";

function getFormValues(formData: FormData): OfferingBatchFormValues {
  return {
    name: String(formData.get("name") ?? ""),
    offeringDate: String(formData.get("offeringDate") ?? ""),
    serviceDescription: String(formData.get("serviceDescription") ?? ""),
    expectedTotal: String(formData.get("expectedTotal") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };
}

function revalidateBatchPaths(batchId?: string) {
  revalidatePath("/batches");
  if (batchId) {
    revalidatePath(`/batches/${batchId}`);
    revalidatePath(`/batches/${batchId}/edit`);
    revalidatePath(`/batches/${batchId}/donations/new`);
  }
}

function actionError(
  message: string,
  fieldErrors: OfferingBatchActionState["fieldErrors"] = {},
): OfferingBatchActionState {
  return {
    status: "error",
    message,
    fieldErrors,
  };
}

export async function createOfferingBatchAction(
  _previousState: OfferingBatchActionState,
  formData: FormData,
): Promise<OfferingBatchActionState> {
  const { userId } = await auth();
  if (!userId) {
    return actionError("You must be signed in to create offering batches.");
  }

  const values = getFormValues(formData);
  const parsed = offeringBatchFormSchema.safeParse(values);
  if (!parsed.success) {
    return actionError(
      "Please correct the highlighted fields and try again.",
      parsed.error.flatten().fieldErrors,
    );
  }

  try {
    const batch = await createOfferingBatch(parsed.data);
    revalidateBatchPaths(batch.id);
    return {
      status: "success",
      message: "Offering batch created.",
      batchId: batch.id,
      fieldErrors: {},
    };
  } catch (error) {
    if (error instanceof OfferingBatchError) {
      return actionError(error.message);
    }
    return actionError("Unable to create this offering batch.");
  }
}

export async function updateOfferingBatchAction(
  batchId: string,
  _previousState: OfferingBatchActionState,
  formData: FormData,
): Promise<OfferingBatchActionState> {
  const { userId } = await auth();
  if (!userId) {
    return actionError("You must be signed in to edit offering batches.");
  }

  const values = getFormValues(formData);
  const parsed = offeringBatchFormSchema.safeParse(values);
  if (!parsed.success) {
    return actionError(
      "Please correct the highlighted fields and try again.",
      parsed.error.flatten().fieldErrors,
    );
  }

  try {
    const batch = await updateDraftOfferingBatch(batchId, parsed.data);
    revalidateBatchPaths(batch.id);
    return {
      status: "success",
      message: "Offering batch updated.",
      batchId: batch.id,
      fieldErrors: {},
    };
  } catch (error) {
    if (error instanceof OfferingBatchError) {
      return actionError(error.message);
    }
    return actionError("Unable to update this offering batch.");
  }
}

export async function searchBatchDonationDonorsAction(query: string) {
  try {
    const donors = await searchDonorsForBatchDonation(query);
    return { ok: true as const, donors };
  } catch (error) {
    return {
      ok: false as const,
      donors: [],
      error:
        error instanceof ManualBatchDonationError
          ? error.message
          : "Donor search failed.",
    };
  }
}

export async function createManualBatchDonationAction(
  batchId: string,
  values: ManualBatchDonationFormValues,
): Promise<ManualBatchDonationActionState> {
  const { userId } = await auth();
  if (!userId) {
    return {
      status: "error",
      message: "You must be signed in to add donations.",
      fieldErrors: {},
    };
  }

  const parsed = manualBatchDonationFormSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const donation = await createManualBatchDonation(batchId, parsed.data);
    revalidateBatchPaths(batchId);
    return {
      status: "success",
      message: "Donation recorded.",
      donationId: donation.id,
      fieldErrors: {},
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof ManualBatchDonationError
          ? error.message
          : "Unable to record this donation.",
      fieldErrors: {},
    };
  }
}

export async function completeOfferingBatchEntryAction(batchId: string) {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false as const, error: "You must be signed in." };
  }
  const parsed = offeringBatchTransitionSchema.safeParse({ confirmed: true });
  if (!parsed.success) {
    return { ok: false as const, error: "Confirm this status change before saving." };
  }
  try {
    await completeOfferingBatchEntry(batchId, parsed.data);
    revalidateBatchPaths(batchId);
    return { ok: true as const, next: "entered" as const };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof OfferingBatchTransitionError
          ? error.message
          : "This batch could not be marked as entered.",
    };
  }
}

export async function saveBatchDepositAction(
  batchId: string,
  _previousState: OfferingBatchDepositActionState,
  formData: FormData,
): Promise<OfferingBatchDepositActionState> {
  const { userId } = await auth();
  if (!userId) {
    return {
      status: "error",
      message: "You must be signed in to record a deposit.",
      fieldErrors: {},
    };
  }

  const values: OfferingBatchDepositFormValues = {
    depositDate: String(formData.get("depositDate") ?? ""),
    depositReference: String(formData.get("depositReference") ?? ""),
  };
  const parsed = offeringBatchDepositFormSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const result = await recordOfferingBatchDeposit(batchId, parsed.data);
    revalidateBatchPaths(batchId);
    return {
      status: "success",
      message: result.unchanged
        ? "Deposit information is already up to date."
        : "Deposit information saved.",
      fieldErrors: {},
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof OfferingBatchDepositError
          ? error.message
          : "Unable to save this deposit.",
      fieldErrors: {},
    };
  }
}

export async function lockOfferingBatchAction(batchId: string) {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false as const, error: "You must be signed in." };
  }
  const parsed = offeringBatchTransitionSchema.safeParse({ confirmed: true });
  if (!parsed.success) {
    return { ok: false as const, error: "Confirm this status change before saving." };
  }
  try {
    await lockOfferingBatch(batchId, parsed.data);
    revalidateBatchPaths(batchId);
    return { ok: true as const, next: "locked" as const };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof OfferingBatchDepositError
          ? error.message
          : "This batch could not be locked.",
    };
  }
}

export async function reconcileOfferingBatchAction(batchId: string) {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false as const, error: "You must be signed in." };
  }
  const parsed = offeringBatchTransitionSchema.safeParse({ confirmed: true });
  if (!parsed.success) {
    return { ok: false as const, error: "Confirm this status change before saving." };
  }
  try {
    await reconcileOfferingBatch(batchId, parsed.data);
    revalidateBatchPaths(batchId);
    return { ok: true as const, next: "reconciled" as const };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof OfferingBatchTransitionError
          ? error.message
          : "This batch could not be reconciled.",
    };
  }
}

export {
  createManualBatchDonationActionState,
  createOfferingBatchActionState,
  createOfferingBatchDepositActionState,
};
