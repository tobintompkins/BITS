import { currentUser } from "@clerk/nextjs/server";

import { RoleCode } from "@/app/generated/prisma/client";
import { planPersonalRecordConnection } from "@/lib/auth/personal-record-connection";
import { prisma } from "@/lib/db/prisma";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import type {
  ConnectPersonRecordsInput,
  CreateLinkedDonorInput,
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
        churchAccess: "ACTIVE",
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

function blankToUndefined(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

async function requireAccountInChurch(organizationId: string, userAccountId: string) {
  const membership = await prisma.organizationMembership.findFirst({
    where: { organizationId, userAccountId },
    select: { id: true },
  });
  if (!membership) throw new Error("That BITS account is not in this church.");
}

export async function getPortalLinkAdminData() {
  const { organization } = await requirePortalLinkAccess();
  const [accounts, donors, members, profiles] = await Promise.all([
    prisma.organizationMembership.findMany({
      where: { organizationId: organization.id },
      orderBy: { createdAt: "asc" },
      select: {
        active: true,
        churchAccess: true,
        userAccount: {
          select: { id: true, displayName: true, primaryEmail: true, active: true },
        },
      },
    }),
    prisma.donor.findMany({
      where: { organizationId: organization.id, active: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 200,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        userAccountId: true,
        userAccount: { select: { displayName: true, primaryEmail: true } },
      },
    }),
    prisma.member.findMany({
      where: { organizationId: organization.id, recordStatus: "ACTIVE" },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 200,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        userAccountId: true,
      },
    }),
    prisma.churchPersonProfile.findMany({
      where: { organizationId: organization.id },
      orderBy: { officialName: "asc" },
      take: 200,
      select: {
        id: true,
        officialName: true,
        rosterKey: true,
        linkedUserAccountId: true,
      },
    }).catch((error: unknown) => {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2021"
      ) {
        return [];
      }
      throw error;
    }),
  ]);
  return {
    organizationName: organization.displayName ?? organization.name,
    accounts,
    donors,
    members,
    profiles,
  };
}

export async function connectExistingPersonRecords(input: ConnectPersonRecordsInput) {
  const { organization, actor } = await requirePortalLinkAccess();
  const account = await prisma.userAccount.findUnique({
    where: { id: input.userAccountId },
    select: { id: true, active: true },
  });
  if (!account) throw new Error("That BITS account was not found.");
  await requireAccountInChurch(organization.id, account.id);

  const donorId = blankToUndefined(input.donorId);
  const memberId = blankToUndefined(input.memberId);
  const profileId = blankToUndefined(input.profileId);
  const records: {
    kind: "donor" | "member" | "profile";
    id: string;
    linkedAccountId: string | null;
  }[] = [];

  if (donorId) {
    const donor = await prisma.donor.findFirst({
      where: { id: donorId, organizationId: organization.id, active: true },
      select: { id: true, userAccountId: true },
    });
    if (!donor) throw new Error("Donor record not found in this church.");
    const existing = await prisma.donor.findFirst({
      where: {
        organizationId: organization.id,
        userAccountId: account.id,
        id: { not: donor.id },
      },
      select: { id: true },
    });
    if (existing) throw new Error("That account is already connected to another donor.");
    records.push({ kind: "donor", id: donor.id, linkedAccountId: donor.userAccountId });
  }
  if (memberId) {
    const member = await prisma.member.findFirst({
      where: { id: memberId, organizationId: organization.id, recordStatus: "ACTIVE" },
      select: { id: true, userAccountId: true },
    });
    if (!member) throw new Error("Membership record not found in this church.");
    const existing = await prisma.member.findFirst({
      where: {
        organizationId: organization.id,
        userAccountId: account.id,
        id: { not: member.id },
      },
      select: { id: true },
    });
    if (existing) throw new Error("That account is already connected to another membership record.");
    records.push({ kind: "member", id: member.id, linkedAccountId: member.userAccountId });
  }
  if (profileId) {
    const profile = await prisma.churchPersonProfile.findFirst({
      where: { id: profileId, organizationId: organization.id },
      select: { id: true, linkedUserAccountId: true },
    });
    if (!profile) throw new Error("Church profile not found in this church.");
    const existing = await prisma.churchPersonProfile.findFirst({
      where: {
        organizationId: organization.id,
        linkedUserAccountId: account.id,
        id: { not: profile.id },
      },
      select: { id: true },
    });
    if (existing) throw new Error("That account is already connected to another church profile.");
    records.push({
      kind: "profile",
      id: profile.id,
      linkedAccountId: profile.linkedUserAccountId,
    });
  }

  const plan = planPersonalRecordConnection({
    accountId: account.id,
    accountActive: account.active,
    records,
  });
  if (!plan.ok) {
    if (plan.reason === "ACCOUNT_INACTIVE") {
      throw new Error("That BITS account is inactive.");
    }
    if (plan.reason === "OWNED_BY_SOMEONE_ELSE") {
      throw new Error("One of those records is already connected to a different account.");
    }
    throw new Error("Choose at least one existing record to connect.");
  }

  for (const link of plan.links) {
    if (link.action === "reuse") continue;
    if (link.kind === "donor") {
      await prisma.donor.update({
        where: { id: link.id },
        data: { userAccountId: account.id },
      });
    } else if (link.kind === "member") {
      await prisma.member.update({
        where: { id: link.id },
        data: { userAccountId: account.id },
      });
    } else {
      await prisma.churchPersonProfile.update({
        where: { id: link.id },
        data: { linkedUserAccountId: account.id },
      });
    }
    await createAuditEvent({
      organizationId: organization.id,
      actorUserAccountId: actor.id,
      action: "PERSON_RECORD_LINKED",
      entityType: link.kind === "donor" ? "Donor" : link.kind === "member" ? "Member" : "ChurchPersonProfile",
      entityId: link.id,
      changes: [{ field: "userAccountId", oldValue: null, newValue: account.id }],
    });
  }
}

export async function createLinkedDonor(input: CreateLinkedDonorInput) {
  const { organization, actor } = await requirePortalLinkAccess();
  const account = await prisma.userAccount.findUnique({
    where: { id: input.userAccountId },
    select: { id: true, active: true, primaryEmail: true },
  });
  if (!account?.active) throw new Error("That BITS account was not found.");
  await requireAccountInChurch(organization.id, account.id);

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
