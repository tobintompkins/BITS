import type { Prisma } from "@/app/generated/prisma/client";

import { getEventAccess } from "@/lib/auth/event-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import {
  EQUIPMENT_CONDITION_LABELS,
  EQUIPMENT_STATUS_LABELS,
  equipmentAuditValue,
  formatEquipmentDate,
  parseEquipmentCreate,
  parseEquipmentFilter,
  parseEquipmentId,
  parseEquipmentUpdate,
  type EquipmentCondition,
  type EquipmentInventoryCounts,
  type EquipmentInventoryRow,
  type EquipmentStatus,
} from "@/lib/validation/equipment-inventory";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type EquipmentInventoryView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID_FILTER" }
  | {
      status: "READY";
      canManage: boolean;
      showArchived: boolean;
      counts: EquipmentInventoryCounts;
      rows: EquipmentInventoryRow[];
    };

export type EquipmentInventoryMutationResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID" }
  | { status: "NOT_FOUND" }
  | { status: "DUPLICATE_ASSET_TAG" }
  | { status: "CREATED" }
  | { status: "UPDATED" }
  | { status: "ARCHIVED" }
  | { status: "RESTORED" };

const itemSelect = {
  id: true,
  name: true,
  category: true,
  assetTag: true,
  quantity: true,
  storageLocation: true,
  status: true,
  condition: true,
  notes: true,
  archivedAt: true,
  updatedAt: true,
} as const;

type LinkedAccess = {
  status: "READY";
  userAccount: { id: string };
  organization: { id: string };
  canView: boolean;
  canManage: boolean;
};

async function requireEquipmentAccess(
  mode: "view" | "manage",
): Promise<
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | LinkedAccess
> {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" };

  const access = await getEventAccess(organization.id);
  if (!access.canView) return { status: "UNAUTHORIZED" };
  if (mode === "manage" && !access.canManageLocations) {
    return { status: "UNAUTHORIZED" };
  }

  return {
    status: "READY",
    userAccount,
    organization,
    canView: access.canView,
    canManage: access.canManageLocations,
  };
}

function toRow(
  row: {
    id: string;
    name: string;
    category: string | null;
    assetTag: string | null;
    quantity: number;
    storageLocation: string | null;
    status: EquipmentStatus;
    condition: EquipmentCondition;
    notes: string | null;
    archivedAt: Date | null;
    updatedAt: Date;
  },
  canManage: boolean,
): EquipmentInventoryRow {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    assetTag: row.assetTag,
    quantity: row.quantity,
    storageLocation: row.storageLocation,
    status: row.status,
    statusLabel: EQUIPMENT_STATUS_LABELS[row.status],
    condition: row.condition,
    conditionLabel: EQUIPMENT_CONDITION_LABELS[row.condition],
    notes: canManage ? row.notes : null,
    archived: row.archivedAt != null,
    updatedOnLabel: formatEquipmentDate(row.updatedAt),
  };
}

