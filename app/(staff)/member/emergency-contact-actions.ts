"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import {
  requireMemberEditAccess,
  requireMemberViewAccess,
} from "@/lib/auth/member-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  createEmergencyContactActionState,
  emergencyContactSchema,
  type EmergencyContactActionState,
  type EmergencyContactFormValues,
} from "@/lib/validation/emergency-contact";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";
import {
  createEmergencyContactRecord,
  deleteEmergencyContactRecord,
  getEmergencyContacts,
  setPrimaryEmergencyContactRecord,
  updateEmergencyContactRecord,
} from "@/server/services/emergency-contact.service";

function getFormValues(formData: FormData): EmergencyContactFormValues {
  return {
    name: String(formData.get("name") ?? ""),
    relationship: String(formData.get("relationship") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    isPrimary: formData.get("isPrimary") === "true",
    notes: String(formData.get("notes") ?? ""),
  };
}

async function getActor() {
  const userAccount = await getOrCreateUserAccount();
  const clerkUser = await currentUser();

  return {
    userAccountId: userAccount?.id ?? null,
    email:
      clerkUser?.primaryEmailAddress?.emailAddress ??
      userAccount?.primaryEmail ??
      null,
  };
}

async function getOrganizationIdOrThrow() {
  const organization = await findPrimaryOrganization();

  if (!organization) {
    throw new Error("Organization not found.");
  }

  return organization.id;
}

function revalidateMemberPath(memberId: string) {
  revalidatePath(`/member/${memberId}`);
}

export async function createEmergencyContactAction(
  memberId: string,
  _previousState: EmergencyContactActionState,
  formData: FormData,
): Promise<EmergencyContactActionState> {
  const { userId } = await auth();

  if (!userId) {
    return {
      ...createEmergencyContactActionState(),
      status: "error",
      message: "You must be signed in.",
      fieldErrors: {},
    };
  }

  try {
    const organizationId = await getOrganizationIdOrThrow();
    await requireMemberEditAccess(organizationId);
  } catch (error) {
    return {
      ...createEmergencyContactActionState(),
      status: "error",
      message: error instanceof Error ? error.message : "Permission denied.",
      fieldErrors: {},
    };
  }

  const parsed = emergencyContactSchema.safeParse(getFormValues(formData));

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const actor = await getActor();
    const contact = await createEmergencyContactRecord(memberId, parsed.data, actor);
    revalidateMemberPath(memberId);

    return {
      status: "success",
      message: "Emergency contact added.",
      contactId: contact.id,
      fieldErrors: {},
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Unable to add emergency contact.",
      fieldErrors: {},
    };
  }
}

export async function updateEmergencyContactAction(
  memberId: string,
  contactId: string,
  _previousState: EmergencyContactActionState,
  formData: FormData,
): Promise<EmergencyContactActionState> {
  const { userId } = await auth();

  if (!userId) {
    return {
      ...createEmergencyContactActionState(),
      status: "error",
      message: "You must be signed in.",
      fieldErrors: {},
    };
  }

  try {
    const organizationId = await getOrganizationIdOrThrow();
    await requireMemberEditAccess(organizationId);
  } catch (error) {
    return {
      ...createEmergencyContactActionState(),
      status: "error",
      message: error instanceof Error ? error.message : "Permission denied.",
      fieldErrors: {},
    };
  }

  const parsed = emergencyContactSchema.safeParse(getFormValues(formData));

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const actor = await getActor();
    await updateEmergencyContactRecord(memberId, contactId, parsed.data, actor);
    revalidateMemberPath(memberId);

    return {
      status: "success",
      message: "Emergency contact updated.",
      contactId,
      fieldErrors: {},
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Unable to update emergency contact.",
      fieldErrors: {},
    };
  }
}

export async function deleteEmergencyContactAction(memberId: string, contactId: string) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("You must be signed in.");
  }

  const organizationId = await getOrganizationIdOrThrow();
  await requireMemberEditAccess(organizationId);

  const actor = await getActor();
  await deleteEmergencyContactRecord(memberId, contactId, actor);
  revalidateMemberPath(memberId);
}

export async function setPrimaryEmergencyContactAction(
  memberId: string,
  contactId: string,
) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("You must be signed in.");
  }

  const organizationId = await getOrganizationIdOrThrow();
  await requireMemberEditAccess(organizationId);

  const actor = await getActor();
  await setPrimaryEmergencyContactRecord(memberId, contactId, actor);
  revalidateMemberPath(memberId);
}

export async function getMemberEmergencyContacts(memberId: string) {
  const organizationId = await getOrganizationIdOrThrow();
  await requireMemberViewAccess(organizationId);
  return getEmergencyContacts(memberId);
}
