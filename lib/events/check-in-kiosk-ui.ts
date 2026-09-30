import {
  getStaffCheckInAvailabilityState,
  type StaffCheckInAvailabilityState,
} from "@/lib/events/staff-check-in-availability";

export const KIOSK_CHURCH_NAME = "First UPC of Saco";
export const KIOSK_MIN_QUERY_LENGTH = 2;

export const KIOSK_CHECK_IN_RESULT_KEYS = [
  "id",
  "displayName",
  "status",
  "statusLabel",
  "canCheckIn",
] as const;

export const KIOSK_FORBIDDEN_FIELDS = [
  "email",
  "phone",
  "dateOfBirth",
  "guardianName",
  "guardianPhone",
  "emergencyContactName",
  "emergencyContactPhone",
  "accommodationRequest",
  "dietaryNotes",
  "internalNotes",
  "notes",
  "memberId",
  "checkInToken",
  "confirmationCode",
  "primaryContactName",
] as const;

export type KioskCheckInStatus =
  | "eligible"
  | "already_checked_in"
  | "checked_out"
  | "not_eligible";

export type KioskCheckInResult = {
  id: string;
  displayName: string;
  status: KioskCheckInStatus;
  statusLabel: string;
  canCheckIn: boolean;
};

export type KioskCheckInSearchRecord = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  status?: string | null;
  registration?: { status?: string | null } | null;
  attendanceRecords?: Array<{ status?: string | null }> | null;
};

const INELIGIBLE_REGISTRATION_STATUSES = [
  "WAITLISTED",
  "OFFERED",
  "DECLINED",
  "EXPIRED",
  "CANCELLED",
];

const INELIGIBLE_ATTENDEE_STATUSES = ["WAITLISTED", "CANCELLED"];

export function canUseCheckInKiosk(access: { canOperateCheckIn?: boolean }) {
  return Boolean(access.canOperateCheckIn);
}

export function kioskSafeDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
) {
  const first = firstName?.trim() ?? "";
  const lastInitial = (lastName?.trim() ?? "").charAt(0);
  if (!first && !lastInitial) return "Registered guest";
  if (!lastInitial) return first;
  return `${first} ${lastInitial.toUpperCase()}.`;
}

export function kioskCheckInWindowLabel(state: StaffCheckInAvailabilityState) {
  switch (state) {
    case "open":
      return "Check-in open";
    case "disabled":
      return "Check-in unavailable";
    case "not_open":
      return "Not open yet";
    case "closed":
      return "Check-in closed";
  }
}

export function kioskCheckInWindowState(
  settings: {
    checkInEnabled: boolean;
    checkInOpensAt: Date | string | null;
    checkInClosesAt: Date | string | null;
  },
  now: Date = new Date(),
) {
  return getStaffCheckInAvailabilityState(settings, now);
}

export function kioskCheckInStatusLabel(status: KioskCheckInStatus) {
  switch (status) {
    case "eligible":
      return "Ready to check in";
    case "already_checked_in":
      return "Already checked in";
    case "checked_out":
      return "Checked out";
    case "not_eligible":
      return "Not eligible for kiosk check-in";
  }
}

export function kioskShowsCheckInButton(result: KioskCheckInResult) {
  return result.canCheckIn && result.status === "eligible";
}

function kioskEligibility(record: KioskCheckInSearchRecord): KioskCheckInStatus {
  const attendeeStatus = record.status ?? "";
  const registrationStatus = record.registration?.status ?? "";
  if (
    INELIGIBLE_ATTENDEE_STATUSES.includes(attendeeStatus) ||
    INELIGIBLE_REGISTRATION_STATUSES.includes(registrationStatus)
  ) {
    return "not_eligible";
  }

  const attendanceStatus = record.attendanceRecords?.[0]?.status ?? null;
  if (attendanceStatus === "PRESENT") return "already_checked_in";
  if (attendanceStatus === "CHECKED_OUT") return "checked_out";
  if (attendanceStatus === "CANCELLED") return "not_eligible";
  return "eligible";
}

export function toKioskCheckInResult(
  record: KioskCheckInSearchRecord,
): KioskCheckInResult {
  const status = kioskEligibility(record);
  return {
    id: record.id,
    displayName: kioskSafeDisplayName(record.firstName, record.lastName),
    status,
    statusLabel: kioskCheckInStatusLabel(status),
    canCheckIn: status === "eligible",
  };
}

export function kioskQueryIsReady(query: string) {
  return query.trim().length >= KIOSK_MIN_QUERY_LENGTH;
}

export function kioskResultPayloadKeys(result: KioskCheckInResult) {
  return Object.keys(result).sort();
}
