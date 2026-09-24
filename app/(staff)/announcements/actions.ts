"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  archiveChurchAnnouncement,
  createDraftAnnouncement,
  publishChurchAnnouncement,
  updateDraftAnnouncement,
} from "@/server/services/church-announcement.service";

function resultUrl(type: "success" | "error", message: string) {
  const params = new URLSearchParams({ [type]: message });
  return `/announcements?${params.toString()}`;
}

function actionError(error: unknown, fallback: string) {
  return resultUrl(
    "error",
    error instanceof Error ? error.message : fallback,
  );
}

export async function createDraftAnnouncementAction(formData: FormData) {
  try {
    await createDraftAnnouncement({
      title: formData.get("title"),
      body: formData.get("body"),
    });
    revalidatePath("/announcements");
  } catch (error) {
    redirect(actionError(error, "Unable to save the draft announcement."));
  }
  redirect(resultUrl("success", "Draft announcement saved. It is not visible to members yet."));
}

export async function updateDraftAnnouncementAction(formData: FormData) {
  try {
    await updateDraftAnnouncement(formData.get("id"), {
      title: formData.get("title"),
      body: formData.get("body"),
    });
    revalidatePath("/announcements");
  } catch (error) {
    redirect(actionError(error, "Unable to update the draft announcement."));
  }
  redirect(resultUrl("success", "Draft announcement updated."));
}

export async function publishAnnouncementAction(formData: FormData) {
  try {
    await publishChurchAnnouncement(formData.get("id"));
    revalidatePath("/announcements");
  } catch (error) {
    redirect(actionError(error, "Unable to publish the announcement."));
  }
  redirect(
    resultUrl(
      "success",
      "Announcement published. It will be available to members when the portal list is added.",
    ),
  );
}

export async function archiveAnnouncementAction(formData: FormData) {
  try {
    await archiveChurchAnnouncement(formData.get("id"));
    revalidatePath("/announcements");
  } catch (error) {
    redirect(actionError(error, "Unable to archive the announcement."));
  }
  redirect(resultUrl("success", "Announcement archived. History was kept."));
}
