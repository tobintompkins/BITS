"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  emptyOfferingType,
  type OfferingTypeActionState,
} from "@/lib/validation/offering-type";
import {
  OfferingTypeError,
  offeringTypeFormFromUnknown,
  saveOfferingType,
  setOfferingTypeActive,
} from "@/server/services/offering-type.service";

function revalidateOfferingTypePaths(id?: string) {
  revalidatePath("/offering-types");
  if (id) revalidatePath(`/offering-types/${id}`);
  revalidatePath("/give");
  revalidatePath("/portal/give");
}

export async function saveOfferingTypeAction(
  organizationId: string,
  id: string | null,
  expectedUpdatedAt: string | null,
  _previous: OfferingTypeActionState,
  form: FormData,
): Promise<OfferingTypeActionState> {
  const values = offeringTypeFormFromUnknown(
    Object.fromEntries(
      Object.keys(emptyOfferingType).map((key) => [
        key,
        key === "defaultTaxDeductible" ||
        key === "onlineGivingEnabled" ||
        key === "active"
          ? form.get(key) === "on"
          : String(form.get(key) ?? ""),
      ]),
    ),
  );
  try {
    const saved = await saveOfferingType(
      organizationId,
      id,
      values,
      expectedUpdatedAt,
    );
    revalidateOfferingTypePaths(saved.id);
    return { message: "Offering type saved.", savedId: saved.id, values };
  } catch (error) {
    return {
      message:
        error instanceof OfferingTypeError
          ? error.message
          : "Unable to save the offering type. Please try again.",
      values,
    };
  }
}

export async function setOfferingTypeActiveAction(
  organizationId: string,
  id: string,
  active: boolean,
  expectedUpdatedAt: string,
  _previous: OfferingTypeActionState,
  form: FormData,
): Promise<OfferingTypeActionState> {
  void _previous;
  if (form.get("confirm") !== "on") {
    return {
      message: "Confirm this change before continuing.",
    };
  }
  try {
    const saved = await setOfferingTypeActive(
      organizationId,
      id,
      active,
      expectedUpdatedAt,
    );
    revalidateOfferingTypePaths(saved.id);
    redirect(`/offering-types/${saved.id}`);
  } catch (error) {
    return {
      message:
        error instanceof OfferingTypeError
          ? error.message
          : "Unable to update the offering type. Please try again.",
    };
  }
}
