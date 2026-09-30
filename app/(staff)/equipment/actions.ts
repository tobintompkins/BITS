"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { EQUIPMENT_INVENTORY_HREF } from "@/lib/validation/equipment-inventory";
import {
  archiveEquipmentItem,
  createEquipmentItem,
  restoreEquipmentItem,
  updateEquipmentItem,
} from "@/server/services/equipment-inventory.service";

function resultUrl(type: "success" | "error", message: string) {
  const params = new URLSearchParams({ [type]: message });
  return `${EQUIPMENT_INVENTORY_HREF}?${params.toString()}`;
}

const sharedMessages = {
  SIGNED_OUT: "You must be signed in.",
  NO_ORGANIZATION: "The church organization has not been configured.",
  UNAUTHORIZED: "You do not have permission to manage equipment.",
  INVALID: "Check the equipment name, quantity, status, and condition.",
  NOT_FOUND: "That equipment record is not available.",
  DUPLICATE_ASSET_TAG: "That asset tag is already used in this church.",
} as const;

function fail(status: string) {
  redirect(
    resultUrl(
      "error",
      sharedMessages[status as keyof typeof sharedMessages] ??
        "Unable to save that equipment record.",
    ),
  );
}

export async function createEquipmentItemAction(formData: FormData) {
  const result = await createEquipmentItem({
    name: formData.get("name"),
    category: formData.get("category"),
    assetTag: formData.get("assetTag"),
    quantity: formData.get("quantity"),
    storageLocation: formData.get("storageLocation"),
    status: formData.get("status"),
    condition: formData.get("condition"),
    notes: formData.get("notes"),
  });

  if (result.status === "CREATED") {
    revalidatePath(EQUIPMENT_INVENTORY_HREF);
    redirect(resultUrl("success", "Equipment saved."));
  }

  fail(result.status);
}

export async function updateEquipmentItemAction(formData: FormData) {
  const result = await updateEquipmentItem({
    equipmentId: formData.get("equipmentId"),
    name: formData.get("name"),
    category: formData.get("category"),
    assetTag: formData.get("assetTag"),
    quantity: formData.get("quantity"),
    storageLocation: formData.get("storageLocation"),
    status: formData.get("status"),
    condition: formData.get("condition"),
    notes: formData.get("notes"),
  });

  if (result.status === "UPDATED") {
    revalidatePath(EQUIPMENT_INVENTORY_HREF);
    redirect(resultUrl("success", "Equipment updated."));
  }

  fail(result.status);
}

export async function archiveEquipmentItemAction(formData: FormData) {
  const result = await archiveEquipmentItem({
    equipmentId: formData.get("equipmentId"),
  });

  if (result.status === "ARCHIVED") {
    revalidatePath(EQUIPMENT_INVENTORY_HREF);
    redirect(resultUrl("success", "Equipment archived."));
  }

  fail(result.status);
}

export async function restoreEquipmentItemAction(formData: FormData) {
  const result = await restoreEquipmentItem({
    equipmentId: formData.get("equipmentId"),
  });

  if (result.status === "RESTORED") {
    revalidatePath(EQUIPMENT_INVENTORY_HREF);
    redirect(resultUrl("success", "Equipment restored."));
  }

  fail(result.status);
}
