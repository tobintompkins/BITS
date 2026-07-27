"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import {
  requireHouseholdCreateAccess,
  requireHouseholdDeleteAccess,
  requireHouseholdEditAccess,
  requireHouseholdViewAccess,
} from "@/lib/auth/household-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  createHouseholdActionState,
  householdSchema,
  type HouseholdActionState,
  type HouseholdFormValues,
} from "@/lib/validation/household";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";
import {
  createHouseholdRecord,
  deleteHouseholdRecord,
  getHouseholdById,
  getHouseholds,
  linkMemberToHousehold,
  removeMemberFromHousehold,
  setHouseholdPrimaryContact,
  updateHouseholdRecord,
  updateMemberHouseholdRelationship,
} from "@/server/services/household.service";
import { findMembersForHouseholdSelect } from "@/server/repositories/member.repository";

function getFormValues(formData: FormData): HouseholdFormValues {
  return {
    householdName: String(formData.get("householdName") ?? ""),
    primaryContactId: String(formData.get("primaryContactId") ?? ""),
    addressLine1: String(formData.get("addressLine1") ?? ""),
    addressLine2: String(formData.get("addressLine2") ?? ""),
    city: String(formData.get("city") ?? ""),
    state: String(formData.get("state") ?? ""),
    postalCode: String(formData.get("postalCode") ?? ""),
    country: String(formData.get("country") ?? "US"),
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

function revalidateHouseholdPaths(householdId?: string, memberId?: string) {
  revalidatePath("/households");
  if (householdId) {
    revalidatePath(`/household/${householdId}`);
    revalidatePath(`/household/${householdId}/edit`);
  }
  if (memberId) {
    revalidatePath(`/member/${memberId}`);
  }
  revalidatePath("/members");
}

export async function createHouseholdAction(
  _previousState: HouseholdActionState,
  formData: FormData,
): Promise<HouseholdActionState> {
  const { userId } = await auth();
  const values = getFormValues(formData);

  if (!userId) {
    return {
      ...createHouseholdActionState(),
      status: "error",
      message: "You must be signed in to add households.",
      fieldErrors: {},
    };
  }

  try {
    const organizationId = await getOrganizationIdOrThrow();
    await requireHouseholdCreateAccess(organizationId);
  } catch (error) {
    return {
      ...createHouseholdActionState(),
      status: "error",
      message:
        error instanceof Error ? error.message : "Permission denied.",
      fieldErrors: {},
    };
  }

  const parsed = householdSchema.safeParse(values);

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const actor = await getActor();
    const household = await createHouseholdRecord(parsed.data, actor);

    revalidateHouseholdPaths(household?.id);

    return {
      status: "success",
      message: "Household created successfully.",
      householdId: household?.id,
      fieldErrors: {},
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Unable to create household.",
      fieldErrors: {},
    };
  }
}

export async function updateHouseholdAction(
  householdId: string,
  _previousState: HouseholdActionState,
  formData: FormData,
): Promise<HouseholdActionState> {
  const { userId } = await auth();
  const values = getFormValues(formData);

  if (!userId) {
    return {
      ...createHouseholdActionState(),
      status: "error",
      message: "You must be signed in to edit households.",
      fieldErrors: {},
    };
  }

  try {
    const organizationId = await getOrganizationIdOrThrow();
    await requireHouseholdEditAccess(organizationId);
  } catch (error) {
    return {
      ...createHouseholdActionState(),
      status: "error",
      message:
        error instanceof Error ? error.message : "Permission denied.",
      fieldErrors: {},
    };
  }

  const parsed = householdSchema.safeParse(values);

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const actor = await getActor();
    await updateHouseholdRecord(householdId, parsed.data, actor);

    revalidateHouseholdPaths(householdId);

    return {
      status: "success",
      message: "Household updated successfully.",
      householdId,
      fieldErrors: {},
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Unable to update household.",
      fieldErrors: {},
    };
  }
}

export async function deleteHouseholdAction(householdId: string) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("You must be signed in to delete households.");
  }

  const organizationId = await getOrganizationIdOrThrow();
  await requireHouseholdDeleteAccess(organizationId);

  const actor = await getActor();
  await deleteHouseholdRecord(householdId, actor);

  revalidateHouseholdPaths(householdId);
}

export async function linkMemberToHouseholdAction(input: {
  memberId: string;
  householdId: string;
  relationshipToHousehold: string;
}) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("You must be signed in.");
  }

  const organizationId = await getOrganizationIdOrThrow();
  await requireHouseholdEditAccess(organizationId);

  const actor = await getActor();
  await linkMemberToHousehold(input, actor);

  revalidateHouseholdPaths(input.householdId, input.memberId);
}

export async function removeMemberFromHouseholdAction(
  memberId: string,
  householdId: string,
) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("You must be signed in.");
  }

  const organizationId = await getOrganizationIdOrThrow();
  await requireHouseholdEditAccess(organizationId);

  const actor = await getActor();
  await removeMemberFromHousehold(memberId, householdId, actor);

  revalidateHouseholdPaths(householdId, memberId);
}

export async function setHouseholdPrimaryContactAction(
  householdId: string,
  memberId: string,
) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("You must be signed in.");
  }

  const organizationId = await getOrganizationIdOrThrow();
  await requireHouseholdEditAccess(organizationId);

  const actor = await getActor();
  await setHouseholdPrimaryContact(householdId, memberId, actor);

  revalidateHouseholdPaths(householdId, memberId);
}

export async function updateMemberHouseholdRelationshipAction(input: {
  memberId: string;
  householdId: string;
  relationshipToHousehold: string;
}) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("You must be signed in.");
  }

  const organizationId = await getOrganizationIdOrThrow();
  await requireHouseholdEditAccess(organizationId);

  const actor = await getActor();
  await updateMemberHouseholdRelationship(input, actor);

  revalidateHouseholdPaths(input.householdId, input.memberId);
}

export async function getMemberOptionsForHousehold() {
  const organizationId = await getOrganizationIdOrThrow();
  await requireHouseholdViewAccess(organizationId);
  return findMembersForHouseholdSelect(organizationId);
}

export {
  getHouseholdById,
  getHouseholds,
  requireHouseholdViewAccess,
};
