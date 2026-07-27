"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { requireMemberEditAccess } from "@/lib/auth/member-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { validateMemberPhotoFile } from "@/lib/storage/member-photo";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";
import {
  removeMemberPhoto,
  uploadMemberPhoto,
} from "@/server/services/member-photo.service";

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

function revalidateMemberPaths(memberId: string) {
  revalidatePath("/members");
  revalidatePath(`/member/${memberId}`);
  revalidatePath(`/member/${memberId}/edit`);
}

export async function uploadMemberPhotoAction(memberId: string, formData: FormData) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("You must be signed in.");
  }

  const organizationId = await getOrganizationIdOrThrow();
  await requireMemberEditAccess(organizationId);

  const photoFile = formData.get("photoFile");

  if (!(photoFile instanceof File) || photoFile.size === 0) {
    throw new Error("Select a photo to upload.");
  }

  const validation = validateMemberPhotoFile(photoFile);

  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const actor = await getActor();
  const photoUrl = await uploadMemberPhoto(memberId, photoFile, actor);

  revalidateMemberPaths(memberId);

  return { photoUrl };
}

export async function removeMemberPhotoAction(memberId: string) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("You must be signed in.");
  }

  const organizationId = await getOrganizationIdOrThrow();
  await requireMemberEditAccess(organizationId);

  const actor = await getActor();
  await removeMemberPhoto(memberId, actor);

  revalidateMemberPaths(memberId);
}
