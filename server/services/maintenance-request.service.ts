import type { Prisma } from "@/app/generated/prisma/client";

import { getEventAccess } from "@/lib/auth/event-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import {
  MAINTENANCE_PRIORITY_LABELS,
  MAINTENANCE_REQUEST_STATUS_LABELS,
  formatMaintenanceDate,
  maintenanceAuditValue,
  parseMaintenanceCreate,
  parseMaintenanceFilter,
  parseMaintenanceStatusChange,
  parseMaintenanceUpdate,
  type MaintenancePriority,
  type MaintenanceRequestCounts,
  type MaintenanceRequestRow,
  type MaintenanceRequestStatus,
} from "@/lib/validation/maintenance-request";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type MaintenanceRequestsView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID_FILTER" }
  | {
      status: "READY";
      canManage: boolean;
      counts: MaintenanceRequestCounts;
      equipmentOptions: Array<{ id: string; label: string }>;
      rows: MaintenanceRequestRow[];
    };

export type MaintenanceRequestMutationResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID" }
  | { status: "NOT_FOUND" }
  | { status: "CREATED" }
  | { status: "UPDATED" }
  | { status: "STATUS_CHANGED" };

const requestSelect = {
  id: true,
  title: true,
  description: true,
  locationDescription: true,
  equipmentItemId: true,
  priority: true,
  status: true,
  resolutionNote: true,
  resolvedAt: true,
  createdAt: true,
  assignedTo: { select: { displayName: true } },
  equipmentItem: { select: { name: true, organizationId: true } },
} as const;

type LinkedAccess = {
  status: "READY";
  userAccount: { id: string };
  organization: { id: string };
  canManage: boolean;
};

async function requireMaintenanceAccess(mode: "view" | "manage") {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" as const };

  const access = await getEventAccess(organization.id);
  if (!access.canView) return { status: "UNAUTHORIZED" as const };
  if (mode === "manage" && !access.canManageLocations) {
    return { status: "UNAUTHORIZED" as const };
  }

  return {
    status: "READY" as const,
    userAccount,
    organization,
    canManage: access.canManageLocations,
  } satisfies LinkedAccess;
}

function staffDisplayName(displayName: string | null | undefined) {
  const name = displayName?.trim();
  return name ? name : null;
}

function toRow(row: {
  id: string;
  title: string;
  description: string;
  locationDescription: string | null;
  equipmentItemId: string | null;
  priority: MaintenancePriority;
  status: MaintenanceRequestStatus;
  resolutionNote: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  assignedTo: { displayName: string | null } | null;
  equipmentItem: { name: string; organizationId: string } | null;
}): MaintenanceRequestRow {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    locationDescription: row.locationDescription,
    equipmentItemId: row.equipmentItemId,
    equipmentName: row.equipmentItem?.name ?? null,
    priority: row.priority,
    priorityLabel: MAINTENANCE_PRIORITY_LABELS[row.priority],
    status: row.status,
    statusLabel: MAINTENANCE_REQUEST_STATUS_LABELS[row.status],
    assignedToName: staffDisplayName(row.assignedTo?.displayName),
    reportedOnLabel: formatMaintenanceDate(row.createdAt),
    resolutionNote: row.resolutionNote,
    resolvedOnLabel: row.resolvedAt
      ? formatMaintenanceDate(row.resolvedAt)
      : null,
  };
}

async function currentOrgEquipment(
  organizationId: string,
  equipmentItemId: string | undefined,
) {
  if (!equipmentItemId) return { ok: true as const, id: null };
  const item = await prisma.equipmentItem.findFirst({
    where: { id: equipmentItemId, organizationId },
    select: { id: true },
  });
  if (!item) return { ok: false as const };
  return { ok: true as const, id: item.id };
}

/**
 * Staff maintenance-request list. Organization and permissions are resolved
 * server-side. Assignee IDs from the client are ignored in this patch.
 */
