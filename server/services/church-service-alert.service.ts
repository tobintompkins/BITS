import { getAnnouncementAccess } from "@/lib/auth/announcement-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import {
  churchServiceAlertAuditChanges,
  churchServiceAlertWindowsOverlap,
  isChurchServiceAlertPublic,
  parseChurchServiceAlertContent,
  parseChurchServiceAlertId,
  toChurchServiceAlertPublicView,
  toChurchServiceAlertStaffRow,
  type ChurchServiceAlertPublicView,
  type ChurchServiceAlertStaffRow,
  type ChurchServiceAlertStatus,
  type ChurchServiceAlertType,
} from "@/lib/validation/church-service-alert";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type ChurchServiceAlertsView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | {
      status: "READY";
      active: ChurchServiceAlertStaffRow | null;
      rows: ChurchServiceAlertStaffRow[];
    };

export type ChurchServiceAlertMutationResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID" }
  | { status: "NOT_FOUND" }
  | { status: "CREATED"; alertId: string }
  | { status: "UPDATED" }
  | { status: "PUBLISHED" }
  | { status: "ARCHIVED" };

export type PublicChurchServiceAlertView =
  | { status: "NONE" }
  | { status: "READY"; alert: ChurchServiceAlertPublicView };

const staffSelect = {
  id: true,
  alertType: true,
  status: true,
  title: true,
  message: true,
  startsAt: true,
  expiresAt: true,
} as const;

const publicSelect = {
  alertType: true,
  title: true,
  message: true,
  expiresAt: true,
  updatedAt: true,
} as const;

async function requireAlertAccess() {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" as const };

  const access = await getAnnouncementAccess(organization.id);
  if (!access.canManageAnnouncements) {
    return { status: "UNAUTHORIZED" as const };
  }

  return {
    status: "READY" as const,
    userAccount,
    organization,
  };
}

async function archiveConflictingPublished(
  db: {
    churchServiceAlert: {
      findMany: typeof prisma.churchServiceAlert.findMany;
      update: typeof prisma.churchServiceAlert.update;
    };
  },
  input: {
    organizationId: string;
    exceptId: string;
    startsAt: Date;
    expiresAt: Date;
    now: Date;
    actorId: string;
  },
) {
  const published = await db.churchServiceAlert.findMany({
    where: {
      organizationId: input.organizationId,
      status: "PUBLISHED",
      id: { not: input.exceptId },
    },
    select: { id: true, startsAt: true, expiresAt: true, status: true },
  });

  const window = { startsAt: input.startsAt, expiresAt: input.expiresAt };
  const toArchive = published.filter(
    (row) =>
      isChurchServiceAlertPublic(row, input.now) ||
      churchServiceAlertWindowsOverlap(row, window),
  );

  for (const row of toArchive) {
    await db.churchServiceAlert.update({
      where: { id: row.id },
      data: {
        status: "ARCHIVED",
        archivedAt: input.now,
        updatedByUserAccountId: input.actorId,
      },
    });
  }
}

export async function getChurchServiceAlerts(
  now = new Date(),
): Promise<ChurchServiceAlertsView> {
  const access = await requireAlertAccess();
  if (access.status !== "READY") return access;

  const records = await prisma.churchServiceAlert.findMany({
    where: { organizationId: access.organization.id },
    select: staffSelect,
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  const rows = records.map((record) =>
    toChurchServiceAlertStaffRow(
      {
        ...record,
        alertType: record.alertType as ChurchServiceAlertType,
        status: record.status as ChurchServiceAlertStatus,
      },
      now,
    ),
  );

  return {
    status: "READY",
    active: rows.find((row) => row.isPublic) ?? null,
    rows,
  };
}

export async function getPublicChurchServiceAlert(
  now = new Date(),
): Promise<PublicChurchServiceAlertView> {
  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NONE" };

  const record = await prisma.churchServiceAlert.findFirst({
    where: {
      organizationId: organization.id,
      status: "PUBLISHED",
      startsAt: { lte: now },
      expiresAt: { gt: now },
    },
    select: publicSelect,
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
  });

  if (!record) return { status: "NONE" };

  return {
    status: "READY",
    alert: toChurchServiceAlertPublicView({
      ...record,
      alertType: record.alertType as ChurchServiceAlertType,
    }),
  };
}

export async function createChurchServiceAlert(
  input: unknown,
): Promise<ChurchServiceAlertMutationResult> {
  const access = await requireAlertAccess();
  if (access.status !== "READY") return access;

  const parsed = parseChurchServiceAlertContent(input);
  if (!parsed.success) return { status: "INVALID" };

  const created = await prisma.churchServiceAlert.create({
    data: {
      organizationId: access.organization.id,
      alertType: parsed.data.alertType,
      status: "DRAFT",
      title: parsed.data.title,
      message: parsed.data.message,
      startsAt: parsed.data.startsAt,
      expiresAt: parsed.data.expiresAt,
      createdByUserAccountId: access.userAccount.id,
      updatedByUserAccountId: access.userAccount.id,
    },
    select: { id: true },
  });

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "CREATE_CHURCH_SERVICE_ALERT",
    entityType: "ChurchServiceAlert",
    entityId: created.id,
    changes: churchServiceAlertAuditChanges({
      action: "CREATE_CHURCH_SERVICE_ALERT",
      alertType: parsed.data.alertType,
      status: "DRAFT",
      startsAt: parsed.data.startsAt,
      expiresAt: parsed.data.expiresAt,
    }),
  });

  return { status: "CREATED", alertId: created.id };
}

