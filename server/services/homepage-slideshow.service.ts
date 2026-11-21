import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { lockOrganizationForLedger } from "@/lib/batches/ledger-locks";
import { findPublicOrganization } from "@/server/repositories/public-organization.repository";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { homepagePhotoAdmin } from "@/server/services/homepage-photo.service";

export const MAX_HOMEPAGE_SLIDESHOW_PHOTOS = 12;
const PHOTO_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class HomepageSlideshowError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

function isSlideshowStorageMissing(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error && error.message != null ? String(error.message) : "";
  return code === "P2021" || /homepage_slideshow_photos/i.test(message);
}

export async function publicHomepageSlideshow() {
  try {
    const organization = await findPublicOrganization();
    if (!organization) return [];
    return await prisma.homepageSlideshowPhoto.findMany({
      where: { organizationId: organization.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, alt: true, sortOrder: true },
    });
  } catch {
    return [];
  }
}

export async function publicHomepageSlideshowImage(id: string) {
  if (!PHOTO_ID.test(id)) return null;
  try {
    const organization = await findPublicOrganization();
    if (!organization) return null;
    const photo = await prisma.homepageSlideshowPhoto.findFirst({
      where: { id, organizationId: organization.id },
      select: { image: true },
    });
    return photo?.image ?? null;
  } catch {
    return null;
  }
}

async function requireSlideshowAdmin(db: Prisma.TransactionClient = prisma) {
  const access = await homepagePhotoAdmin(db);
  if (!access) throw new HomepageSlideshowError("Only this church's administrator can change the slideshow.", 403);
  return access;
}

export async function addHomepageSlideshowPhoto(input: { image: Uint8Array; alt: string }) {
  const access = await requireSlideshowAdmin();
  try {
    return await prisma.$transaction(async (tx) => {
      if (!await lockOrganizationForLedger(tx, access.organizationId)) throw new HomepageSlideshowError("Church unavailable.", 403);
      const currentAccess = await requireSlideshowAdmin(tx);
      if (currentAccess.organizationId !== access.organizationId || currentAccess.userAccountId !== access.userAccountId) {
        throw new HomepageSlideshowError("Administrator access changed. Refresh the page.", 403);
      }
      const count = await tx.homepageSlideshowPhoto.count({ where: { organizationId: access.organizationId } });
      if (count >= MAX_HOMEPAGE_SLIDESHOW_PHOTOS) {
        throw new HomepageSlideshowError("The slideshow can hold 12 photos. Remove one before adding another.", 400);
      }
      const last = await tx.homepageSlideshowPhoto.findFirst({
        where: { organizationId: access.organizationId },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      const saved = await tx.homepageSlideshowPhoto.create({
        data: {
          organizationId: access.organizationId,
          image: new Uint8Array(input.image),
          alt: input.alt,
          sortOrder: (last?.sortOrder ?? -1) + 1,
        },
        select: { id: true, alt: true, sortOrder: true },
      });
      await createAuditEvent({
        organizationId: access.organizationId,
        actorUserAccountId: access.userAccountId,
        action: "ADD_HOMEPAGE_SLIDESHOW_PHOTO",
        entityType: "HomepageSlideshowPhoto",
        entityId: saved.id,
        changes: [{ field: "alt", oldValue: null, newValue: saved.alt }],
      }, tx);
      return saved;
    });
  } catch (error) {
    if (error instanceof HomepageSlideshowError) throw error;
    if (isSlideshowStorageMissing(error)) {
      throw new HomepageSlideshowError("Slideshow storage is not ready yet. Apply the slideshow migration, then try again.", 503);
    }
    throw error;
  }
}

export async function removeHomepageSlideshowPhoto(id: string) {
  if (!PHOTO_ID.test(id)) throw new HomepageSlideshowError("That slideshow photo was not found.", 404);
  const access = await requireSlideshowAdmin();
  try {
    return await prisma.$transaction(async (tx) => {
      if (!await lockOrganizationForLedger(tx, access.organizationId)) throw new HomepageSlideshowError("Church unavailable.", 403);
      await requireSlideshowAdmin(tx);
      const existing = await tx.homepageSlideshowPhoto.findFirst({
        where: { id, organizationId: access.organizationId },
        select: { id: true, alt: true },
      });
      if (!existing) throw new HomepageSlideshowError("That slideshow photo was not found.", 404);
      await tx.homepageSlideshowPhoto.delete({ where: { id: existing.id } });
      await createAuditEvent({
        organizationId: access.organizationId,
        actorUserAccountId: access.userAccountId,
        action: "REMOVE_HOMEPAGE_SLIDESHOW_PHOTO",
        entityType: "HomepageSlideshowPhoto",
        entityId: existing.id,
        changes: [{ field: "alt", oldValue: existing.alt, newValue: null }],
      }, tx);
    });
  } catch (error) {
    if (error instanceof HomepageSlideshowError) throw error;
    if (isSlideshowStorageMissing(error)) {
      throw new HomepageSlideshowError("Slideshow storage is not ready yet. Apply the slideshow migration, then try again.", 503);
    }
    throw error;
  }
}

export async function reorderHomepageSlideshow(ids: string[]) {
  if (!ids.every((id) => PHOTO_ID.test(id))) throw new HomepageSlideshowError("Refresh the slideshow before reordering.", 409);
  const access = await requireSlideshowAdmin();
  try {
    return await prisma.$transaction(async (tx) => {
      if (!await lockOrganizationForLedger(tx, access.organizationId)) throw new HomepageSlideshowError("Church unavailable.", 403);
      await requireSlideshowAdmin(tx);
      const photos = await tx.homepageSlideshowPhoto.findMany({
        where: { organizationId: access.organizationId },
        select: { id: true },
      });
      const current = new Set(photos.map((photo) => photo.id));
      if (ids.length !== current.size || new Set(ids).size !== ids.length || ids.some((id) => !current.has(id))) {
        throw new HomepageSlideshowError("Refresh the slideshow before reordering.", 409);
      }
      for (const [index, id] of ids.entries()) {
        await tx.homepageSlideshowPhoto.update({ where: { id }, data: { sortOrder: index } });
      }
      await createAuditEvent({
        organizationId: access.organizationId,
        actorUserAccountId: access.userAccountId,
        action: "REORDER_HOMEPAGE_SLIDESHOW_PHOTOS",
        entityType: "HomepageSlideshowPhoto",
        entityId: access.organizationId,
        changes: [{ field: "order", oldValue: photos.map((photo) => photo.id).join(","), newValue: ids.join(",") }],
      }, tx);
    });
  } catch (error) {
    if (error instanceof HomepageSlideshowError) throw error;
    if (isSlideshowStorageMissing(error)) {
      throw new HomepageSlideshowError("Slideshow storage is not ready yet. Apply the slideshow migration, then try again.", 503);
    }
    throw error;
  }
}
