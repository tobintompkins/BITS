"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { reviewVolunteerTimeOffRequest } from "@/server/services/volunteer-time-off-request.service";

function resultUrl(type: "success" | "error", message: string) {
  const params = new URLSearchParams({ [type]: message });
  return `/volunteer-time-off?${params.toString()}`;
}

const reviewMessages = {
  SIGNED_OUT: "You must be signed in.",
  NO_ORGANIZATION: "The church organization has not been configured.",
  UNAUTHORIZED: "You do not have permission to review time-off requests.",
  INVALID: "Choose a valid review status.",
  NOT_FOUND: "That request is not available to update.",
} as const;

export async function reviewVolunteerTimeOffRequestAction(formData: FormData) {
  const result = await reviewVolunteerTimeOffRequest({
    requestId: formData.get("requestId"),
    status: formData.get("status"),
    staffResolutionNote: formData.get("staffResolutionNote"),
  });

  if (result.status === "UPDATED") {
    revalidatePath("/volunteer-time-off");
    revalidatePath("/portal/volunteer-time-off");
    redirect(resultUrl("success", "Time-off request updated."));
  }

  redirect(
    resultUrl(
      "error",
      reviewMessages[result.status as keyof typeof reviewMessages] ??
        "Unable to update that request.",
    ),
  );
}