export async function updateChurchServiceAlert(
  input: unknown,
): Promise<ChurchServiceAlertMutationResult> {
  const access = await requireAlertAccess();
  if (access.status !== "READY") return access;

  const id = parseChurchServiceAlertId(input);
  const parsed = parseChurchServiceAlertContent(input);
  if (!id.success || !parsed.success) return { status: "INVALID" };

  const existing = await prisma.churchServiceAlert.findFirst({
    where: { id: id.data, organizationId: access.organization.id },
    select: { id: true, status: true },
  });
  if (!existing) return { status: "NOT_FOUND" };
  if (existing.status !== "DRAFT") return { status: "INVALID" };

  await prisma.churchServiceAlert.update({
    where: { id: existing.id },
    data: {
      alertType: parsed.data.alertType,
      title: parsed.data.title,
      message: parsed.data.message,
      startsAt: parsed.data.startsAt,
      expiresAt: parsed.data.expiresAt,
      updatedByUserAccountId: access.userAccount.id,
    },
  });

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "UPDATE_CHURCH_SERVICE_ALERT",
    entityType: "ChurchServiceAlert",
    entityId: existing.id,
    changes: churchServiceAlertAuditChanges({
      action: "UPDATE_CHURCH_SERVICE_ALERT",
      alertType: parsed.data.alertType,
      status: "DRAFT",
      startsAt: parsed.data.startsAt,
      expiresAt: parsed.data.expiresAt,
    }),
  });

  return { status: "UPDATED" };
}

export async function publishChurchServiceAlert(
  input: unknown,
  now = new Date(),
): Promise<ChurchServiceAlertMutationResult> {
  const access = await requireAlertAccess();
  if (access.status !== "READY") return access;

  const id = parseChurchServiceAlertId(input);
  if (!id.success) return { status: "INVALID" };

  const content = parseChurchServiceAlertContent(input);
  const existing = await prisma.churchServiceAlert.findFirst({
    where: { id: id.data, organizationId: access.organization.id },
    select: {
      id: true,
      status: true,
      alertType: true,
      startsAt: true,
      expiresAt: true,
      publishedAt: true,
    },
  });
  if (!existing) return { status: "NOT_FOUND" };
  if (existing.status === "ARCHIVED") return { status: "INVALID" };

  const next = content.success
    ? content.data
    : {
        alertType: existing.alertType as ChurchServiceAlertType,
        startsAt: existing.startsAt,
        expiresAt: existing.expiresAt,
        title: undefined,
        message: undefined,
      };

  if (next.expiresAt.getTime() <= next.startsAt.getTime()) {
    return { status: "INVALID" };
  }

  await prisma.$transaction(async (tx) => {
    await archiveConflictingPublished(tx, {
      organizationId: access.organization.id,
      exceptId: existing.id,
      startsAt: next.startsAt,
      expiresAt: next.expiresAt,
      now,
      actorId: access.userAccount.id,
    });

    await tx.churchServiceAlert.update({
      where: { id: existing.id },
      data: {
        ...(content.success
          ? {
              alertType: content.data.alertType,
              title: content.data.title,
              message: content.data.message,
              startsAt: content.data.startsAt,
              expiresAt: content.data.expiresAt,
            }
          : {}),
        status: "PUBLISHED",
        publishedAt: existing.publishedAt ?? now,
        archivedAt: null,
        updatedByUserAccountId: access.userAccount.id,
      },
    });
  });

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "PUBLISH_CHURCH_SERVICE_ALERT",
    entityType: "ChurchServiceAlert",
    entityId: existing.id,
    changes: churchServiceAlertAuditChanges({
      action: "PUBLISH_CHURCH_SERVICE_ALERT",
      alertType: next.alertType,
      status: "PUBLISHED",
      startsAt: next.startsAt,
      expiresAt: next.expiresAt,
    }),
  });

  return { status: "PUBLISHED" };
}

export async function archiveChurchServiceAlert(
  input: unknown,
  now = new Date(),
): Promise<ChurchServiceAlertMutationResult> {
  const access = await requireAlertAccess();
  if (access.status !== "READY") return access;

  const id = parseChurchServiceAlertId(input);
  if (!id.success) return { status: "INVALID" };

  const existing = await prisma.churchServiceAlert.findFirst({
    where: { id: id.data, organizationId: access.organization.id },
    select: {
      id: true,
      status: true,
      alertType: true,
      startsAt: true,
      expiresAt: true,
    },
  });
  if (!existing) return { status: "NOT_FOUND" };
  if (existing.status === "ARCHIVED") return { status: "INVALID" };

  await prisma.churchServiceAlert.update({
    where: { id: existing.id },
    data: {
      status: "ARCHIVED",
      archivedAt: now,
      updatedByUserAccountId: access.userAccount.id,
    },
  });

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "ARCHIVE_CHURCH_SERVICE_ALERT",
    entityType: "ChurchServiceAlert",
    entityId: existing.id,
    changes: churchServiceAlertAuditChanges({
      action: "ARCHIVE_CHURCH_SERVICE_ALERT",
      alertType: existing.alertType,
      status: "ARCHIVED",
      startsAt: existing.startsAt,
      expiresAt: existing.expiresAt,
    }),
  });

  return { status: "ARCHIVED" };
}
