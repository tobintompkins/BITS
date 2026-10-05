import { auth } from "@clerk/nextjs/server";
import { RoleCode } from "@/app/generated/prisma/client";

import { prisma } from "@/lib/db/prisma";

export class ReportCatalogError extends Error {}

export async function requireReportCatalogAccess(input: {
  expectedOrganizationId?: string;
  allowed: (roleCode: RoleCode | null) => boolean;
  signInMessage: string;
  permissionMessage: string;
}) {
  const { userId, orgId } = await auth();
  if (!userId) {
    throw new ReportCatalogError(input.signInMessage);
  }
  const actor = await prisma.userAccount.findUnique({
    where: { clerkUserId: userId },
  });
  if (!actor?.active) {
    throw new ReportCatalogError("An active staff account is required.");
  }
  const memberships = await prisma.organizationMembership.findMany({
    where: {
      userAccountId: actor.id,
      active: true,
      organization: {
        active: true,
        ...(orgId ? { clerkOrganizationId: orgId } : {}),
      },
    },
    include: { roleType: true, organization: true },
    take: 2,
  });
  if (memberships.length !== 1) {
    throw new ReportCatalogError(
      "Select a church organization with an active staff membership.",
    );
  }
  const membership = memberships[0];
  const roleCode = membership.roleType.code as RoleCode;
  if (!input.allowed(roleCode)) {
    throw new ReportCatalogError(input.permissionMessage);
  }
  if (
    input.expectedOrganizationId &&
    input.expectedOrganizationId !== membership.organizationId
  ) {
    throw new ReportCatalogError(
      "Your church selection changed. Reload this page before exporting.",
    );
  }
  return {
    actor,
    organization: membership.organization,
    roleCode,
  };
}
