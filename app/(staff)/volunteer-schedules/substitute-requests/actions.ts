"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { reviewVolunteerSubstituteRequest } from "@/server/services/volunteer-substitute-request.service";

function resultUrl(type: "success" | "error", message: string) {
  const params = new URLSearchParams({ [type]: message });
  return `/volunteer-schedules/substitute-requests?${params.toString()}`;
}

const reviewMessages = {
  SIGNED_OUT: "You must be signed in.",
  NO_ORGANIZATION: "The church organization has not been configured.",
  UNAUTHORIZED: "You do not have permission to review substitute requests.",
  INVALID: "Choose a valid review status.",
  NOT_FOUND: "That request is not available to update.",
} as const;

export async function reviewVolunteerSubstituteRequestAction(
  formData: FormData,
) {
  const result = await reviewVolunteerSubstituteRequest({
    requestId: formData.get("requestId"),
    status: formData.get("status"),
    staffResolutionNote: formData.get("staffResolutionNote"),
  });

  if (result.status === "UPDATED") {
    revalidatePath("/volunteer-schedules/substitute-requests");
    revalidatePath("/portal/volunteer-schedule");
    redirect(resultUrl("success", "Substitute request updated."));
  }

  redirect(
    resultUrl(
      "error",
      reviewMessages[result.status as keyof typeof reviewMessages] ??
        "Unable to update that request.",
    ),
  );
}
