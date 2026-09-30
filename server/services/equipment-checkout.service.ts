import { getEventAccess } from "@/lib/auth/event-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import {
  CHECKOUT_ELIGIBLE_STATUSES,
  formatEquipmentAvailabilityLabel,
  formatEquipmentCheckoutDate,
  isCheckoutDueSoon,
  isCheckoutOverdue,
  parseEquipmentCheckoutCreate,
  parseEquipmentCheckoutFilter,
  parseEquipmentCheckoutReturn,
  startOfUtcMonth,
  type EquipmentCheckoutCounts,
  type EquipmentCheckoutOption,
  type EquipmentCheckoutRow,
} from "@/lib/validation/equipment-checkout";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type EquipmentCheckoutsView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID_FILTER" }
  | {
      status: "READY";
      canManage: boolean;
      view: "current" | "returned";
      counts: EquipmentCheckoutCounts;
      equipmentOptions: EquipmentCheckoutOption[];
      rows: EquipmentCheckoutRow[];
    };

export type EquipmentCheckoutMutationResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID" }
  | { status: "NOT_FOUND" }
  | { status: "INELIGIBLE" }
  | { status: "UNAVAILABLE" }
  | { status: "ALREADY_RETURNED" }
  | { status: "CREATED" }
  | { status: "RETURNED" };

type LinkedAccess = {
  status: "READY";
  userAccount: { id: string };
  organization: { id: string };
  canManage: boolean;
};

const checkoutSelect = {
  id: true,
  quantity: true,
  checkedOutToName: true,
  purpose: true,
  dueBackAt: true,
  checkedOutAt: true,
  returnedAt: true,
  returnNote: true,
  equipmentItem: { select: { name: true } },
} as const;

async function requireCheckoutAccess(mode: "view" | "manage") {
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

function toRow(row: {
  id: string;
  quantity: number;
  checkedOutToName: string;
  purpose: string;
  dueBackAt: Date | null;
  checkedOutAt: Date;
  returnedAt: Date | null;
  returnNote: string | null;
  equipmentItem: { name: string };
}): EquipmentCheckoutRow {
  return {
    id: row.id,
    equipmentName: row.equipmentItem.name,
    quantity: row.quantity,
    checkedOutToName: row.checkedOutToName,
    purpose: row.purpose,
    dueBackLabel: row.dueBackAt
      ? formatEquipmentCheckoutDate(row.dueBackAt)
      : null,
    checkedOutOnLabel: formatEquipmentCheckoutDate(row.checkedOutAt),
    returnedOnLabel: row.returnedAt
      ? formatEquipmentCheckoutDate(row.returnedAt)
      : null,
    returnNote: row.returnNote,
    overdue: isCheckoutOverdue(row.dueBackAt, row.returnedAt),
    dueSoon: isCheckoutDueSoon(row.dueBackAt, row.returnedAt),
  };
}

function availableFrom(quantity: number, checkedOut: number) {
  return Math.max(0, quantity - checkedOut);
}

type CheckoutWriter = {
  $queryRaw: (
    query: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown>;
  equipmentItem: {
    findFirst: typeof prisma.equipmentItem.findFirst;
  };
  equipmentCheckout: {
    aggregate: typeof prisma.equipmentCheckout.aggregate;
    create: typeof prisma.equipmentCheckout.create;
    findFirst: typeof prisma.equipmentCheckout.findFirst;
    update: typeof prisma.equipmentCheckout.update;
  };
};

async function lockEquipmentItem(
  tx: CheckoutWriter,
  organizationId: string,
  equipmentItemId: string,
) {
  await tx.$queryRaw`
    SELECT id
    FROM equipment_items
    WHERE id = ${equipmentItemId}::uuid
      AND "organizationId" = ${organizationId}::uuid
    FOR UPDATE
  `;
}

async function openQuantityForItem(
  tx: CheckoutWriter,
  organizationId: string,
  equipmentItemId: string,
) {
  const open = await tx.equipmentCheckout.aggregate({
    where: {
      organizationId,
      equipmentItemId,
      returnedAt: null,
    },
    _sum: { quantity: true },
  });
  return open._sum.quantity ?? 0;
}

/**
 * Staff equipment check-out log. Organization and permissions are resolved
 * server-side. Inventory quantity on the equipment record is never changed.
 */
export async function getEquipmentCheckouts(
  input: unknown = {},
): Promise<EquipmentCheckoutsView> {
  const access = await requireCheckoutAccess("view");
  if (access.status !== "READY") return access;

  const parsed = parseEquipmentCheckoutFilter(input);
  if (!parsed.success) return { status: "INVALID_FILTER" };

  const orgWhere = { organizationId: access.organization.id };
  const monthStart = startOfUtcMonth();

  const [records, openRows, returnedThisMonth, items, openByItem] =
    await Promise.all([
      prisma.equipmentCheckout.findMany({
        where: {
          ...orgWhere,
          returnedAt: parsed.data.view === "returned" ? { not: null } : null,
        },
        orderBy:
          parsed.data.view === "returned"
            ? [{ returnedAt: "desc" }, { checkedOutAt: "desc" }]
            : [{ checkedOutAt: "desc" }, { dueBackAt: "asc" }],
        select: checkoutSelect,
      }),
      prisma.equipmentCheckout.findMany({
        where: { ...orgWhere, returnedAt: null },
        select: { dueBackAt: true, returnedAt: true },
      }),
      prisma.equipmentCheckout.count({
        where: {
          ...orgWhere,
          returnedAt: { gte: monthStart },
        },
      }),
      prisma.equipmentItem.findMany({
        where: {
          ...orgWhere,
          archivedAt: null,
          status: { in: [...CHECKOUT_ELIGIBLE_STATUSES] },
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true, quantity: true },
      }),
      prisma.equipmentCheckout.groupBy({
        by: ["equipmentItemId"],
        where: { ...orgWhere, returnedAt: null },
        _sum: { quantity: true },
      }),
    ]);

  const openQuantities = new Map(
    openByItem.map((row) => [row.equipmentItemId, row._sum.quantity ?? 0]),
  );

  return {
    status: "READY",
    canManage: access.canManage,
    view: parsed.data.view,
    counts: {
      currentlyCheckedOut: openRows.length,
      dueBackSoon: openRows.filter((row) =>
        isCheckoutDueSoon(row.dueBackAt, row.returnedAt),
      ).length,
      overdue: openRows.filter((row) =>
        isCheckoutOverdue(row.dueBackAt, row.returnedAt),
      ).length,
      returnedThisMonth,
    },
    equipmentOptions: items.map((item) => {
      const available = availableFrom(
        item.quantity,
        openQuantities.get(item.id) ?? 0,
      );
      return {
        id: item.id,
        label: formatEquipmentAvailabilityLabel(item.name, available),
        available,
      };
    }),
    rows: records.map(toRow),
  };
}

export async function createEquipmentCheckout(
  input: unknown,
): Promise<EquipmentCheckoutMutationResult> {
  const access = await requireCheckoutAccess("manage");
  if (access.status !== "READY") return access;

  const parsed = parseEquipmentCheckoutCreate(input);
  if (!parsed.success) return { status: "INVALID" };

  const result = await prisma.$transaction(async (tx) => {
    await lockEquipmentItem(tx, access.organization.id, parsed.data.equipmentItemId);

    const item = await tx.equipmentItem.findFirst({
      where: {
        id: parsed.data.equipmentItemId,
        organizationId: access.organization.id,
        archivedAt: null,
      },
      select: { id: true, quantity: true, status: true },
    });
    if (!item) return { status: "NOT_FOUND" as const };
    if (
      item.status !== "AVAILABLE" &&
      item.status !== "IN_USE"
    ) {
      return { status: "INELIGIBLE" as const };
    }

    const openQuantity = await openQuantityForItem(
      tx,
      access.organization.id,
      item.id,
    );
    const available = availableFrom(item.quantity, openQuantity);
    if (parsed.data.quantity > available) {
      return { status: "UNAVAILABLE" as const };
    }

    const created = await tx.equipmentCheckout.create({
      data: {
        organizationId: access.organization.id,
        equipmentItemId: item.id,
        quantity: parsed.data.quantity,
        checkedOutToName: parsed.data.checkedOutToName,
        purpose: parsed.data.purpose,
        dueBackAt: parsed.data.dueBackAt ?? null,
        checkedOutByUserAccountId: access.userAccount.id,
      },
      select: { id: true },
    });

    return {
      status: "CREATED" as const,
      checkoutId: created.id,
      equipmentItemId: item.id,
      quantity: parsed.data.quantity,
      equipmentStatus: item.status,
    };
  });

  if (result.status !== "CREATED") return result;

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "CHECK_OUT_EQUIPMENT",
    entityType: "EquipmentCheckout",
    entityId: result.checkoutId,
    changes: [
      {
        field: "equipmentItemId",
        oldValue: null,
        newValue: result.equipmentItemId,
      },
      {
        field: "quantity",
        oldValue: null,
        newValue: String(result.quantity),
      },
      { field: "status", oldValue: null, newValue: "CHECKED_OUT" },
    ],
  });

  return { status: "CREATED" };
}