async function assetTagTaken(
  organizationId: string,
  assetTag: string | undefined,
  excludeId?: string,
) {
  if (!assetTag) return false;
  const existing = await prisma.equipmentItem.findFirst({
    where: {
      organizationId,
      assetTag,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  return Boolean(existing);
}

/**
 * Read-only inventory list for event viewers. Managers can mutate through
 * the dedicated create/update/archive functions. Organization is resolved
 * server-side.
 */
export async function getEquipmentInventory(
  input: unknown = {},
): Promise<EquipmentInventoryView> {
  const access = await requireEquipmentAccess("view");
  if (access.status !== "READY") return access;

  const parsed = parseEquipmentFilter(input);
  if (!parsed.success) return { status: "INVALID_FILTER" };
  const filter = parsed.data;
  const showArchived = filter.archived === true;

  const where: Prisma.EquipmentItemWhereInput = {
    organizationId: access.organization.id,
    archivedAt: showArchived ? { not: null } : null,
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.q
      ? { name: { contains: filter.q, mode: "insensitive" } }
      : {}),
    ...(filter.category
      ? { category: { contains: filter.category, mode: "insensitive" } }
      : {}),
    ...(filter.storageLocation
      ? {
          storageLocation: {
            contains: filter.storageLocation,
            mode: "insensitive",
          },
        }
      : {}),
  };

  const [records, available, inUse, maintenance, retiredArchived, retiredActive] =
    await Promise.all([
      prisma.equipmentItem.findMany({
        where,
        orderBy: [{ name: "asc" }, { updatedAt: "desc" }],
        select: itemSelect,
      }),
      prisma.equipmentItem.count({
        where: {
          organizationId: access.organization.id,
          archivedAt: null,
          status: "AVAILABLE",
        },
      }),
      prisma.equipmentItem.count({
        where: {
          organizationId: access.organization.id,
          archivedAt: null,
          status: "IN_USE",
        },
      }),
      prisma.equipmentItem.count({
        where: {
          organizationId: access.organization.id,
          archivedAt: null,
          status: "MAINTENANCE",
        },
      }),
      prisma.equipmentItem.count({
        where: {
          organizationId: access.organization.id,
          archivedAt: { not: null },
        },
      }),
      prisma.equipmentItem.count({
        where: {
          organizationId: access.organization.id,
          archivedAt: null,
          status: "RETIRED",
        },
      }),
    ]);

  return {
    status: "READY",
    canManage: access.canManage,
    showArchived,
    counts: {
      available,
      inUse,
      maintenance,
      retired: retiredArchived + retiredActive,
    },
    rows: records.map((row) =>
      toRow(
        {
          ...row,
          status: row.status as EquipmentStatus,
          condition: row.condition as EquipmentCondition,
        },
        access.canManage,
      ),
    ),
  };
}

export async function createEquipmentItem(
  input: unknown,
): Promise<EquipmentInventoryMutationResult> {
  const access = await requireEquipmentAccess("manage");
  if (access.status !== "READY") return access;

  const parsed = parseEquipmentCreate(input);
  if (!parsed.success) return { status: "INVALID" };

  if (
    await assetTagTaken(access.organization.id, parsed.data.assetTag)
  ) {
    return { status: "DUPLICATE_ASSET_TAG" };
  }

  const created = await prisma.equipmentItem.create({
    data: {
      organizationId: access.organization.id,
      name: parsed.data.name,
      category: parsed.data.category ?? null,
      assetTag: parsed.data.assetTag ?? null,
      quantity: parsed.data.quantity,
      storageLocation: parsed.data.storageLocation ?? null,
      status: parsed.data.status,
      condition: parsed.data.condition,
      notes: parsed.data.notes ?? null,
    },
    select: { id: true },
  });

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "CREATE_EQUIPMENT_ITEM",
    entityType: "EquipmentItem",
    entityId: created.id,
    changes: [
      { field: "name", oldValue: null, newValue: "set" },
      { field: "status", oldValue: null, newValue: parsed.data.status },
      { field: "condition", oldValue: null, newValue: parsed.data.condition },
      {
        field: "notes",
        oldValue: null,
        newValue: equipmentAuditValue(parsed.data.notes),
      },
    ],
  });

  return { status: "CREATED" };
}

