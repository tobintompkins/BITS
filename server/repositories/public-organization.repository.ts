import { prisma } from "@/lib/db/prisma";

/** Public-site identity never follows a visitor's private Clerk session. */
export async function findPublicOrganization() {
  const slug = process.env.BITS_PUBLIC_ORGANIZATION_SLUG?.trim();
  if (!slug) return null;
  return prisma.organization.findFirst({ where: { slug, active: true } });
}
