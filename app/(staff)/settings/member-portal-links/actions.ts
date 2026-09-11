"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createLinkedDonorSchema,
  linkExistingDonorSchema,
} from "@/lib/validation/member-portal-link";
import {
  createLinkedDonor,
  linkExistingDonorToAccount,
} from "@/server/services/member-portal-link.service";

function resultUrl(type: "success" | "error", message: string) {
  const params = new URLSearchParams({ [type]: message });
  return `/settings/member-portal-links?${params.toString()}`;
}

export async function linkExistingDonorAction(formData: FormData) {
  const parsed = linkExistingDonorSchema.safeParse({
    donorId: formData.get("donorId"),
    accountEmail: formData.get("accountEmail"),
  });
  if (!parsed.success) {
    redirect(resultUrl("error", "Enter a valid account email and choose a donor."));
  }
  try {
    await linkExistingDonorToAccount(parsed.data);
    revalidatePath("/portal");
    revalidatePath("/settings/member-portal-links");
  } catch (error) {
    redirect(
      resultUrl(
        "error",
        error instanceof Error ? error.message : "Unable to connect the account.",
      ),
    );
  }
  redirect(resultUrl("success", "The donor and portal account are now connected."));
}

export async function createLinkedDonorAction(formData: FormData) {
  const parsed = createLinkedDonorSchema.safeParse({
    accountEmail: formData.get("accountEmail"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phone: formData.get("phone") || undefined,
  });
  if (!parsed.success) {
    redirect(resultUrl("error", "Enter the account email, first name, and last name."));
  }
  try {
    await createLinkedDonor(parsed.data);
    revalidatePath("/portal");
    revalidatePath("/settings/member-portal-links");
  } catch (error) {
    redirect(
      resultUrl(
        "error",
        error instanceof Error ? error.message : "Unable to create the donor.",
      ),
    );
  }
  redirect(resultUrl("success", "The donor was created and connected."));
}
