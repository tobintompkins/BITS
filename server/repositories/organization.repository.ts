import { auth } from "@clerk/nextjs/server";

import { isDatabaseUnavailableError } from "@/lib/db/database-unavailable";
import { prisma } from "@/lib/db/prisma";

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

async function oldestOrganization() {
  return prisma.organization.findFirst({
    orderBy: {
      createdAt: "asc",
    },
  });
}

/**
 * Resolve the current church.
 *
 * Signed-in callers use the active Clerk organization, then exactly one
 * active membership. A lone active church is not authorization. Signed-out
 * public pages keep the legacy oldest-organization fallback for branding
 * only; that path must not grant financial or staff privileges.
 */
export async function findPrimaryOrganization() {
  try {
    const { userId, orgId } = await auth();

    if (orgId) {
      return await prisma.organization.findFirst({
        where: { active: true, clerkOrganizationId: orgId },
      });
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
          organization: { active: true },
        },
        include: { organization: true },
        take: 2,
      });
      return memberships.length === 1 ? memberships[0].organization : null;
    }

    return await oldestOrganization();
  } catch (error) {
    if (!isDatabaseUnavailableError(error)) throw error;
    return null;
  }
}

export async function findOrganizationBySlug(slug: string) {
  return prisma.organization.findUnique({
    where: {
      slug,
    },
  });
}

export async function createOrganization(data: OrganizationWriteInput) {
  return prisma.organization.create({
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
) {
  return prisma.organization.update({
    where: {
      id,
    },
    data,
  });
}

export async function updateOrganizationLogo(
  id: string,
  logoStorageKey: string | null,
) {
  return prisma.organization.update({
    where: { id },
    data: { logoStorageKey },
  });
}
