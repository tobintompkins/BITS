import {
  getAnnouncementAccess,
} from "@/lib/auth/announcement-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import {
  churchAnnouncementContentSchema,
  churchAnnouncementIdSchema,
} from "@/lib/validation/church-announcement";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

const announcementSelect = {
  id: true,
  title: true,
  body: true,
  status: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function requireManageContext() {
  const actor = await getOrCreateUserAccount();
  if (!actor) {
    throw new Error("You must be signed in.");
  }

  const organization = await findPrimaryOrganization();
  if (!organization) {
    throw new Error("Church organization not found.");
  }

  const access = await getAnnouncementAccess(organization.id);
  if (!access.canManageAnnouncements) {
    throw new Error(
      "You do not have permission to manage church announcements.",
    );
  }

  return { actor, organization };
}

function parseContent(input: unknown) {
  const parsed = churchAnnouncementContentSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid announcement.");
  }
  return parsed.data;
}

function parseAnnouncementId(id: unknown) {
  const parsed = churchAnnouncementIdSchema.safeParse(id);
  if (!parsed.success) {
    throw new Error("Announcement was not found.");
  }
  return parsed.data;
}

function auditChanges(input: {
  action: string;
  previousStatus?: string | null;
  nextStatus: string;
  titleLength: number;
  entityId: string;
}) {
  return [
    { field: "action", oldValue: null, newValue: input.action },
    {
      field: "status",
      oldValue: input.previousStatus ?? null,
      newValue: input.nextStatus,
    },
    {
      field: "titleLength",
      oldValue: null,
      newValue: String(input.titleLength),
    },
    { field: "entityId", oldValue: null, newValue: input.entityId },
  ];
}

export async function listChurchAnnouncements() {
  const { organization } = await requireManageContext();

  const [published, draftsAndArchived] = await Promise.all([
    prisma.churchAnnouncement.findMany({
      where: { organizationId: organization.id, status: "PUBLISHED" },
      select: announcementSelect,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    }),
    prisma.churchAnnouncement.findMany({
      where: {
        organizationId: organization.id,
        status: { in: ["DRAFT", "ARCHIVED"] },
      },
      select: announcementSelect,
      orderBy: [{ createdAt: "desc" }],
    }),
  ]);

  return [...published, ...draftsAndArchived];
}

export async function createDraftAnnouncement(input: unknown) {
  const { actor, organization } = await requireManageContext();
  const content = parseContent(input);

  const announcement = await prisma.churchAnnouncement.create({
    data: {
      organizationId: organization.id,
      title: content.title,
      body: content.body,
      status: "DRAFT",
      publishedAt: null,
      createdByUserAccountId: actor.id,
    },
    select: announcementSelect,
  });

  await createAuditEvent({
    organizationId: organization.id,
    actorUserAccountId: actor.id,
    action: "CREATE_CHURCH_ANNOUNCEMENT",
    entityType: "ChurchAnnouncement",
    entityId: announcement.id,
    changes: auditChanges({
      action: "CREATE_CHURCH_ANNOUNCEMENT",
      previousStatus: null,
      nextStatus: "DRAFT",
      titleLength: content.title.length,
      entityId: announcement.id,
    }),
  });

  return announcement;
}

export async function updateDraftAnnouncement(id: unknown, input: unknown) {
  const { actor, organization } = await requireManageContext();
  const announcementId = parseAnnouncementId(id);
  const content = parseContent(input);

  const existing = await prisma.churchAnnouncement.findFirst({
    where: { id: announcementId, organizationId: organization.id },
    select: { id: true, status: true, title: true },
  });
  if (!existing) {
    throw new Error("Announcement was not found.");
  }
  if (existing.status !== "DRAFT") {
    throw new Error("Only draft announcements can be edited.");
  }

  const updated = await prisma.churchAnnouncement.update({
    where: { id: existing.id },
    data: { title: content.title, body: content.body },
    select: announcementSelect,
  });

  await createAuditEvent({
    organizationId: organization.id,
    actorUserAccountId: actor.id,
    action: "UPDATE_CHURCH_ANNOUNCEMENT",
    entityType: "ChurchAnnouncement",
    entityId: updated.id,
    changes: auditChanges({
      action: "UPDATE_CHURCH_ANNOUNCEMENT",
      previousStatus: "DRAFT",
      nextStatus: "DRAFT",
      titleLength: content.title.length,
      entityId: updated.id,
    }),
  });

  return updated;
}

export async function publishChurchAnnouncement(id: unknown, now = new Date()) {
  const { actor, organization } = await requireManageContext();
  const announcementId = parseAnnouncementId(id);

  const existing = await prisma.churchAnnouncement.findFirst({
    where: { id: announcementId, organizationId: organization.id },
    select: { id: true, status: true, title: true, publishedAt: true },
  });
  if (!existing) {
    throw new Error("Announcement was not found.");
  }
  if (existing.status !== "DRAFT") {
    throw new Error("Only draft announcements can be published.");
  }

  const published = await prisma.churchAnnouncement.update({
    where: { id: existing.id },
    data: {
      status: "PUBLISHED",
      publishedAt: existing.publishedAt ?? now,
    },
    select: announcementSelect,
  });

  await createAuditEvent({
    organizationId: organization.id,
    actorUserAccountId: actor.id,
    action: "PUBLISH_CHURCH_ANNOUNCEMENT",
    entityType: "ChurchAnnouncement",
    entityId: published.id,
    changes: auditChanges({
      action: "PUBLISH_CHURCH_ANNOUNCEMENT",
      previousStatus: "DRAFT",
      nextStatus: "PUBLISHED",
      titleLength: existing.title.length,
      entityId: published.id,
    }),
  });

  return published;
}

export async function archiveChurchAnnouncement(id: unknown) {
  const { actor, organization } = await requireManageContext();
  const announcementId = parseAnnouncementId(id);

  const existing = await prisma.churchAnnouncement.findFirst({
    where: { id: announcementId, organizationId: organization.id },
    select: { id: true, status: true, title: true, publishedAt: true },
  });
  if (!existing) {
    throw new Error("Announcement was not found.");
  }
  if (existing.status !== "DRAFT" && existing.status !== "PUBLISHED") {
    throw new Error("Only draft or published announcements can be archived.");
  }

  const archived = await prisma.churchAnnouncement.update({
    where: { id: existing.id },
    data: { status: "ARCHIVED" },
    select: announcementSelect,
  });

  await createAuditEvent({
    organizationId: organization.id,
    actorUserAccountId: actor.id,
    action: "ARCHIVE_CHURCH_ANNOUNCEMENT",
    entityType: "ChurchAnnouncement",
    entityId: archived.id,
    changes: auditChanges({
      action: "ARCHIVE_CHURCH_ANNOUNCEMENT",
      previousStatus: existing.status,
      nextStatus: "ARCHIVED",
      titleLength: existing.title.length,
      entityId: archived.id,
    }),
  });

  return archived;
}
