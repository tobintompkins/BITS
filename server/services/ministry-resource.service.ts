import { getMemberEngagementAccess } from "@/lib/auth/member-engagement-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import {
  MINISTRY_RESOURCE_STATUS_LABELS,
  formatMinistryResourceDate,
  ministryResourceHostname,
  parseApprovedHttpsUrl,
  parseMinistryResourceCreate,
  parseMinistryResourceId,
  parseMinistryResourceUpdate,
  parseStaffMinistryResourceFilter,
  type MemberMinistryResourceGroup,
  type MinistryResourceStatus,
  type StaffMinistryResourceFilter,
  type StaffMinistryResourceRow,
} from "@/lib/validation/ministry-resource";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type StaffMinistryResourceOption = {
  id: string;
  label: string;
};

export type StaffMinistryResourcesView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID_FILTER" }
  | {
      status: "READY";
      filterStatus: StaffMinistryResourceFilter | null;
      selectedMinistryId: string | null;
      ministries: StaffMinistryResourceOption[];
      rows: StaffMinistryResourceRow[];
    };

export type StaffMinistryResourceMutationResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID" }
  | { status: "NOT_FOUND" }
  | { status: "CREATED" }
  | { status: "UPDATED" }
  | { status: "PUBLISHED" }
  | { status: "UNPUBLISHED" }
  | { status: "ARCHIVED" }
  | { status: "RESTORED" };

export type MemberMinistryResourcesView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "CONNECTION_PENDING"; accountEmail: string }
  | { status: "READY"; groups: MemberMinistryResourceGroup[] };

const staffSelect = {
  id: true,
  ministryId: true,
  title: true,
  description: true,
  url: true,
  status: true,
  archivedAt: true,
  updatedAt: true,
  ministry: { select: { name: true } },
} as const;

const memberSelect = {
  title: true,
  description: true,
  url: true,
  ministry: { select: { name: true } },
} as const;

async function requireStaffResourceAccess() {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" as const };

  const access = await getMemberEngagementAccess(organization.id);
  if (!access.canManageMinistries) {
    return { status: "UNAUTHORIZED" as const };
  }

  return { status: "READY" as const, userAccount, organization };
}

async function assertActiveMinistry(organizationId: string, ministryId: string) {
  return prisma.ministry.findFirst({
    where: {
      id: ministryId,
      organizationId,
      isActive: true,
    },
    select: { id: true },
  });
}

function toStaffRow(row: {
  id: string;
  ministryId: string;
  title: string;
  description: string | null;
  url: string;
  status: MinistryResourceStatus;
  archivedAt: Date | null;
  updatedAt: Date;
  ministry: { name: string };
}): StaffMinistryResourceRow {
  return {
    resourceId: row.id,
    ministryId: row.ministryId,
    ministryName: row.ministry.name,
    title: row.title,
    description: row.description ?? "",
    url: row.url,
    hostname: ministryResourceHostname(row.url) ?? new URL(row.url).hostname,
    status: row.status,
    statusLabel: MINISTRY_RESOURCE_STATUS_LABELS[row.status],
    updatedOnLabel: formatMinistryResourceDate(row.updatedAt),
    archived: row.archivedAt != null,
  };
}

/**
 * Ownership-scoped staff resource management. Client organization
 * fields are ignored.
 */
