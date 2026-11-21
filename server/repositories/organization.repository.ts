import { findPublicOrganization } from "@/server/repositories/public-organization.repository";
import { auth } from "@clerk/nextjs/server";

import type { Prisma, PrismaClient } from "@/app/generated/prisma/client";
import { isDatabaseUnavailableError } from "@/lib/db/database-unavailable";
import { prisma } from "@/lib/db/prisma";

type OrganizationDb = PrismaClient | Prisma.TransactionClient;

export type OrganizationWriteInput = {
  name: string;
  displayName: string;
  slug: string;
  ein: string | null;
  mailingAddressLine1: string;
  mailingAddressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  contactPhone: string | null;
  contactEmail: string | null;
  websiteUrl: string | null;
  timeZone: string;
  statementFooterText: string | null;
  logoStorageKey?: string | null;
};

/**
 * Resolve the current church.
 *
 * Signed-in callers use the active Clerk organization, then exactly one
 * active membership. A lone active church is not authorization. Signed-out
 * public callers use the configured public church only; that path
 * must not grant financial or staff privileges.
 */
export async function findPrimaryOrganization() {
  try {
    const { userId, orgId } = await auth();

    if (orgId) {
      const organization = await prisma.organization.findFirst({
        where: { active: true, clerkOrganizationId: orgId },
      });
      if (!organization || !userId) return organization;
      const account = await prisma.userAccount.findUnique({
        where: { clerkUserId: userId },
        select: { id: true },
      });
      if (account && (await membershipClosesChurch(organization.id, account.id))) {
        return null;
      }
      return organization;
    }

    if (userId) {
      const account = await prisma.userAccount.findUnique({
        where: { clerkUserId: userId },
        select: { id: true },
      });
      if (!account) {
        return null;
      }

      const memberships = await prisma.organizationMembership.findMany({
        where: {
          userAccountId: account.id,
          active: true,
          churchAccess: "ACTIVE",
          organization: { active: true },
        },
        include: { organization: true },
        take: 2,
      });
      return memberships.length === 1 ? memberships[0].organization : null;
    }

    return await findPublicOrganization();
  } catch (error) {
    if (!isDatabaseUnavailableError(error)) throw error;
    return null;
  }
}

/**
 * Portal church for a signed-in account.
 * An unknown Clerk organization or more than one membership fails closed.
 * The public church is used only when the account has no active membership.
 */
export async function findMemberPortalOrganization() {
  try {
    const { userId, orgId } = await auth();
    if (!userId) return await findPublicOrganization();

    if (orgId) {
      const organization = await prisma.organization.findFirst({
        where: { active: true, clerkOrganizationId: orgId },
      });
      if (!organization) return null;
      const account = await prisma.userAccount.findUnique({
        where: { clerkUserId: userId },
        select: { id: true },
      });
      if (account && (await membershipClosesChurch(organization.id, account.id))) {
        return null;
      }
      return organization;
    }

    const account = await prisma.userAccount.findUnique({
      where: { clerkUserId: userId },
      select: { id: true },
    });
    if (!account) return null;

    const memberships = await prisma.organizationMembership.findMany({
      where: {
        userAccountId: account.id,
        active: true,
        churchAccess: "ACTIVE",
        organization: { active: true },
      },
      include: { organization: true },
      take: 2,
    });
    if (memberships.length > 1) return null;
    if (memberships.length === 1) return memberships[0].organization;
    return await closedChurchOrPublic(account.id);
  } catch (error) {
    if (!isDatabaseUnavailableError(error)) throw error;
    return null;
  }
}

async function membershipClosesChurch(organizationId: string, userAccountId: string) {
  const membership = await prisma.organizationMembership.findFirst({
    where: { organizationId, userAccountId },
    select: { active: true, churchAccess: true },
  });
  if (!membership) return false;
  return !membership.active || membership.churchAccess === "SUSPENDED" || membership.churchAccess === "REMOVED";
}

async function closedChurchOrPublic(userAccountId: string) {
  const organization = await findPublicOrganization();
  if (!organization) return null;
  if (await membershipClosesChurch(organization.id, userAccountId)) return null;
  return organization;
}

export async function describeChurchPortalBlock() {
  try {
    const { userId } = await auth();
    if (!userId) return null;
    const account = await prisma.userAccount.findUnique({
      where: { clerkUserId: userId },
      select: { id: true },
    });
    if (!account) return null;
    const memberships = await prisma.organizationMembership.findMany({
      where: { userAccountId: account.id, organization: { active: true } },
      select: {
        active: true,
        churchAccess: true,
        organization: { select: { displayName: true, name: true } },
      },
    });
    const open = memberships.some((row) => row.active && row.churchAccess === "ACTIVE");
    if (open) return null;
    const blocked = memberships.find((row) => !row.active || row.churchAccess !== "ACTIVE");
    if (!blocked) return null;
    return {
      churchAccess: blocked.churchAccess === "REMOVED" ? "REMOVED" as const : "SUSPENDED" as const,
      organizationName: blocked.organization.displayName || blocked.organization.name,
    };
  } catch (error) {
    if (!isDatabaseUnavailableError(error)) throw error;
    return null;
  }
}

export async function findOrganizationBySlug(
  slug: string,
  db: OrganizationDb = prisma,
) {
  return db.organization.findUnique({
    where: {
      slug,
    },
  });
}

export async function createOrganization(
  data: OrganizationWriteInput,
  db: OrganizationDb = prisma,
) {
  return db.organization.create({
    data: {
      ...data,
      active: true,
      locale: "en-US",
    },
  });
}

export async function updateOrganization(
  id: string,
  data: Omit<OrganizationWriteInput, "slug">,
  db: OrganizationDb = prisma,
) {
  return db.organization.update({
    where: {
      id,
    },
    data,
  });
}

export async function updateOrganizationLogo(
  id: string,
  logoStorageKey: string | null,
  db: OrganizationDb = prisma,
) {
  return db.organization.update({
    where: { id },
    data: { logoStorageKey },
  });
}
