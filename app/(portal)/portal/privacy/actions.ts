"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { submitMemberPrivacyDataRequest } from "@/server/services/member-privacy-data-request.service";

function redirectWithNotice(notice: string): never {
  redirect(`/portal/privacy?notice=${notice}`);
}

export async function submitMemberPrivacyDataRequestAction(formData: FormData) {
  const result = await submitMemberPrivacyDataRequest({
    requestType: String(formData.get("requestType") ?? ""),
    memberNote: String(formData.get("memberNote") ?? ""),
  });

  if (result.status === "SIGNED_OUT") redirect("/sign-in");
  if (result.status === "NO_ORGANIZATION") {
    redirectWithNotice("no-organization");
  }
  if (result.status === "INVALID") {
    redirectWithNotice("invalid");
  }
  if (result.status === "DUPLICATE") {
    redirectWithNotice("duplicate");
  }

  revalidatePath("/portal/privacy");
  redirectWithNotice("submitted");
}