export async function getMaintenanceRequests(
  input: unknown = {},
): Promise<MaintenanceRequestsView> {
  const access = await requireMaintenanceAccess("view");
  if (access.status !== "READY") return access;

  const parsed = parseMaintenanceFilter(input);
  if (!parsed.success) return { status: "INVALID_FILTER" };
  const filter = parsed.data;

  if (filter.equipmentItemId) {
    const equipment = await currentOrgEquipment(
      access.organization.id,
      filter.equipmentItemId,
    );
    if (!equipment.ok) return { status: "INVALID_FILTER" };
  }

  const where: Prisma.MaintenanceRequestWhereInput = {
    organizationId: access.organization.id,
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.priority ? { priority: filter.priority } : {}),
    ...(filter.equipmentItemId
      ? { equipmentItemId: filter.equipmentItemId }
      : {}),
    ...(filter.q
      ? {
          OR: [
            { title: { contains: filter.q, mode: "insensitive" } },
            {
              locationDescription: {
                contains: filter.q,
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
  };

  const [records, open, inProgress, completed, urgent, equipmentItems] =
    await Promise.all([
      prisma.maintenanceRequest.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { title: "asc" }],
        select: requestSelect,
      }),
      prisma.maintenanceRequest.count({
        where: { organizationId: access.organization.id, status: "OPEN" },
      }),
      prisma.maintenanceRequest.count({
        where: {
          organizationId: access.organization.id,
          status: "IN_PROGRESS",
        },
      }),
      prisma.maintenanceRequest.count({
        where: { organizationId: access.organization.id, status: "COMPLETED" },
      }),
      prisma.maintenanceRequest.count({
        where: {
          organizationId: access.organization.id,
          priority: "URGENT",
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
      }),
      prisma.equipmentItem.findMany({
        where: {
          organizationId: access.organization.id,
          archivedAt: null,
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);

  return {
    status: "READY",
    canManage: access.canManage,
    counts: { open, inProgress, completed, urgent },
    equipmentOptions: equipmentItems.map((item) => ({
      id: item.id,
      label: item.name,
    })),
    rows: records.map((row) =>
      toRow({
        ...row,
        priority: row.priority as MaintenancePriority,
        status: row.status as MaintenanceRequestStatus,
      }),
    ),
  };
}

export async function createMaintenanceRequest(
  input: unknown,
): Promise<MaintenanceRequestMutationResult> {
  const access = await requireMaintenanceAccess("manage");
  if (access.status !== "READY") return access;

  const parsed = parseMaintenanceCreate(input);
  if (!parsed.success) return { status: "INVALID" };

  const equipment = await currentOrgEquipment(
    access.organization.id,
    parsed.data.equipmentItemId,
  );
  if (!equipment.ok) return { status: "NOT_FOUND" };

  const created = await prisma.maintenanceRequest.create({
    data: {
      organizationId: access.organization.id,
      equipmentItemId: equipment.id,
      title: parsed.data.title,
      description: parsed.data.description,
      locationDescription: parsed.data.locationDescription ?? null,
      priority: parsed.data.priority,
      status: "OPEN",
      reportedByUserAccountId: access.userAccount.id,
    },
    select: { id: true },
  });

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "CREATE_MAINTENANCE_REQUEST",
    entityType: "MaintenanceRequest",
    entityId: created.id,
    changes: [
      { field: "title", oldValue: null, newValue: "set" },
      { field: "description", oldValue: null, newValue: "set" },
      { field: "priority", oldValue: null, newValue: parsed.data.priority },
      { field: "status", oldValue: null, newValue: "OPEN" },
    ],
  });

  return { status: "CREATED" };
}

export async function updateMaintenanceRequest(
  input: unknown,
): Promise<MaintenanceRequestMutationResult> {
  const access = await requireMaintenanceAccess("manage");
  if (access.status !== "READY") return access;

  const parsed = parseMaintenanceUpdate(input);
  if (!parsed.success) return { status: "INVALID" };

  const existing = await prisma.maintenanceRequest.findFirst({
    where: {
      id: parsed.data.requestId,
      organizationId: access.organization.id,
    },
    select: {
      id: true,
      title: true,
      priority: true,
      equipmentItemId: true,
    },
  });
  if (!existing) return { status: "NOT_FOUND" };

  const equipment = await currentOrgEquipment(
    access.organization.id,
    parsed.data.equipmentItemId,
  );
  if (!equipment.ok) return { status: "NOT_FOUND" };

  await prisma.maintenanceRequest.update({
    where: { id: existing.id },
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      locationDescription: parsed.data.locationDescription ?? null,
      priority: parsed.data.priority,
      equipmentItemId: equipment.id,
    },
  });

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "UPDATE_MAINTENANCE_REQUEST",
    entityType: "MaintenanceRequest",
    entityId: existing.id,
    changes: [
      existing.priority !== parsed.data.priority
        ? {
            field: "priority",
            oldValue: existing.priority,
            newValue: parsed.data.priority,
          }
        : { field: "title", oldValue: "set", newValue: "set" },
    ],
  });

  return { status: "UPDATED" };
}

export async function changeMaintenanceRequestStatus(
  input: unknown,
): Promise<MaintenanceRequestMutationResult> {
  const access = await requireMaintenanceAccess("manage");
  if (access.status !== "READY") return access;

  const parsed = parseMaintenanceStatusChange(input);
  if (!parsed.success) return { status: "INVALID" };

  const existing = await prisma.maintenanceRequest.findFirst({
    where: {
      id: parsed.data.requestId,
      organizationId: access.organization.id,
    },
    select: { id: true, status: true },
  });
  if (!existing) return { status: "NOT_FOUND" };

  const closing =
    parsed.data.status === "COMPLETED" || parsed.data.status === "CANCELLED";

  await prisma.maintenanceRequest.update({
    where: { id: existing.id },
    data: {
      status: parsed.data.status,
      resolutionNote: closing ? parsed.data.resolutionNote ?? null : undefined,
      resolvedAt: closing ? new Date() : null,
    },
  });

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "CHANGE_MAINTENANCE_REQUEST_STATUS",
    entityType: "MaintenanceRequest",
    entityId: existing.id,
    changes: [
      {
        field: "status",
        oldValue: existing.status,
        newValue: parsed.data.status,
      },
      {
        field: "resolutionNote",
        oldValue: null,
        newValue: maintenanceAuditValue(parsed.data.resolutionNote),
      },
    ],
  });

  return { status: "STATUS_CHANGED" };
}