export async function updateEquipmentItem(
  input: unknown,
): Promise<EquipmentInventoryMutationResult> {
  const access = await requireEquipmentAccess("manage");
  if (access.status !== "READY") return access;

  const parsed = parseEquipmentUpdate(input);
  if (!parsed.success) return { status: "INVALID" };

  const existing = await prisma.equipmentItem.findFirst({
    where: {
      id: parsed.data.equipmentId,
      organizationId: access.organization.id,
    },
    select: itemSelect,
  });
  if (!existing) return { status: "NOT_FOUND" };

  if (
    await assetTagTaken(
      access.organization.id,
      parsed.data.assetTag,
      existing.id,
    )
  ) {
    return { status: "DUPLICATE_ASSET_TAG" };
  }

  await prisma.equipmentItem.update({
    where: { id: existing.id },
    data: {
      name: parsed.data.name,
      category: parsed.data.category ?? null,
      assetTag: parsed.data.assetTag ?? null,
      quantity: parsed.data.quantity,
      storageLocation: parsed.data.storageLocation ?? null,
      status: parsed.data.status,
      condition: parsed.data.condition,
      notes: parsed.data.notes ?? null,
    },
  });

  const changes = [
    existing.name !== parsed.data.name
      ? { field: "name", oldValue: "set", newValue: "set" }
      : null,
    existing.status !== parsed.data.status
      ? {
          field: "status",
          oldValue: existing.status,
          newValue: parsed.data.status,
        }
      : null,
    existing.condition !== parsed.data.condition
      ? {
          field: "condition",
          oldValue: existing.condition,
          newValue: parsed.data.condition,
        }
      : null,
    existing.quantity !== parsed.data.quantity
      ? {
          field: "quantity",
          oldValue: String(existing.quantity),
          newValue: String(parsed.data.quantity),
        }
      : null,
    (existing.notes ?? null) !== (parsed.data.notes ?? null)
      ? {
          field: "notes",
          oldValue: equipmentAuditValue(existing.notes),
          newValue: equipmentAuditValue(parsed.data.notes),
        }
      : null,
  ].filter((change): change is NonNullable<typeof change> => change != null);

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "UPDATE_EQUIPMENT_ITEM",
    entityType: "EquipmentItem",
    entityId: existing.id,
    changes:
      changes.length > 0
        ? changes
        : [{ field: "record", oldValue: "unchanged", newValue: "unchanged" }],
  });

  return { status: "UPDATED" };
}

export async function archiveEquipmentItem(
  input: unknown,
): Promise<EquipmentInventoryMutationResult> {
  const access = await requireEquipmentAccess("manage");
  if (access.status !== "READY") return access;

  const parsed = parseEquipmentId(input);
  if (!parsed.success) return { status: "INVALID" };

  const existing = await prisma.equipmentItem.findFirst({
    where: {
      id: parsed.data.equipmentId,
      organizationId: access.organization.id,
      archivedAt: null,
    },
    select: { id: true, status: true },
  });
  if (!existing) return { status: "NOT_FOUND" };

  await prisma.equipmentItem.update({
    where: { id: existing.id },
    data: {
      archivedAt: new Date(),
      status: "RETIRED",
    },
  });

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "ARCHIVE_EQUIPMENT_ITEM",
    entityType: "EquipmentItem",
    entityId: existing.id,
    changes: [
      { field: "archived", oldValue: "false", newValue: "true" },
      { field: "status", oldValue: existing.status, newValue: "RETIRED" },
    ],
  });

  return { status: "ARCHIVED" };
}

export async function restoreEquipmentItem(
  input: unknown,
): Promise<EquipmentInventoryMutationResult> {
  const access = await requireEquipmentAccess("manage");
  if (access.status !== "READY") return access;

  const parsed = parseEquipmentId(input);
  if (!parsed.success) return { status: "INVALID" };

  const existing = await prisma.equipmentItem.findFirst({
    where: {
      id: parsed.data.equipmentId,
      organizationId: access.organization.id,
      archivedAt: { not: null },
    },
    select: { id: true, status: true },
  });
  if (!existing) return { status: "NOT_FOUND" };

  await prisma.equipmentItem.update({
    where: { id: existing.id },
    data: {
      archivedAt: null,
      status: existing.status === "RETIRED" ? "AVAILABLE" : existing.status,
    },
  });

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "RESTORE_EQUIPMENT_ITEM",
    entityType: "EquipmentItem",
    entityId: existing.id,
    changes: [
      { field: "archived", oldValue: "true", newValue: "false" },
    ],
  });

  return { status: "RESTORED" };
}
