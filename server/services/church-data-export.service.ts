import type { MembershipStatus } from "@/app/generated/prisma/client";
import { formatMembershipStatus } from "@/lib/constants/membership-status";
import { getOrganizationAccess } from "@/lib/auth/permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { buildCsv, formatDateForCsv } from "@/lib/csv/member-csv";
import { prisma } from "@/lib/db/prisma";
import { assertActionAllowed } from "@/lib/security/rate-limit";
import {
  EQUIPMENT_CONDITION_LABELS,
  EQUIPMENT_STATUS_LABELS,
  type EquipmentCondition,
  type EquipmentStatus,
} from "@/lib/validation/equipment-inventory";
import {
  MAINTENANCE_PRIORITY_LABELS,
  MAINTENANCE_REQUEST_STATUS_LABELS,
  type MaintenancePriority,
  type MaintenanceRequestStatus,
} from "@/lib/validation/maintenance-request";
import {
  PURCHASE_REQUEST_STATUS_LABELS,
  type PurchaseRequestStatus,
} from "@/lib/validation/purchase-request";
import {
  EVENT_LOCATION_EXPORT_COLUMNS,
  MEMBER_DIRECTORY_EXPORT_COLUMNS,
  OPERATIONS_EXPORT_COLUMNS,
  churchDataExportFilename,
  parseChurchDataExportInput,
  type ChurchDataExportType,
} from "@/lib/validation/church-data-export";
import { formatVolunteerTimeOffDate } from "@/lib/validation/volunteer-time-off-request";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findMembers } from "@/server/repositories/member.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type ChurchDataExportAccessView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "READY" };

export type ChurchDataExportResult =
  | ChurchDataExportAccessView
  | { status: "INVALID" }
  | { status: "UNCONFIRMED" }
  | {
      status: "EXPORTED";
      exportType: ChurchDataExportType;
      csv: string;
      filename: string;
      rowCount: number;
      message: string;
    };

const RATE_LIMIT_KEYS: Record<ChurchDataExportType, string> = {
  MEMBER_DIRECTORY: "church-data-export.member-directory",
  OPERATIONS: "church-data-export.operations",
  EVENT_LOCATIONS: "church-data-export.event-locations",
};

function cell(value: string | number | null | undefined) {
  if (value == null) return "";
  return String(value);
}

function formatPlainDate(value: Date | null | undefined) {
  if (!value) return "";
  return formatVolunteerTimeOffDate(value);
}

function equipmentStatusLabel(status: string) {
  return EQUIPMENT_STATUS_LABELS[status as EquipmentStatus] ?? status;
}

function equipmentConditionLabel(condition: string) {
  return EQUIPMENT_CONDITION_LABELS[condition as EquipmentCondition] ?? condition;
}

function maintenanceStatusLabel(status: string) {
  return (
    MAINTENANCE_REQUEST_STATUS_LABELS[status as MaintenanceRequestStatus] ??
    status
  );
}

function maintenancePriorityLabel(priority: string) {
  return MAINTENANCE_PRIORITY_LABELS[priority as MaintenancePriority] ?? priority;
}

function purchaseStatusLabel(status: string) {
  return PURCHASE_REQUEST_STATUS_LABELS[status as PurchaseRequestStatus] ?? status;
}

async function requireExportAccess() {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" as const };

  const access = await getOrganizationAccess(organization.id);
  if (!access.canEdit) return { status: "UNAUTHORIZED" as const };

  return {
    status: "READY" as const,
    userAccount,
    organization,
  };
}

export async function getChurchDataExportAccess(): Promise<ChurchDataExportAccessView> {
  const access = await requireExportAccess();
  if (access.status !== "READY") return access;
  return { status: "READY" };
}

async function exportMemberDirectory(
  organizationId: string,
  membershipStatus?: MembershipStatus,
) {
  const members = await findMembers({
    organizationId,
    recordStatus: "ACTIVE",
    membershipStatus,
  });

  const rows = members.map((member) => [
    cell(member.firstName),
    cell(member.middleName),
    cell(member.lastName),
    cell(member.preferredName),
    cell(member.suffix),
    cell(member.email),
    cell(member.phone),
    cell(member.alternatePhone),
    formatDateForCsv(member.dateOfBirth),
    cell(member.gender),
    cell(member.maritalStatus),
    formatMembershipStatus(member.membershipStatus),
    formatDateForCsv(member.memberSince),
    formatDateForCsv(member.baptismDate),
    formatDateForCsv(member.salvationDate),
    cell(member.addressLine1),
    cell(member.addressLine2),
    cell(member.city),
    cell(member.state),
    cell(member.postalCode),
    cell(member.country),
    cell(member.householdLinks[0]?.household.householdName),
  ]);

  return {
    csv: buildCsv([
      [...MEMBER_DIRECTORY_EXPORT_COLUMNS],
      ...rows,
    ]),
    rowCount: rows.length,
  };
}

