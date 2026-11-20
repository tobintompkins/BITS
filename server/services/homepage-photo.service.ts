import { auth } from "@clerk/nextjs/server";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { lockOrganizationForLedger } from "@/lib/batches/ledger-locks";
import { findPublicOrganization } from "@/server/repositories/public-organization.repository";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";

export class HomepagePhotoError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function homepagePhotoAdmin(db: Prisma.TransactionClient = prisma) {
  const { userId } = await auth();
  if (!userId) return null;
  const slug = process.env.BITS_PUBLIC_ORGANIZATION_SLUG?.trim();
  if (!slug) return null;
  // This control edits the church displayed on the public page, not another
  // church selected in the viewer's Clerk session. Require its own admin grant.
  return db.organizationMembership.findFirst({
    where: { active: true, organization: { slug, active: true },
      userAccount: { clerkUserId: userId, active: true }, roleType: { code: "ORG_ADMIN" } },
    select: { organizationId: true, userAccountId: true },
  });
}

export async function publicHomepagePhoto() {
  try {
    const organization = await findPublicOrganization();
    if (!organization) return null;
    return await prisma.homepagePhoto.findUnique({ where: { organizationId: organization.id },
      select: { alt: true, version: true } });
  } catch {
    // A photo is optional. A lookup failure must not take down the public page.
    return null;
  }
}

export async function optionalHomepagePhotoAdmin() {
  try {
    return await homepagePhotoAdmin();
  } catch {
    return null;
  }
}

export async function saveHomepagePhoto(input: { image: Uint8Array; alt: string; expectedVersion: number }) {
  const access = await homepagePhotoAdmin();
  if (!access) throw new HomepagePhotoError("Only this church's administrator can change the photo.", 403);
  return prisma.$transaction(async (tx) => {
    if (!await lockOrganizationForLedger(tx, access.organizationId)) throw new HomepagePhotoError("Church unavailable.", 403);
    const currentAccess = await homepagePhotoAdmin(tx);
    if (!currentAccess || currentAccess.organizationId !== access.organizationId || currentAccess.userAccountId !== access.userAccountId) {
      throw new HomepagePhotoError("Administrator access changed. Refresh the page.", 403);
    }
    const current = await tx.homepagePhoto.findUnique({ where: { organizationId: access.organizationId } });
    if ((current?.version ?? 0) !== input.expectedVersion) throw new HomepagePhotoError("Someone changed the photo. Refresh before saving again.", 409);
    const data = { image: new Uint8Array(input.image), alt: input.alt, version: (current?.version ?? 0) + 1 };
    const saved = await tx.homepagePhoto.upsert({ where: { organizationId: access.organizationId },
      create: { organizationId: access.organizationId, ...data }, update: data });
    await createAuditEvent({ organizationId: access.organizationId, actorUserAccountId: access.userAccountId,
      action: "UPDATE_HOMEPAGE_PHOTO", entityType: "HomepagePhoto", entityId: access.organizationId,
      changes: [{ field: "version", oldValue: String(current?.version ?? 0), newValue: String(saved.version) }] }, tx);
    return saved.version;
  });
}