export async function getStaffMinistryResources(
  input: unknown = {},
): Promise<StaffMinistryResourcesView> {
  const access = await requireStaffResourceAccess();
  if (access.status !== "READY") return access;

  const parsed = parseStaffMinistryResourceFilter(input);
  if (!parsed.success) return { status: "INVALID_FILTER" };

  const ministries = await prisma.ministry.findMany({
    where: {
      organizationId: access.organization.id,
      isActive: true,
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const selectedMinistryId = parsed.data.ministryId
    ? (ministries.find((ministry) => ministry.id === parsed.data.ministryId)?.id ??
      null)
    : null;
  if (parsed.data.ministryId && !selectedMinistryId) {
    return { status: "INVALID_FILTER" };
  }

  const records = await prisma.ministryResource.findMany({
    where: {
      organizationId: access.organization.id,
      ...(selectedMinistryId ? { ministryId: selectedMinistryId } : {}),
      archivedAt: parsed.data.status === "ARCHIVED" ? { not: null } : null,
      ...(parsed.data.status === "DRAFT" || parsed.data.status === "PUBLISHED"
        ? { status: parsed.data.status }
        : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
    select: staffSelect,
  });

  return {
    status: "READY",
    filterStatus: parsed.data.status,
    selectedMinistryId,
    ministries: ministries.map((ministry) => ({
      id: ministry.id,
      label: ministry.name,
    })),
    rows: records.map(toStaffRow),
  };
}

export async function createMinistryResource(
  input: unknown,
): Promise<StaffMinistryResourceMutationResult> {
  const access = await requireStaffResourceAccess();
  if (access.status !== "READY") return access;

  const parsed = parseMinistryResourceCreate(input);
  if (!parsed.success) return { status: "INVALID" };
  const url = parseApprovedHttpsUrl(parsed.data.url);
  if (!url) return { status: "INVALID" };

  const ministry = await assertActiveMinistry(
    access.organization.id,
    parsed.data.ministryId,
  );
  if (!ministry) return { status: "NOT_FOUND" };

  const created = await prisma.ministryResource.create({
    data: {
      organizationId: access.organization.id,
      ministryId: ministry.id,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      url,
      status: "DRAFT",
      createdByUserAccountId: access.userAccount.id,
      updatedByUserAccountId: access.userAccount.id,
    },
    select: { id: true },
  });

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "CREATE_MINISTRY_RESOURCE",
    entityType: "MinistryResource",
    entityId: created.id,
    changes: [
      { field: "title", oldValue: null, newValue: "set" },
      { field: "status", oldValue: null, newValue: "DRAFT" },
    ],
  });

  return { status: "CREATED" };
}

export async function updateMinistryResource(
  input: unknown,
): Promise<StaffMinistryResourceMutationResult> {
  const access = await requireStaffResourceAccess();
  if (access.status !== "READY") return access;

  const parsed = parseMinistryResourceUpdate(input);
  if (!parsed.success) return { status: "INVALID" };
  const url = parseApprovedHttpsUrl(parsed.data.url);
  if (!url) return { status: "INVALID" };

  const ministry = await assertActiveMinistry(
    access.organization.id,
    parsed.data.ministryId,
  );
  if (!ministry) return { status: "NOT_FOUND" };

  const existing = await prisma.ministryResource.findFirst({
    where: {
      id: parsed.data.resourceId,
      organizationId: access.organization.id,
      archivedAt: null,
    },
    select: { id: true, title: true, ministryId: true, url: true },
  });
  if (!existing) return { status: "NOT_FOUND" };

  const updated = await prisma.ministryResource.updateMany({
    where: {
      id: existing.id,
      organizationId: access.organization.id,
      archivedAt: null,
    },
    data: {
      ministryId: ministry.id,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      url,
      updatedByUserAccountId: access.userAccount.id,
    },
  });
  if (updated.count !== 1) return { status: "NOT_FOUND" };

  const changes: Array<{
    field: string;
    oldValue: string | null;
    newValue: string | null;
  }> = [];
  if (existing.title !== parsed.data.title) {
    changes.push({ field: "title", oldValue: "set", newValue: "set" });
  }
  if (existing.ministryId !== ministry.id) {
    changes.push({ field: "ministryId", oldValue: "set", newValue: "set" });
  }
  if (existing.url !== url) {
    changes.push({ field: "url", oldValue: "set", newValue: "set" });
  }

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "UPDATE_MINISTRY_RESOURCE",
    entityType: "MinistryResource",
    entityId: existing.id,
    changes,
  });

  return { status: "UPDATED" };
}

export async function publishMinistryResource(
  input: unknown,
): Promise<StaffMinistryResourceMutationResult> {
  return setMinistryResourceStatus(input, "PUBLISHED");
}

export async function unpublishMinistryResource(
  input: unknown,
): Promise<StaffMinistryResourceMutationResult> {
  return setMinistryResourceStatus(input, "DRAFT");
}

async function setMinistryResourceStatus(
  input: unknown,
  status: MinistryResourceStatus,
): Promise<StaffMinistryResourceMutationResult> {
  const access = await requireStaffResourceAccess();
  if (access.status !== "READY") return access;

  const parsed = parseMinistryResourceId(input);
  if (!parsed.success) return { status: "INVALID" };

  const existing = await prisma.ministryResource.findFirst({
    where: {
      id: parsed.data,
      organizationId: access.organization.id,
      archivedAt: null,
    },
    select: { id: true, status: true },
  });
  if (!existing) return { status: "NOT_FOUND" };

  const updated = await prisma.ministryResource.updateMany({
    where: {
      id: existing.id,
      organizationId: access.organization.id,
      archivedAt: null,
    },
    data: {
      status,
      updatedByUserAccountId: access.userAccount.id,
    },
  });
  if (updated.count !== 1) return { status: "NOT_FOUND" };

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action:
      status === "PUBLISHED"
        ? "PUBLISH_MINISTRY_RESOURCE"
        : "UNPUBLISH_MINISTRY_RESOURCE",
    entityType: "MinistryResource",
    entityId: existing.id,
    changes: [
      { field: "status", oldValue: existing.status, newValue: status },
    ],
  });

  return { status: status === "PUBLISHED" ? "PUBLISHED" : "UNPUBLISHED" };
}