export async function returnEquipmentCheckout(
  input: unknown,
): Promise<EquipmentCheckoutMutationResult> {
  const access = await requireCheckoutAccess("manage");
  if (access.status !== "READY") return access;

  const parsed = parseEquipmentCheckoutReturn(input);
  if (!parsed.success) return { status: "INVALID" };

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.equipmentCheckout.findFirst({
      where: {
        id: parsed.data.checkoutId,
        organizationId: access.organization.id,
      },
      select: {
        id: true,
        quantity: true,
        returnedAt: true,
        equipmentItemId: true,
      },
    });
    if (!existing) return { status: "NOT_FOUND" as const };
    if (existing.returnedAt) return { status: "ALREADY_RETURNED" as const };

    await lockEquipmentItem(tx, access.organization.id, existing.equipmentItemId);

    const stillOpen = await tx.equipmentCheckout.findFirst({
      where: {
        id: existing.id,
        organizationId: access.organization.id,
        returnedAt: null,
      },
      select: { id: true },
    });
    if (!stillOpen) return { status: "ALREADY_RETURNED" as const };

    await tx.equipmentCheckout.update({
      where: { id: existing.id },
      data: {
        returnedAt: new Date(),
        returnedByUserAccountId: access.userAccount.id,
        returnNote: parsed.data.returnNote ?? null,
      },
    });

    return {
      status: "RETURNED" as const,
      checkoutId: existing.id,
      equipmentItemId: existing.equipmentItemId,
      quantity: existing.quantity,
    };
  });

  if (result.status !== "RETURNED") return result;

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "RETURN_EQUIPMENT",
    entityType: "EquipmentCheckout",
    entityId: result.checkoutId,
    changes: [
      {
        field: "equipmentItemId",
        oldValue: result.equipmentItemId,
        newValue: result.equipmentItemId,
      },
      {
        field: "quantity",
        oldValue: String(result.quantity),
        newValue: String(result.quantity),
      },
      {
        field: "status",
        oldValue: "CHECKED_OUT",
        newValue: "RETURNED",
      },
    ],
  });

  return { status: "RETURNED" };
}
