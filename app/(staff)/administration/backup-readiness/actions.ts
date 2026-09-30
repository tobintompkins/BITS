"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { BACKUP_READINESS_HREF } from "@/lib/validation/backup-readiness";
import { createBackupReadinessLog } from "@/server/services/backup-readiness.service";

function resultUrl(type: "success" | "error", message: string) {
  const params = new URLSearchParams({ [type]: message });
  return `${BACKUP_READINESS_HREF}?${params.toString()}`;
}

function fail(status: string) {
  const messages: Record<string, string> = {
    SIGNED_OUT: "You must be signed in.",
    NO_ORGANIZATION: "The church organization has not been configured.",
    UNAUTHORIZED:
      "You do not have permission to record backup readiness checks.",
    INVALID: "Check the scope, result, and dates before recording a check.",
  };
  redirect(resultUrl("error", messages[status] ?? "Unable to record that check."));
}

export async function createBackupReadinessLogAction(formData: FormData) {
  const result = await createBackupReadinessLog({
    scope: formData.get("scope"),
    result: formData.get("result"),
    checkedAt: formData.get("checkedAt"),
    nextReviewAt: formData.get("nextReviewAt"),
    storageSummary: formData.get("storageSummary"),
    notes: formData.get("notes"),
  });

  if (result.status === "CREATED") {
    revalidatePath(BACKUP_READINESS_HREF);
    redirect(
      resultUrl(
        "success",
        "Backup check recorded. BITS did not create or verify a backup from this entry.",
      ),
    );
  }

  fail(result.status);
}
