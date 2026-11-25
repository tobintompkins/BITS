"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  connectPersonRecordsSchema,
  createLinkedDonorSchema,
} from "@/lib/validation/member-portal-link";
import {
  connectExistingPersonRecords,
  createLinkedDonor,
} from "@/server/services/member-portal-link.service";

function resultUrl(type: "success" | "error", message: string) {
  const params = new URLSearchParams({ [type]: message });
  return `/settings/member-portal-links?${params.toString()}`;
}

export async function connectPersonRecordsAction(formData: FormData) {
  const parsed = connectPersonRecordsSchema.safeParse({
    userAccountId: formData.get("userAccountId"),
    donorId: formData.get("donorId") || "",
    memberId: formData.get("memberId") || "",
    profileId: formData.get("profileId") || "",
    confirmed: formData.get("confirmed"),
  });
  if (!parsed.success) {
    redirect(resultUrl("error", "Choose the BITS account, select a record, and confirm the connection."));
  }
  try {
    await connectExistingPersonRecords(parsed.data);
    revalidatePath("/portal");
    revalidatePath("/portal/profile");
    revalidatePath("/portal/gifts");
    revalidatePath("/portal/statements");
    revalidatePath("/portal/household");
    revalidatePath("/portal/training");
    revalidatePath("/portal/ministries");
    revalidatePath("/settings/member-portal-links");
  } catch (error) {
    redirect(
      resultUrl(
        "error",
        error instanceof Error ? error.message : "Unable to connect the account.",
      ),
    );
  }
  redirect(resultUrl("success", "The selected records are connected to that account."));
}

export async function createLinkedDonorAction(formData: FormData) {
  const parsed = createLinkedDonorSchema.safeParse({
    userAccountId: formData.get("userAccountId"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phone: formData.get("phone") || undefined,
  });
  if (!parsed.success) {
    redirect(resultUrl("error", "Choose the BITS account and enter the donor name."));
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
