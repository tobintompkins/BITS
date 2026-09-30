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

export async function findPrimaryOrganization() {
  try {
    return await prisma.organization.findFirst({
      orderBy: {
        createdAt: "asc",
      },
    });
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