export async function archiveMinistryResource(
  input: unknown,
): Promise<StaffMinistryResourceMutationResult> {
  const access = await requireStaffResourceAccess();
  if (access.status !== "READY") return access;

  const parsed = parseMinistryResourceId(input);
  if (!parsed.success) return { status: "INVALID" };

  const existing = await prisma.ministryResource.findFirst({
    where: {
      id: parsed.data,
      organizationId: access.organization.id,
      archivedAt: null,
    },
    select: { id: true },
  });
  if (!existing) return { status: "NOT_FOUND" };

  const updated = await prisma.ministryResource.updateMany({
    where: {
      id: existing.id,
      organizationId: access.organization.id,
      archivedAt: null,
    },
    data: {
      archivedAt: new Date(),
      archivedByUserAccountId: access.userAccount.id,
      updatedByUserAccountId: access.userAccount.id,
    },
  });
  if (updated.count !== 1) return { status: "NOT_FOUND" };

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "ARCHIVE_MINISTRY_RESOURCE",
    entityType: "MinistryResource",
    entityId: existing.id,
    changes: [{ field: "archivedAt", oldValue: null, newValue: "set" }],
  });

  return { status: "ARCHIVED" };
}

export async function restoreMinistryResource(
  input: unknown,
): Promise<StaffMinistryResourceMutationResult> {
  const access = await requireStaffResourceAccess();
  if (access.status !== "READY") return access;

  const parsed = parseMinistryResourceId(input);
  if (!parsed.success) return { status: "INVALID" };

  const existing = await prisma.ministryResource.findFirst({
    where: {
      id: parsed.data,
      organizationId: access.organization.id,
      archivedAt: { not: null },
    },
    select: { id: true },
  });
  if (!existing) return { status: "NOT_FOUND" };

  const updated = await prisma.ministryResource.updateMany({
    where: {
      id: existing.id,
      organizationId: access.organization.id,
      archivedAt: { not: null },
    },
    data: {
      archivedAt: null,
      archivedByUserAccountId: null,
      updatedByUserAccountId: access.userAccount.id,
    },
  });
  if (updated.count !== 1) return { status: "NOT_FOUND" };

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "RESTORE_MINISTRY_RESOURCE",
    entityType: "MinistryResource",
    entityId: existing.id,
    changes: [{ field: "archivedAt", oldValue: "set", newValue: null }],
  });

  return { status: "RESTORED" };
}

/**
 * Read-only published resources for ministries the linked member serves.
 * Account, organization, and member are resolved server-side only.
 */
export async function getMemberMinistryResources(): Promise<MemberMinistryResourcesView> {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" };

  const member = await prisma.member.findFirst({
    where: {
      organizationId: organization.id,
      userAccountId: userAccount.id,
      recordStatus: "ACTIVE",
    },
    select: { id: true },
  });
  if (!member) {
    return {
      status: "CONNECTION_PENDING",
      accountEmail: userAccount.primaryEmail,
    };
  }

  const records = await prisma.ministryResource.findMany({
    where: {
      organizationId: organization.id,
      status: "PUBLISHED",
      archivedAt: null,
      ministry: {
        organizationId: organization.id,
        isActive: true,
        members: {
          some: {
            memberId: member.id,
            status: "ACTIVE",
            endedDate: null,
          },
        },
      },
    },
    orderBy: [{ ministry: { name: "asc" } }, { title: "asc" }],
    select: memberSelect,
  });

  const groups = new Map<string, MemberMinistryResourceGroup["resources"]>();
  for (const row of records) {
    const href = parseApprovedHttpsUrl(row.url);
    if (!href) continue;
    const list = groups.get(row.ministry.name) ?? [];
    list.push({
      title: row.title,
      description: row.description,
      url: href,
    });
    groups.set(row.ministry.name, list);
  }

  return {
    status: "READY",
    groups: [...groups.entries()].map(([ministryName, resources]) => ({
      ministryName,
      resources,
    })),
  };
}
