import { z } from "zod";

export const MEMBER_VOLUNTEER_SERVICE_CALENDAR_ELIGIBLE_STATUSES = [
  "SCHEDULED",
] as const;

export const MEMBER_VOLUNTEER_SERVICE_CALENDAR_EVENT_STATUSES = [
  "DRAFT",
  "PUBLISHED",
] as const;

export const memberVolunteerServiceAssignmentSchema = z.object({
  assignmentId: z.string().uuid(),
});

export function memberVolunteerServiceCalendarHref(assignmentId: string) {
  return `/api/portal/volunteer-schedule/${assignmentId}/calendar`;
}

export function volunteerAssignmentCanAddToCalendar(status: string) {
  return MEMBER_VOLUNTEER_SERVICE_CALENDAR_ELIGIBLE_STATUSES.includes(
    status as (typeof MEMBER_VOLUNTEER_SERVICE_CALENDAR_ELIGIBLE_STATUSES)[number],
  );
}

export function volunteerAssignmentCalendarUnavailableReason(status: string) {
  if (status === "CANCELLED") {
    return "This cancelled assignment cannot be added to a calendar.";
  }
  return "This assignment cannot be added to a calendar.";
}

export function volunteerAssignmentCalendarDescription(
  ministryName: string | null,
  roleLabel: string,
) {
  const role = roleLabel.trim();
  const ministry = ministryName?.trim();
  return ministry ? `${ministry} · ${role}` : role;
}
