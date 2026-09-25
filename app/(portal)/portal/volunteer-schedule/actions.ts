"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  cancelVolunteerSubstituteRequest,
  submitVolunteerSubstituteRequest,
} from "@/server/services/volunteer-substitute-request.service";

function resultUrl(type: "success" | "error", message: string) {
  const params = new URLSearchParams({ [type]: message });
  return `/portal/volunteer-schedule?${params.toString()}`;
}

const submitMessages = {
  SIGNED_OUT: "You must be signed in.",
  NO_ORGANIZATION: "The church organization has not been configured.",
  CONNECTION_PENDING:
    "Your account must be connected to your church membership record first.",
  NOT_FOUND: "That assignment is not available for a substitute request.",
  DUPLICATE: "You already have an open substitute request for this assignment.",
} as const;

export async function submitVolunteerSubstituteRequestAction(
  formData: FormData,
) {
  const result = await submitVolunteerSubstituteRequest({
    assignmentId: formData.get("assignmentId"),
    memberReason: formData.get("memberReason"),
  });

  if (result.status === "CREATED") {
    revalidatePath("/portal/volunteer-schedule");
    revalidatePath("/volunteer-schedules/substitute-requests");
    redirect(resultUrl("success", "Your substitute request was submitted."));
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

export async function cancelVolunteerSubstituteRequestAction(
  formData: FormData,
) {
  const result = await cancelVolunteerSubstituteRequest({
    requestId: formData.get("requestId"),
  });

  if (result.status === "CANCELLED") {
    revalidatePath("/portal/volunteer-schedule");
    revalidatePath("/volunteer-schedules/substitute-requests");
    redirect(resultUrl("success", "Your substitute request was cancelled."));
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
