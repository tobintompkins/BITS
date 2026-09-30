"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { DATA_RETENTION_POLICIES_HREF } from "@/lib/validation/data-retention-policy";
import {
  createDataRetentionPolicy,
  deactivateDataRetentionPolicy,
  reactivateDataRetentionPolicy,
  updateDataRetentionPolicy,
} from "@/server/services/data-retention-policy.service";

function resultUrl(type: "success" | "error", message: string) {
  const params = new URLSearchParams({ [type]: message });
  return `${DATA_RETENTION_POLICIES_HREF}?${params.toString()}`;
}

const sharedMessages = {
  SIGNED_OUT: "You must be signed in.",
  NO_ORGANIZATION: "The church organization has not been configured.",
  UNAUTHORIZED: "You do not have permission to manage data retention policies.",
  INVALID: "Check the category, title, summary, and retention period.",
  NOT_FOUND: "That data retention policy is not available.",
  DUPLICATE_CATEGORY:
    "A policy already exists for that category. Update the existing policy instead.",
} as const;

function fail(status: string) {
  redirect(
    resultUrl(
      "error",
      sharedMessages[status as keyof typeof sharedMessages] ??
        "Unable to save that data retention policy.",
    ),
  );
}

function revalidate() {
  revalidatePath(DATA_RETENTION_POLICIES_HREF);
}

export async function createDataRetentionPolicyAction(formData: FormData) {
  const result = await createDataRetentionPolicy({
    category: formData.get("category"),
    title: formData.get("title"),
    policySummary: formData.get("policySummary"),
    retentionPeriodMonths: formData.get("retentionPeriodMonths"),
    reviewDueAt: formData.get("reviewDueAt"),
  });

  if (result.status === "CREATED") {
    revalidate();
    redirect(
      resultUrl(
        "success",
        "Retention policy saved. No church records were deleted.",
      ),
    );
  }

  fail(result.status);
}

export async function updateDataRetentionPolicyAction(formData: FormData) {
  const result = await updateDataRetentionPolicy({
    policyId: formData.get("policyId"),
    title: formData.get("title"),
    policySummary: formData.get("policySummary"),
    retentionPeriodMonths: formData.get("retentionPeriodMonths"),
    reviewDueAt: formData.get("reviewDueAt"),
  });

  if (result.status === "UPDATED") {
    revalidate();
    redirect(
      resultUrl(
        "success",
        "Retention policy updated. No church records were deleted.",
      ),
    );
  }

  fail(result.status);
}

export async function deactivateDataRetentionPolicyAction(formData: FormData) {
  const result = await deactivateDataRetentionPolicy({
    policyId: formData.get("policyId"),
  });

  if (result.status === "DEACTIVATED") {
    revalidate();
    redirect(resultUrl("success", "Retention policy deactivated."));
  }

  fail(result.status);
}

export async function reactivateDataRetentionPolicyAction(formData: FormData) {
  const result = await reactivateDataRetentionPolicy({
    policyId: formData.get("policyId"),
  });

  if (result.status === "REACTIVATED") {
    revalidate();
    redirect(resultUrl("success", "Retention policy reactivated."));
  }

  fail(result.status);
}
