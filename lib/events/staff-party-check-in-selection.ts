import { STAFF_PARTY_CHECK_IN_MAX_ATTENDEES } from "@/lib/constants/staff-party-check-in";

export type StaffPartySelectionValidation =
  | { ok: true; attendeeIds: string[] }
  | { ok: false; message: string };

/** Toggle an attendee in an explicit selection set (no select-all). */
export function toggleStaffPartyAttendeeSelection(
  selectedIds: string[],
  attendeeId: string,
  checked: boolean,
) {
  if (checked) {
    if (selectedIds.includes(attendeeId)) return selectedIds;
    return [...selectedIds, attendeeId];
  }
  return selectedIds.filter((id) => id !== attendeeId);
}

export function validateStaffPartySelection(input: {
  registrationId: string | null;
  selectedIds: string[];
  max?: number;
}): StaffPartySelectionValidation {
  if (!input.registrationId) {
    return { ok: false, message: "Select a registration before checking in." };
  }
  const unique = [...new Set(input.selectedIds.filter(Boolean))];
  if (unique.length === 0) {
    return {
      ok: false,
      message: "Select at least one attendee before checking in.",
    };
  }
  const max = input.max ?? STAFF_PARTY_CHECK_IN_MAX_ATTENDEES;
  if (unique.length > max) {
    return {
      ok: false,
      message: `Select at most ${max} attendees at once.`,
    };
  }
  return { ok: true, attendeeIds: unique };
}

export function staffPartyAttendanceLabel(attendanceStatus: string) {
  if (attendanceStatus === "PRESENT") return "Present";
  if (attendanceStatus === "CANCELLED") return "Cancelled";
  if (attendanceStatus === "CHECKED_OUT") return "Checked out";
  if (attendanceStatus === "NO_SHOW") return "No-show";
  return "Not checked in";
}

export function isStaffPartyAttendeeSelectable(input: {
  attendeeStatus: string;
  attendanceStatus: string;
}) {
  if (input.attendeeStatus === "CANCELLED") return false;
  if (input.attendeeStatus === "WAITLISTED") return false;
  return true;
}

export function mapStaffPartyOutcomeLabel(outcome: string) {
  if (outcome === "ALREADY_PRESENT") return "Already present";
  if (outcome === "CHECKED_IN") return "Checked in";
  return outcome;
}
