import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/db/prisma";

/**
 * Resolve the caller's current church the same way giving reports do:
 * Clerk organization when present, otherwise exactly one active membership.
 * Never falls back to the oldest organization row.
 */
export async function findCurrentOrganizationForUser(userAccountId: string) {
  const { orgId } = await auth();
  if (orgId) {
    return prisma.organization.findFirst({
      where: { active: true, clerkOrganizationId: orgId },
    });
  }

  const memberships = await prisma.organizationMembership.findMany({
    where: {
      userAccountId,
      active: true,
      organization: { active: true },
    },
    include: { organization: true },
    take: 2,
  });
  if (memberships.length !== 1) {
    return null;
  }
  return memberships[0].organization;
}
