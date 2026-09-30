"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { PURCHASE_REQUESTS_HREF } from "@/lib/validation/purchase-request";
import {
  cancelPurchaseRequest,
  createPurchaseRequest,
  decidePurchaseRequest,
} from "@/server/services/purchase-request.service";

function resultUrl(type: "success" | "error", message: string) {
  const params = new URLSearchParams({ [type]: message });
  return `${PURCHASE_REQUESTS_HREF}?${params.toString()}`;
}

const sharedMessages = {
  SIGNED_OUT: "You must be signed in.",
  NO_ORGANIZATION: "The church organization has not been configured.",
  UNAUTHORIZED: "You do not have permission to take that action.",
  INVALID: "Check the title, description, amount, and decision note.",
  NOT_FOUND: "That purchase request or equipment item is not available.",
  NOT_PENDING: "Only a pending request can be reviewed or cancelled.",
} as const;

function fail(status: string) {
  redirect(
    resultUrl(
      "error",
      sharedMessages[status as keyof typeof sharedMessages] ??
        "Unable to save that purchase request.",
    ),
  );
}

function revalidate() {
  revalidatePath(PURCHASE_REQUESTS_HREF);
}

export async function createPurchaseRequestAction(formData: FormData) {
  const result = await createPurchaseRequest({
    title: formData.get("title"),
    description: formData.get("description"),
    category: formData.get("category"),
    estimatedAmount: formData.get("estimatedAmount"),
    requestedForLocation: formData.get("requestedForLocation"),
    equipmentItemId: formData.get("equipmentItemId"),
  });

  if (result.status === "CREATED") {
    revalidate();
    redirect(resultUrl("success", "Purchase request submitted for review."));
  }

  fail(result.status);
}

export async function decidePurchaseRequestAction(formData: FormData) {
  const result = await decidePurchaseRequest({
    requestId: formData.get("requestId"),
    decision: formData.get("decision"),
    decisionNote: formData.get("decisionNote"),
  });

  if (result.status === "DECIDED") {
    revalidate();
    redirect(
      resultUrl(
        "success",
        "Decision saved. Approved means leadership agreed to proceed — it is not proof a purchase was made.",
      ),
    );
  }

  fail(result.status);
}

export async function cancelPurchaseRequestAction(formData: FormData) {
  const result = await cancelPurchaseRequest({
    requestId: formData.get("requestId"),
    decisionNote: formData.get("decisionNote"),
  });

  if (result.status === "CANCELLED") {
    revalidate();
    redirect(resultUrl("success", "Purchase request cancelled."));
  }

  fail(result.status);
}
