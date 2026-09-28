export const VOLUNTEER_SCHEDULE_READINESS_WINDOW_DAYS = 14;

export const VOLUNTEER_SCHEDULE_READINESS_EVENT_STATUSES = [
  "DRAFT",
  "PUBLISHED",
] as const;

export const STAFF_VOLUNTEER_SCHEDULE_READINESS_NOTICE =
  "This snapshot shows volunteer schedule health for the next 14 days. It does not change assignments, send reminders, or list volunteer contact details.";

export const STAFF_VOLUNTEER_SCHEDULE_READINESS_EMPTY_COPY =
  "No upcoming volunteer services need attention in the next 14 days.";

export const STAFF_VOLUNTEER_SCHEDULE_NAV_ITEMS = [
  { href: "/volunteer-schedules", label: "Volunteer Schedules" },
  { href: "/volunteer-schedules/readiness", label: "Schedule Readiness" },
  { href: "/volunteer-time-off", label: "Volunteer Time Off" },
  {
    href: "/volunteer-schedules/substitute-requests",
    label: "Substitute Requests",
  },
] as const;

export const VOLUNTEER_SCHEDULE_READINESS_ATTENTION_FIELDS = [
  "eventTitle",
  "startsAtLabel",
  "awaitingConfirmationCount",
  "openSubstituteRequestCount",
] as const;

export type VolunteerScheduleReadinessAttentionRow = {
  eventTitle: string;
  startsAtLabel: string;
  awaitingConfirmationCount: number;
  openSubstituteRequestCount: number;
};

export type StaffVolunteerScheduleNavItem = {
  href: string;
  label: string;
};

export function staffVolunteerScheduleNavItems(
  canManageMinistryRosters: boolean,
): StaffVolunteerScheduleNavItem[] {
  return canManageMinistryRosters
    ? STAFF_VOLUNTEER_SCHEDULE_NAV_ITEMS.map((item) => ({ ...item }))
    : [];
}

export function volunteerScheduleReadinessWindowEnd(
  now: Date,
  days = VOLUNTEER_SCHEDULE_READINESS_WINDOW_DAYS,
) {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

export function volunteerScheduleReadinessEventWhere(
  organizationId: string,
  now: Date,
) {
  return {
    organizationId,
    eventStatus: { in: [...VOLUNTEER_SCHEDULE_READINESS_EVENT_STATUSES] },
    endDateTime: { gte: now },
    startDateTime: { lte: volunteerScheduleReadinessWindowEnd(now) },
  };
}
