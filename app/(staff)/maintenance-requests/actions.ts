"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  EQUIPMENT_INVENTORY_REVALIDATE_HREF,
  MAINTENANCE_REQUESTS_HREF,
} from "@/lib/validation/maintenance-request";
import {
  changeMaintenanceRequestStatus,
  createMaintenanceRequest,
  updateMaintenanceRequest,
} from "@/server/services/maintenance-request.service";

function resultUrl(type: "success" | "error", message: string) {
  const params = new URLSearchParams({ [type]: message });
  return `${MAINTENANCE_REQUESTS_HREF}?${params.toString()}`;
}

const sharedMessages = {
  SIGNED_OUT: "You must be signed in.",
  NO_ORGANIZATION: "The church organization has not been configured.",
  UNAUTHORIZED: "You do not have permission to manage maintenance requests.",
  INVALID: "Check the title, description, and resolution note.",
  NOT_FOUND: "That maintenance request or equipment item is not available.",
} as const;

function fail(status: string) {
  redirect(
    resultUrl(
      "error",
      sharedMessages[status as keyof typeof sharedMessages] ??
        "Unable to save that maintenance request.",
    ),
  );
}

function revalidate() {
  revalidatePath(MAINTENANCE_REQUESTS_HREF);
  revalidatePath(EQUIPMENT_INVENTORY_REVALIDATE_HREF);
}

export async function createMaintenanceRequestAction(formData: FormData) {
  const result = await createMaintenanceRequest({
    title: formData.get("title"),
    description: formData.get("description"),
    locationDescription: formData.get("locationDescription"),
    priority: formData.get("priority"),
    equipmentItemId: formData.get("equipmentItemId"),
  });

  if (result.status === "CREATED") {
    revalidate();
    redirect(resultUrl("success", "Maintenance request saved."));
  }

  fail(result.status);
}

export async function updateMaintenanceRequestAction(formData: FormData) {
  const result = await updateMaintenanceRequest({
    requestId: formData.get("requestId"),
    title: formData.get("title"),
    description: formData.get("description"),
    locationDescription: formData.get("locationDescription"),
    priority: formData.get("priority"),
    equipmentItemId: formData.get("equipmentItemId"),
  });

  if (result.status === "UPDATED") {
    revalidate();
    redirect(resultUrl("success", "Maintenance request updated."));
  }

  fail(result.status);
}

export async function changeMaintenanceRequestStatusAction(formData: FormData) {
  const result = await changeMaintenanceRequestStatus({
    requestId: formData.get("requestId"),
    status: formData.get("status"),
    resolutionNote: formData.get("resolutionNote"),
  });

  if (result.status === "STATUS_CHANGED") {
    revalidate();
    redirect(resultUrl("success", "Maintenance request status updated."));
  }

  fail(result.status);
}
