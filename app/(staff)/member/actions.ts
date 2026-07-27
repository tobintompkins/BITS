"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import {
  requireMemberCreateAccess,
  requireMemberDeleteAccess,
  requireMemberEditAccess,
  requireMemberViewAccess,
} from "@/lib/auth/member-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  createMemberActionState,
  memberSchema,
  type MemberActionState,
  type MemberFormValues,
} from "@/lib/validation/member";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";
import {
  createMemberRecord,
  deleteMemberRecord,
  getMemberAuditEvents,
  getMemberById,
  getMemberHouseholdOptions,
  getMembers,
  getMembersDirectoryPage,
  getMemberSelectOptions,
  updateMemberRecord,
} from "@/server/services/member.service";

function getFormValues(formData: FormData): MemberFormValues {
  return {
    firstName: String(formData.get("firstName") ?? ""),
    middleName: String(formData.get("middleName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    preferredName: String(formData.get("preferredName") ?? ""),
    suffix: String(formData.get("suffix") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    alternatePhone: String(formData.get("alternatePhone") ?? ""),
    dateOfBirth: String(formData.get("dateOfBirth") ?? ""),
    gender: String(formData.get("gender") ?? ""),
    maritalStatus: String(formData.get("maritalStatus") ?? ""),
    membershipStatus: String(
      formData.get("membershipStatus") ?? "VISITOR",
    ) as MemberFormValues["membershipStatus"],
    memberSince: String(formData.get("memberSince") ?? ""),
    baptismDate: String(formData.get("baptismDate") ?? ""),
    salvationDate: String(formData.get("salvationDate") ?? ""),
    addressLine1: String(formData.get("addressLine1") ?? ""),
    addressLine2: String(formData.get("addressLine2") ?? ""),
    city: String(formData.get("city") ?? ""),
    state: String(formData.get("state") ?? ""),
    postalCode: String(formData.get("postalCode") ?? ""),
    country: String(formData.get("country") ?? "US"),
    notes: String(formData.get("notes") ?? ""),
    householdId: String(formData.get("householdId") ?? ""),
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

export async function createMemberAction(
  _previousState: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const { userId } = await auth();
  const values = getFormValues(formData);

  if (!userId) {
    return {
      ...createMemberActionState(),
      status: "error",
      message: "You must be signed in to add members.",
      fieldErrors: {},
    };
  }

  try {
    const organizationId = await getOrganizationIdOrThrow();
    await requireMemberCreateAccess(organizationId);
  } catch (error) {
    return {
      ...createMemberActionState(),
      status: "error",
      message:
        error instanceof Error ? error.message : "Permission denied.",
      fieldErrors: {},
    };
  }

  const parsed = memberSchema.safeParse(values);

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const actor = await getActor();
    const member = await createMemberRecord(parsed.data, actor);

    revalidatePath("/members");
    revalidatePath(`/member/${member.id}`);

    return {
      status: "success",
      message: "Member created successfully.",
      memberId: member.id,
      fieldErrors: {},
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Unable to create member.",
      fieldErrors: {},
    };
  }
}

export async function updateMemberAction(
  memberId: string,
  _previousState: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const { userId } = await auth();
  const values = getFormValues(formData);

  if (!userId) {
    return {
      ...createMemberActionState(),
      status: "error",
      message: "You must be signed in to edit members.",
      fieldErrors: {},
    };
  }

  try {
    const organizationId = await getOrganizationIdOrThrow();
    await requireMemberEditAccess(organizationId);
  } catch (error) {
    return {
      ...createMemberActionState(),
      status: "error",
      message:
        error instanceof Error ? error.message : "Permission denied.",
      fieldErrors: {},
    };
  }

  const parsed = memberSchema.safeParse(values);

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const actor = await getActor();
    await updateMemberRecord(memberId, parsed.data, actor);

    revalidatePath("/members");
    revalidatePath(`/member/${memberId}`);
    revalidatePath(`/member/${memberId}/edit`);

    return {
      status: "success",
      message: "Member updated successfully.",
      fieldErrors: {},
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Unable to update member.",
      fieldErrors: {},
    };
  }
}

export async function deleteMemberAction(memberId: string) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("You must be signed in to delete members.");
  }

  const organizationId = await getOrganizationIdOrThrow();
  await requireMemberDeleteAccess(organizationId);

  const actor = await getActor();
  await deleteMemberRecord(memberId, actor);

  revalidatePath("/members");
}

export {
  getMemberAuditEvents,
  getMemberById,
  getMemberHouseholdOptions,
  getMembers,
  getMembersDirectoryPage,
  getMemberSelectOptions,
  requireMemberViewAccess,
};
