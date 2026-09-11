import { currentUser } from "@clerk/nextjs/server";

import { RoleCode } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import type {
  CreateLinkedDonorInput,
  LinkExistingDonorInput,
} from "@/lib/validation/member-portal-link";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

const LINK_ROLES: RoleCode[] = [RoleCode.ORG_ADMIN, RoleCode.TREASURER];

async function requirePortalLinkAccess() {
  const organization = await findPrimaryOrganization();
  if (!organization) throw new Error("Church organization not found.");

  const actor = await getOrCreateUserAccount();
  if (!actor) throw new Error("You must be signed in.");

  const clerkUser = await currentUser();
  const isSuperAdmin =
    clerkUser?.publicMetadata?.role === "super_admin" ||
    clerkUser?.publicMetadata?.bitsRole === "SUPER_ADMIN";

  if (!isSuperAdmin) {
    const membership = await prisma.organizationMembership.findFirst({
      where: {
        organizationId: organization.id,
        userAccountId: actor.id,
        active: true,
        roleType: { code: { in: LINK_ROLES } },
      },
    });
    if (!membership) {
      throw new Error(
        "Only an organization administrator or treasurer can connect portal accounts.",
      );
    }
  }

  return { organization, actor };
}

async function findAccountByEmail(email: string) {
  const account = await prisma.userAccount.findFirst({
    where: {
      primaryEmail: { equals: email, mode: "insensitive" },
      active: true,
    },
    select: { id: true, primaryEmail: true, displayName: true },
  });
  if (!account) {
    throw new Error(
      "No signed-in BITS account was found for that email. Ask the person to sign in once, then try again.",
    );
  }
  return account;
}

export async function getPortalLinkAdminData() {
  const { organization } = await requirePortalLinkAccess();
  const donors = await prisma.donor.findMany({
    where: { organizationId: organization.id, active: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 200,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      userAccount: {
        select: { primaryEmail: true, displayName: true },
      },
    },
  });
  return {
    organizationName: organization.displayName ?? organization.name,
    donors,
  };
}

export async function linkExistingDonorToAccount(
  input: LinkExistingDonorInput,
) {
  const { organization, actor } = await requirePortalLinkAccess();
  const account = await findAccountByEmail(input.accountEmail);

  const donor = await prisma.donor.findFirst({
    where: { id: input.donorId, organizationId: organization.id, active: true },
  });
  if (!donor) throw new Error("Donor record not found.");
  if (donor.userAccountId && donor.userAccountId !== account.id) {
    throw new Error("That donor is already connected to a different account.");
  }

  const existingLink = await prisma.donor.findFirst({
    where: {
      organizationId: organization.id,
      userAccountId: account.id,
      id: { not: donor.id },
    },
  });
  if (existingLink) {
    throw new Error("That account is already connected to another donor.");
  }

  await prisma.donor.update({
    where: { id: donor.id },
    data: { userAccountId: account.id },
  });
  await createAuditEvent({
    organizationId: organization.id,
    actorUserAccountId: actor.id,
    action: "DONOR_PORTAL_ACCOUNT_LINKED",
    entityType: "Donor",
    entityId: donor.id,
    changes: [
      {
        field: "portalAccount",
        oldValue: donor.userAccountId,
        newValue: account.id,
      },
    ],
  });
  return donor;
}

export async function createLinkedDonor(input: CreateLinkedDonorInput) {
  const { organization, actor } = await requirePortalLinkAccess();
  const account = await findAccountByEmail(input.accountEmail);

  const existingLink = await prisma.donor.findFirst({
    where: { organizationId: organization.id, userAccountId: account.id },
  });
  if (existingLink) {
    throw new Error("That account is already connected to a donor.");
  }

  const donor = await prisma.donor.create({
    data: {
      organizationId: organization.id,
      userAccountId: account.id,
      firstName: input.firstName,
      lastName: input.lastName,
      email: account.primaryEmail,
      phone: input.phone || null,
    },
  });
  await createAuditEvent({
    organizationId: organization.id,
    actorUserAccountId: actor.id,
    action: "DONOR_CREATED_AND_PORTAL_LINKED",
    entityType: "Donor",
    entityId: donor.id,
    changes: [
      { field: "portalAccount", oldValue: null, newValue: account.id },
    ],
  });
  return donor;
}
