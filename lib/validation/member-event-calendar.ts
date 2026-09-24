import { z } from "zod";

export const memberEventCalendarRegistrationSchema = z.object({
  registrationId: z.string().uuid(),
});

export const memberEventCalendarEligibleStatuses = [
  "PENDING",
  "CONFIRMED",
  "CHECKED_IN",
] as const;

export function memberRegistrationCanAddToCalendar(status: string) {
  return memberEventCalendarEligibleStatuses.includes(
    status as (typeof memberEventCalendarEligibleStatuses)[number],
  );
}

export function memberCalendarUnavailableReason(status: string) {
  if (status === "CANCELLED") {
    return "This cancelled registration cannot be added to a calendar.";
  }
  if (status === "WAITLISTED" || status === "OFFERED") {
    return "Waitlisted registrations cannot be added to a calendar until they are confirmed.";
  }
  return "This registration cannot be added to a calendar.";
}

export function memberEventCalendarHref(registrationId: string) {
  return `/api/portal/events/${registrationId}/calendar`;
}

export function sanitizeCalendarFileName(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "event"}.ics`;
}
