"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  archiveVolunteerTrainingRecord,
  createVolunteerTrainingRecord,
  restoreVolunteerTrainingRecord,
  updateVolunteerTrainingRecord,
} from "@/server/services/volunteer-training.service";

function resultUrl(type: "success" | "error", message: string) {
  const params = new URLSearchParams({ [type]: message });
  return `/volunteer-training?${params.toString()}`;
}

const sharedMessages = {
  SIGNED_OUT: "You must be signed in.",
  NO_ORGANIZATION: "The church organization has not been configured.",
  UNAUTHORIZED: "You do not have permission to manage volunteer training.",
  INVALID: "Check the training title and dates.",
  NOT_FOUND: "That volunteer or training record is not available.",
  MINISTRY_MISMATCH:
    "That volunteer is not on the selected ministry roster.",
} as const;

export async function createVolunteerTrainingRecordAction(formData: FormData) {
  const result = await createVolunteerTrainingRecord({
    memberId: formData.get("memberId"),
    ministryId: formData.get("ministryId"),
    title: formData.get("title"),
    completedOn: formData.get("completedOn"),
    expiresOn: formData.get("expiresOn"),
  });

  if (result.status === "CREATED") {
    revalidatePath("/volunteer-training");
    redirect(resultUrl("success", "Training record saved."));
  }

  redirect(
    resultUrl(
      "error",
      sharedMessages[result.status as keyof typeof sharedMessages] ??
        "Unable to save that training record.",
    ),
  );
}

export async function updateVolunteerTrainingRecordAction(formData: FormData) {
  const result = await updateVolunteerTrainingRecord({
    recordId: formData.get("recordId"),
    title: formData.get("title"),
    completedOn: formData.get("completedOn"),
    expiresOn: formData.get("expiresOn"),
  });

  if (result.status === "UPDATED") {
    revalidatePath("/volunteer-training");
    redirect(resultUrl("success", "Training record updated."));
  }

  redirect(
    resultUrl(
      "error",
      sharedMessages[result.status as keyof typeof sharedMessages] ??
        "Unable to update that training record.",
    ),
  );
}

export async function archiveVolunteerTrainingRecordAction(formData: FormData) {
  const result = await archiveVolunteerTrainingRecord({
    recordId: formData.get("recordId"),
  });

  if (result.status === "ARCHIVED") {
    revalidatePath("/volunteer-training");
    redirect(resultUrl("success", "Training record archived."));
  }

  redirect(
    resultUrl(
      "error",
      sharedMessages[result.status as keyof typeof sharedMessages] ??
        "Unable to archive that training record.",
    ),
  );
}

export async function restoreVolunteerTrainingRecordAction(formData: FormData) {
  const result = await restoreVolunteerTrainingRecord({
    recordId: formData.get("recordId"),
  });

  if (result.status === "RESTORED") {
    revalidatePath("/volunteer-training");
    redirect(resultUrl("success", "Training record restored."));
  }

  redirect(
    resultUrl(
      "error",
      sharedMessages[result.status as keyof typeof sharedMessages] ??
        "Unable to restore that training record.",
    ),
  );
}
