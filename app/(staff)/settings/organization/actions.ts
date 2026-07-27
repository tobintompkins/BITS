"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { requireOrganizationEditAccess } from "@/lib/auth/permissions";
import {
  createOrganizationSettingsActionState,
  organizationSettingsSchema,
  toOrganizationSettingsFormValues,
  type OrganizationSettingsActionState,
  type OrganizationSettingsFormValues,
} from "@/lib/validation/organization-settings";
import { getLogoPublicUrl } from "@/lib/storage/organization-logo";
import {
  getOrganizationSettingsValues,
  saveOrganizationSettings,
} from "@/server/services/organization-settings.service";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

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
    logoUrl: String(formData.get("logoUrl") ?? ""),
  };
}

export async function saveOrganizationSettingsAction(
  _previousState: OrganizationSettingsActionState,
  formData: FormData,
): Promise<OrganizationSettingsActionState> {
  const { userId } = await auth();
  const values = getFormValues(formData);
  const removeLogo = formData.get("removeLogo") === "true";
  const logoFile = formData.get("logoFile");

  if (!userId) {
    return {
      ...createOrganizationSettingsActionState(values),
      status: "error",
      message: "You must be signed in to update organization settings.",
    };
  }

  try {
    const organization = await findPrimaryOrganization();

    if (organization) {
      await requireOrganizationEditAccess(organization.id);
    } else {
      await requireOrganizationEditAccess();
    }
  } catch (error) {
    return {
      ...createOrganizationSettingsActionState(values),
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "You do not have permission to edit organization settings.",
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

  if (
    logoFile instanceof File &&
    logoFile.size > 0 &&
    logoFile.name !== "undefined"
  ) {
    const { validateLogoFile } = await import(
      "@/lib/storage/organization-logo"
    );
    const validation = validateLogoFile(logoFile);

    if (!validation.ok) {
      return {
        ...createOrganizationSettingsActionState(values),
        status: "error",
        message: validation.message,
      };
    }
  }

  try {
    const userAccount = await getOrCreateUserAccount();
    const organization = await saveOrganizationSettings(parsed.data, {
      actorUserAccountId: userAccount?.id ?? null,
      logoFile:
        logoFile instanceof File && logoFile.size > 0 ? logoFile : null,
      removeLogo,
    });

    revalidatePath("/settings");
    revalidatePath("/settings/organization");

    const savedValues = {
      ...toOrganizationSettingsFormValues(organization),
      logoUrl: getLogoPublicUrl(organization.logoStorageKey) ?? "",
    };

    return {
      ...createOrganizationSettingsActionState(savedValues),
      status: "success",
      message: "Organization Settings Updated Successfully",
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

export async function loadOrganizationSettingsActionState(): Promise<OrganizationSettingsActionState> {
  const values = await getOrganizationSettingsValues();

  return createOrganizationSettingsActionState(values);
}
