import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

export type AuditChange = {
  field: string;
  oldValue: string | null;
  newValue: string | null;
};

export type CreateAuditEventInput = {
  organizationId: string;
  actorUserAccountId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  changes: AuditChange[];
};

type AuditWriter = {
  auditEvent: {
    create: typeof prisma.auditEvent.create;
  };
};

export async function createAuditEvent(
  input: CreateAuditEventInput,
  db: AuditWriter = prisma,
) {
  const changeMetadata: Prisma.InputJsonValue = {
    changes: input.changes,
  };

  return db.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorUserAccountId: input.actorUserAccountId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      changeMetadata,
    },
  });
}

export async function findEntityAuditEvents(
  organizationId: string,
  entityType: string,
  entityId: string,
  take = 20,
) {
  return prisma.auditEvent.findMany({
    where: {
      organizationId,
      entityType,
      entityId,
    },
    include: {
      actor: {
        select: {
          displayName: true,
          primaryEmail: true,
        },
      },
    },
    orderBy: {
      occurredAt: "desc",
    },
    take,
  });
}

export async function findOrganizationAuditEvents(organizationId: string) {
  return prisma.auditEvent.findMany({
    where: {
      organizationId,
      entityType: "Organization",
    },
    include: {
      actor: {
        select: {
          displayName: true,
          primaryEmail: true,
        },
      },
    },
    orderBy: {
      occurredAt: "desc",
    },
    take: 20,
  });
}
