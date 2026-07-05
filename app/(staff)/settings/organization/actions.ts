"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import {
  createOrganizationSettingsActionState,
  organizationSettingsSchema,
  toOrganizationSettingsFormValues,
  type OrganizationSettingsActionState,
  type OrganizationSettingsFormValues,
} from "@/lib/validation/organization-settings";
import { saveOrganizationSettings } from "@/server/services/organization-settings.service";

function getFormValues(formData: FormData): OrganizationSettingsFormValues {
  return {
    churchName: String(formData.get("churchName") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    ein: String(formData.get("ein") ?? ""),
    addressLine1: String(formData.get("addressLine1") ?? ""),
    addressLine2: String(formData.get("addressLine2") ?? ""),
    city: String(formData.get("city") ?? ""),
    state: String(formData.get("state") ?? ""),
    zipCode: String(formData.get("zipCode") ?? ""),
    country: String(formData.get("country") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    website: String(formData.get("website") ?? ""),
    timeZone: String(formData.get("timeZone") ?? ""),
    statementFooter: String(formData.get("statementFooter") ?? ""),
  };
}

export async function saveOrganizationSettingsAction(
  _previousState: OrganizationSettingsActionState,
  formData: FormData,
): Promise<OrganizationSettingsActionState> {
  const { userId } = await auth();
  const values = getFormValues(formData);

  if (!userId) {
    return {
      ...createOrganizationSettingsActionState(values),
      status: "error",
      message: "You must be signed in to update organization settings.",
    };
  }

  const parsed = organizationSettingsSchema.safeParse(values);

  if (!parsed.success) {
    return {
      ...createOrganizationSettingsActionState(values),
      status: "error",
      message: "Please correct the highlighted fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const organization = await saveOrganizationSettings(parsed.data);

    revalidatePath("/settings");
    revalidatePath("/settings/organization");

    return {
      ...createOrganizationSettingsActionState(
        toOrganizationSettingsFormValues(organization),
      ),
      status: "success",
      message: "Organization settings saved successfully.",
    };
  } catch (error) {
    return {
      ...createOrganizationSettingsActionState(values),
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Unable to save organization settings right now.",
    };
  }
}
