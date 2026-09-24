import { getAnnouncementAccess } from "@/lib/auth/announcement-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import { markMemberAnnouncementReadSchema } from "@/lib/validation/member-announcement-read";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

function announcementIdFrom(input: unknown) {
  if (typeof input === "string") return input;
  if (input && typeof input === "object" && "announcementId" in input) {
    return (input as { announcementId?: unknown }).announcementId;
  }
  return undefined;
}

export async function markMemberAnnouncementRead(input: unknown) {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" as const };

  const parsed = markMemberAnnouncementReadSchema.safeParse({
    announcementId: announcementIdFrom(input),
  });
  if (!parsed.success) return { status: "NOT_FOUND" as const };

  const announcement = await prisma.churchAnnouncement.findFirst({
    where: {
      id: parsed.data.announcementId,
      organizationId: organization.id,
      status: "PUBLISHED",
      publishedAt: { not: null },
    },
    select: { id: true },
  });
  if (!announcement) return { status: "NOT_FOUND" as const };

  const existing = await prisma.churchAnnouncementReadReceipt.findUnique({
    where: {
      organizationId_announcementId_userAccountId: {
        organizationId: organization.id,
        announcementId: announcement.id,
        userAccountId: userAccount.id,
      },
    },
    select: { readAt: true },
  });
  if (existing) {
    return { status: "MARKED" as const, readAt: existing.readAt };
  }

  const created = await prisma.churchAnnouncementReadReceipt.create({
    data: {
      organizationId: organization.id,
      announcementId: announcement.id,
      userAccountId: userAccount.id,
    },
    select: { readAt: true },
  });

  await createAuditEvent({
    organizationId: organization.id,
    actorUserAccountId: userAccount.id,
    action: "MARK_ANNOUNCEMENT_READ",
    entityType: "ChurchAnnouncement",
    entityId: announcement.id,
    changes: [
      { field: "action", oldValue: null, newValue: "MARK_ANNOUNCEMENT_READ" },
    ],
  });

  return { status: "MARKED" as const, readAt: created.readAt };
}

export async function getStaffAnnouncementReadTotals() {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" as const };

  const access = await getAnnouncementAccess(organization.id);
  if (!access.canManageAnnouncements) {
    return { status: "FORBIDDEN" as const };
  }

  const groups = await prisma.churchAnnouncementReadReceipt.groupBy({
    by: ["announcementId"],
    where: { organizationId: organization.id },
    _count: { _all: true },
  });

  return {
    status: "READY" as const,
    totals: groups.map((row) => ({
      announcementId: row.announcementId,
      readCount: row._count._all,
    })),
  };
}
