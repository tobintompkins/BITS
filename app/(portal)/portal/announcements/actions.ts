"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { memberAnnouncementsHref } from "@/lib/validation/member-announcements";
import { markMemberAnnouncementRead } from "@/server/services/member-announcement-read.service";

export async function markMemberAnnouncementReadAction(formData: FormData) {
  const pageRaw = String(formData.get("page") ?? "1");
  const page = Number.parseInt(pageRaw, 10);
  const result = await markMemberAnnouncementRead({
    announcementId: String(formData.get("announcementId") ?? ""),
  });

  if (result.status === "SIGNED_OUT") redirect("/sign-in");

  revalidatePath("/portal/announcements");
  redirect(memberAnnouncementsHref(Number.isFinite(page) ? page : 1));
}
