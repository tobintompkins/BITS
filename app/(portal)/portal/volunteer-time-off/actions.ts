"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  cancelVolunteerTimeOffRequest,
  submitVolunteerTimeOffRequest,
} from "@/server/services/volunteer-time-off-request.service";

function resultUrl(type: "success" | "error", message: string) {
  const params = new URLSearchParams({ [type]: message });
  return `/portal/volunteer-time-off?${params.toString()}`;
}

const submitMessages = {
  SIGNED_OUT: "You must be signed in.",
  NO_ORGANIZATION: "The church organization has not been configured.",
  CONNECTION_PENDING:
    "Your account must be connected to your church membership record first.",
  OVERLAP:
    "You already have an open request that overlaps these dates.",
  NOT_FOUND: "That request is not available.",
} as const;

export async function submitVolunteerTimeOffRequestAction(formData: FormData) {
  const result = await submitVolunteerTimeOffRequest({
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    memberReason: formData.get("memberReason"),
  });

  if (result.status === "CREATED") {
    revalidatePath("/portal/volunteer-time-off");
    redirect(resultUrl("success", "Your time-off request was submitted."));
  }

  if (result.status === "INVALID") {
    redirect(resultUrl("error", result.message));
  }

  redirect(
    resultUrl(
      "error",
      submitMessages[result.status as keyof typeof submitMessages] ??
        "Unable to submit that request.",
    ),
  );
}

export async function cancelVolunteerTimeOffRequestAction(formData: FormData) {
  const result = await cancelVolunteerTimeOffRequest({
    requestId: formData.get("requestId"),
  });

  if (result.status === "CANCELLED") {
    revalidatePath("/portal/volunteer-time-off");
    redirect(resultUrl("success", "Your time-off request was cancelled."));
  }

  redirect(
    resultUrl(
      "error",
      result.status === "NOT_FOUND"
        ? "That request is not available to cancel."
        : submitMessages[result.status as keyof typeof submitMessages] ??
          "Unable to cancel that request.",
    ),
  );
}
