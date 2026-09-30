"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { CHURCH_SERVICE_ALERTS_HREF } from "@/lib/validation/church-service-alert";
import {
  archiveChurchServiceAlert,
  createChurchServiceAlert,
  publishChurchServiceAlert,
  updateChurchServiceAlert,
} from "@/server/services/church-service-alert.service";

function resultUrl(type: "success" | "error", message: string) {
  const params = new URLSearchParams({ [type]: message });
  return `${CHURCH_SERVICE_ALERTS_HREF}?${params.toString()}`;
}

function fail(status: string): never {
  const messages: Record<string, string> = {
    SIGNED_OUT: "You must be signed in.",
    NO_ORGANIZATION: "The church organization has not been configured.",
    UNAUTHORIZED: "You do not have permission to manage church service alerts.",
    INVALID: "Check the type, title, message, and start/expiry times.",
    NOT_FOUND: "That service alert is not available.",
  };
  redirect(
    resultUrl("error", messages[status] ?? "Unable to save that service alert."),
  );
}

function fields(formData: FormData) {
  return {
    alertId: formData.get("alertId"),
    alertType: formData.get("alertType"),
    title: formData.get("title"),
    message: formData.get("message"),
    startsAt: formData.get("startsAt"),
    expiresAt: formData.get("expiresAt"),
  };
}

function revalidate() {
  revalidatePath(CHURCH_SERVICE_ALERTS_HREF);
  revalidatePath("/");
}

export async function createChurchServiceAlertAction(formData: FormData) {
  const result = await createChurchServiceAlert(fields(formData));
  if (result.status === "CREATED") {
    revalidate();
    redirect(resultUrl("success", "Draft service alert saved. It is not public yet."));
  }
  fail(result.status);
}

export async function updateChurchServiceAlertAction(formData: FormData) {
  const result = await updateChurchServiceAlert(fields(formData));
  if (result.status === "UPDATED") {
    revalidate();
    redirect(resultUrl("success", "Draft service alert updated."));
  }
  fail(result.status);
}

export async function publishChurchServiceAlertAction(formData: FormData) {
  const values = fields(formData);
  let alertId = typeof values.alertId === "string" ? values.alertId.trim() : "";

  if (!alertId) {
    const created = await createChurchServiceAlert(values);
    if (created.status !== "CREATED") {
      fail(created.status);
    }
    alertId = created.alertId;
  }

  const result = await publishChurchServiceAlert({ ...values, alertId });
  if (result.status === "PUBLISHED") {
    revalidate();
    redirect(
      resultUrl(
        "success",
        "Service alert published. It will appear on the public home page while it is active.",
      ),
    );
  }
  fail(result.status);
}

export async function archiveChurchServiceAlertAction(formData: FormData) {
  const result = await archiveChurchServiceAlert({
    alertId: formData.get("alertId"),
  });
  if (result.status === "ARCHIVED") {
    revalidate();
    redirect(
      resultUrl(
        "success",
        "Service alert archived. It is no longer shown on the public home page.",
      ),
    );
  }
  fail(result.status);
}
