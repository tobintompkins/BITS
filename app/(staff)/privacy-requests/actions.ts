"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { updateStaffPrivacyDataRequestStatus } from "@/server/services/member-privacy-data-request.service";

function resultUrl(type: "success" | "error", message: string) {
  const params = new URLSearchParams({ [type]: message });
  return `/privacy-requests?${params.toString()}`;
}

export async function updatePrivacyRequestStatusAction(formData: FormData) {
  const result = await updateStaffPrivacyDataRequestStatus({
    requestId: String(formData.get("requestId") ?? ""),
    status: String(formData.get("status") ?? ""),
    staffResolutionNote: String(formData.get("staffResolutionNote") ?? ""),
  });

  if (result.status === "SIGNED_OUT") redirect("/sign-in");
  if (result.status === "FORBIDDEN") redirect("/dashboard");
  if (result.status === "NO_ORGANIZATION") {
    redirect(resultUrl("error", "The church organization has not been configured."));
  }
  if (result.status === "NOT_FOUND") {
    redirect(resultUrl("error", "That request could not be found."));
  }
  if (result.status === "INVALID") {
    redirect(
      resultUrl(
        "error",
        result.message ?? "Please choose a valid review status.",
      ),
    );
  }

  revalidatePath("/privacy-requests");
  redirect(resultUrl("success", "Request status updated."));
}
