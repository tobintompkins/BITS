import { auth, currentUser } from "@clerk/nextjs/server";

import { RoleCode } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

function shouldAutoProvisionOrgAccess() {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.BITS_AUTO_PROVISION_ORG_ACCESS === "true"
  );
}

async function ensureOrganizationMembership(userAccountId: string) {
  if (!shouldAutoProvisionOrgAccess()) {
    return;
  }

  const existingMembership = await prisma.organizationMembership.findFirst({
    where: { userAccountId, active: true },
  });

  if (existingMembership) {
    return;
  }

  const organization = await findPrimaryOrganization();

  if (!organization) {
    return;
  }

  const orgAdminRole = await prisma.roleType.findUnique({
    where: { code: RoleCode.ORG_ADMIN },
  });

  if (!orgAdminRole) {
    return;
  }

  await prisma.organizationMembership.upsert({
    where: {
      organizationId_userAccountId: {
        organizationId: organization.id,
        userAccountId,
      },
    },
    update: {
      roleTypeId: orgAdminRole.id,
      active: true,
    },
    create: {
      organizationId: organization.id,
      userAccountId,
      roleTypeId: orgAdminRole.id,
      active: true,
    },
  });
}

export async function getOrCreateUserAccount() {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  const existing = await prisma.userAccount.findUnique({
    where: { clerkUserId: userId },
  });

  if (existing) {
    await ensureOrganizationMembership(existing.id);
    return existing;
  }

  const clerkUser = await currentUser();
  const primaryEmail =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress;

  if (!primaryEmail) {
    return null;
  }

  const joinedName = [clerkUser?.firstName, clerkUser?.lastName]
    .filter(Boolean)
    .join(" ");
  const displayName = clerkUser?.fullName
    ? clerkUser.fullName
    : joinedName.length > 0
      ? joinedName
      : null;

  const userAccount = await prisma.userAccount.create({
    data: {
      clerkUserId: userId,
      primaryEmail,
      displayName,
    },
  });

  await ensureOrganizationMembership(userAccount.id);

  return userAccount;
}