async function exportOperations(organizationId: string) {
  const [equipment, maintenance, purchases, checkouts] = await Promise.all([
    prisma.equipmentItem.findMany({
      where: { organizationId },
      select: {
        name: true,
        category: true,
        quantity: true,
        storageLocation: true,
        status: true,
        condition: true,
        archivedAt: true,
        updatedAt: true,
      },
      orderBy: [{ name: "asc" }],
    }),
    prisma.maintenanceRequest.findMany({
      where: { organizationId },
      select: {
        title: true,
        locationDescription: true,
        priority: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
      },
      orderBy: [{ createdAt: "desc" }],
    }),
    prisma.purchaseRequest.findMany({
      where: { organizationId },
      select: {
        title: true,
        category: true,
        status: true,
        requestedForLocation: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }],
    }),
    prisma.equipmentCheckout.findMany({
      where: { organizationId },
      select: {
        quantity: true,
        checkedOutAt: true,
        returnedAt: true,
        equipmentItem: {
          select: {
            name: true,
            storageLocation: true,
          },
        },
      },
      orderBy: [{ checkedOutAt: "desc" }],
    }),
  ]);

  const rows: string[][] = [
    ...equipment.map((item) => [
      "Equipment inventory",
      cell(item.name),
      cell(item.category),
      equipmentStatusLabel(item.status),
      equipmentConditionLabel(item.condition),
      cell(item.quantity),
      cell(item.storageLocation),
      formatPlainDate(item.updatedAt),
      item.archivedAt ? "Archived" : "Active",
    ]),
    ...maintenance.map((item) => [
      "Maintenance request",
      cell(item.title),
      "",
      maintenanceStatusLabel(item.status),
      maintenancePriorityLabel(item.priority),
      "",
      cell(item.locationDescription),
      formatPlainDate(item.createdAt),
      item.resolvedAt ? "Resolved" : "Open record",
    ]),
    ...purchases.map((item) => [
      "Purchase request",
      cell(item.title),
      cell(item.category),
      purchaseStatusLabel(item.status),
      "",
      "",
      cell(item.requestedForLocation),
      formatPlainDate(item.createdAt),
      "",
    ]),
    ...checkouts.map((item) => [
      "Equipment check-out",
      cell(item.equipmentItem.name),
      "",
      item.returnedAt ? "Returned" : "Checked out",
      "",
      cell(item.quantity),
      cell(item.equipmentItem.storageLocation),
      formatPlainDate(item.checkedOutAt),
      item.returnedAt ? "Returned" : "Currently checked out",
    ]),
  ];

  return {
    csv: buildCsv([[...OPERATIONS_EXPORT_COLUMNS], ...rows]),
    rowCount: rows.length,
  };
}

async function exportEventLocations(organizationId: string) {
  const locations = await prisma.eventLocation.findMany({
    where: { organizationId },
    select: {
      name: true,
      roomName: true,
      isOnline: true,
      capacity: true,
      isActive: true,
      address1: true,
      address2: true,
      city: true,
      state: true,
      zip: true,
      country: true,
    },
    orderBy: [{ name: "asc" }],
  });

  const rows = locations.map((location) => [
    cell(location.name),
    cell(location.roomName),
    location.isOnline ? "Online" : "On-site",
    location.capacity == null ? "" : String(location.capacity),
    location.isActive ? "Active" : "Inactive",
    cell(location.address1),
    cell(location.address2),
    cell(location.city),
    cell(location.state),
    cell(location.zip),
    cell(location.country),
  ]);

  return {
    csv: buildCsv([[...EVENT_LOCATION_EXPORT_COLUMNS], ...rows]),
    rowCount: rows.length,
  };
}

function exportMessage(exportType: ChurchDataExportType, rowCount: number) {
  const label =
    exportType === "MEMBER_DIRECTORY"
      ? "member directory"
      : exportType === "OPERATIONS"
        ? "church operations"
        : "event location";
  if (rowCount === 0) {
    return `No ${label} records matched this export. An empty CSV with column headers is ready.`;
  }
  return `${rowCount} ${label} row${rowCount === 1 ? "" : "s"} exported. Save the file only to an approved, secure location.`;
}

/**
 * Administrator-only CSV exports for the current organization.
 * Client organization IDs and record IDs are ignored.
 */
export async function exportChurchData(
  input: unknown = {},
): Promise<ChurchDataExportResult> {
  const access = await requireExportAccess();
  if (access.status !== "READY") return access;

  const parsed = parseChurchDataExportInput(input);
  if (!parsed.success) {
    return {
      status: parsed.reason === "UNCONFIRMED" ? "UNCONFIRMED" : "INVALID",
    };
  }

  await assertActionAllowed(
    RATE_LIMIT_KEYS[parsed.data.exportType],
    access.userAccount.id,
  );

  const exported =
    parsed.data.exportType === "MEMBER_DIRECTORY"
      ? await exportMemberDirectory(
          access.organization.id,
          parsed.data.membershipStatus,
        )
      : parsed.data.exportType === "OPERATIONS"
        ? await exportOperations(access.organization.id)
        : await exportEventLocations(access.organization.id);

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: `EXPORT_${parsed.data.exportType}`,
    entityType: "ChurchDataExport",
    entityId: access.organization.id,
    changes: [
      {
        field: "exportType",
        oldValue: null,
        newValue: parsed.data.exportType,
      },
      {
        field: "rowCount",
        oldValue: null,
        newValue: String(exported.rowCount),
      },
    ],
  });

  return {
    status: "EXPORTED",
    exportType: parsed.data.exportType,
    csv: exported.csv,
    filename: churchDataExportFilename(parsed.data.exportType),
    rowCount: exported.rowCount,
    message: exportMessage(parsed.data.exportType, exported.rowCount),
  };
}
