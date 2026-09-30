"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  EQUIPMENT_CHECKOUT_HREF,
  EQUIPMENT_INVENTORY_REVALIDATE_HREF,
} from "@/lib/validation/equipment-checkout";
import {
  createEquipmentCheckout,
  returnEquipmentCheckout,
} from "@/server/services/equipment-checkout.service";

function resultUrl(type: "success" | "error", message: string) {
  const params = new URLSearchParams({ [type]: message });
  return `${EQUIPMENT_CHECKOUT_HREF}?${params.toString()}`;
}

const sharedMessages = {
  SIGNED_OUT: "You must be signed in.",
  NO_ORGANIZATION: "The church organization has not been configured.",
  UNAUTHORIZED: "You do not have permission to manage equipment check-out.",
  INVALID: "Check the equipment, quantity, name, and purpose.",
  NOT_FOUND: "That equipment or check-out record is not available.",
  INELIGIBLE: "Only available or in-use equipment can be checked out.",
  UNAVAILABLE: "That quantity is more than what is currently available.",
  ALREADY_RETURNED: "That check-out has already been returned.",
} as const;

function fail(status: string) {
  redirect(
    resultUrl(
      "error",
      sharedMessages[status as keyof typeof sharedMessages] ??
        "Unable to save that equipment check-out.",
    ),
  );
}

function revalidate() {
  revalidatePath(EQUIPMENT_CHECKOUT_HREF);
  revalidatePath(EQUIPMENT_INVENTORY_REVALIDATE_HREF);
}

export async function createEquipmentCheckoutAction(formData: FormData) {
  const result = await createEquipmentCheckout({
    equipmentItemId: formData.get("equipmentItemId"),
    quantity: formData.get("quantity"),
    checkedOutToName: formData.get("checkedOutToName"),
    purpose: formData.get("purpose"),
    dueBackAt: formData.get("dueBackAt"),
  });

  if (result.status === "CREATED") {
    revalidate();
    redirect(resultUrl("success", "Equipment checked out."));
  }

  fail(result.status);
}

export async function returnEquipmentCheckoutAction(formData: FormData) {
  const result = await returnEquipmentCheckout({
    checkoutId: formData.get("checkoutId"),
    returnNote: formData.get("returnNote"),
  });

  if (result.status === "RETURNED") {
    revalidate();
    redirect(resultUrl("success", "Equipment returned."));
  }

  fail(result.status);
}
