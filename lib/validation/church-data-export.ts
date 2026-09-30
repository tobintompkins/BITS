import { z } from "zod";

import { membershipStatusValues } from "@/lib/constants/membership-status";

export const CHURCH_DATA_EXPORT_HREF = "/administration/data-export";

export const CHURCH_DATA_EXPORT_SUBTITLE =
  "Download approved church records for secure backup or transition purposes.";

export const CHURCH_DATA_EXPORT_NOTICE =
  "Exports may contain sensitive church information. Save them only to an approved, secure location.";

export const CHURCH_DATA_EXPORT_CONFIRMATION =
  "I understand this export may contain private church information.";

export const CHURCH_DATA_EXPORT_TYPES = [
  "MEMBER_DIRECTORY",
  "OPERATIONS",
  "EVENT_LOCATIONS",
] as const;

export type ChurchDataExportType = (typeof CHURCH_DATA_EXPORT_TYPES)[number];

export const CHURCH_DATA_EXPORT_TYPE_LABELS: Record<
  ChurchDataExportType,
  string
> = {
  MEMBER_DIRECTORY: "Member Directory Export",
  OPERATIONS: "Church Operations Export",
  EVENT_LOCATIONS: "Event Location Export",
};

export const MEMBER_DIRECTORY_EXPORT_COLUMNS = [
  "firstName",
  "middleName",
  "lastName",
  "preferredName",
  "suffix",
  "email",
  "phone",
  "alternatePhone",
  "dateOfBirth",
  "gender",
  "maritalStatus",
  "membershipStatus",
  "memberSince",
  "baptismDate",
  "salvationDate",
  "address1",
  "address2",
  "city",
  "state",
  "zip",
  "country",
  "householdName",
] as const;

export const OPERATIONS_EXPORT_COLUMNS = [
  "recordType",
  "name",
  "category",
  "status",
  "conditionOrPriority",
  "quantity",
  "location",
  "date",
  "archiveOrReturnState",
] as const;

export const EVENT_LOCATION_EXPORT_COLUMNS = [
  "locationName",
  "roomName",
  "placeType",
  "capacity",
  "activeStatus",
  "address1",
  "address2",
  "city",
  "state",
  "zip",
  "country",
] as const;

export type ChurchDataExportNavItem = {
  href: string;
  label: string;
};

export function churchDataExportNavItems(
  canExportChurchData: boolean,
): ChurchDataExportNavItem[] {
  return canExportChurchData
    ? [{ href: CHURCH_DATA_EXPORT_HREF, label: "Church Data Export" }]
    : [];
}

export function churchDataExportFilename(
  exportType: ChurchDataExportType,
  occurredAt = new Date(),
) {
  const day = occurredAt.toISOString().slice(0, 10);
  const slug =
    exportType === "MEMBER_DIRECTORY"
      ? "member-directory"
      : exportType === "OPERATIONS"
        ? "church-operations"
        : "event-locations";
  return `${slug}-${day}.csv`;
}

function firstString(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

function optionalText(value: unknown) {
  const text = firstString(value).trim();
  return text || undefined;
}

export function parseChurchDataExportInput(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  const exportType = z
    .enum(CHURCH_DATA_EXPORT_TYPES)
    .safeParse(record.exportType);
  if (!exportType.success) return { success: false as const };

  if (record.confirmed !== true) {
    return { success: false as const, reason: "UNCONFIRMED" as const };
  }

  const membershipStatus = optionalText(record.membershipStatus);
  if (!membershipStatus) {
    return {
      success: true as const,
      data: {
        exportType: exportType.data,
        membershipStatus: undefined,
      },
    };
  }

  const parsedStatus = z.enum(membershipStatusValues).safeParse(membershipStatus);
  if (!parsedStatus.success) return { success: false as const };

  return {
    success: true as const,
    data: {
      exportType: exportType.data,
      membershipStatus: parsedStatus.data,
    },
  };
}
