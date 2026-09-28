import { z } from "zod";

export const STAFF_VOLUNTEER_SCHEDULE_PRINT_NOTICE =
  "Print this page for ministry teams serving this event. It does not change assignments or include private contact details.";

export const STAFF_VOLUNTEER_SCHEDULE_PRINT_EMPTY_COPY =
  "No volunteers are scheduled for this event.";

export const UNASSIGNED_MINISTRY_LABEL = "Other / Unassigned Ministry";

export const VOLUNTEER_SERVICE_SCHEDULE_PRINT_EVENT_FIELDS = [
  "churchName",
  "eventTitle",
  "startsAtLabel",
  "location",
] as const;

export const VOLUNTEER_SERVICE_SCHEDULE_PRINT_ASSIGNMENT_FIELDS = [
  "roleLabel",
  "memberName",
  "statusLabel",
  "confirmationLabel",
] as const;

export const VOLUNTEER_SERVICE_SCHEDULE_PRINT_GROUP_FIELDS = [
  "ministryName",
  "assignments",
] as const;

export type VolunteerServiceSchedulePrintAssignment = {
  roleLabel: string;
  memberName: string;
  statusLabel: "Scheduled" | "Cancelled";
  confirmationLabel: string;
};

export type VolunteerServiceSchedulePrintGroup = {
  ministryName: string;
  assignments: VolunteerServiceSchedulePrintAssignment[];
};

function firstString(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

export function parseVolunteerServiceSchedulePrintEventId(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  return z.string().uuid().safeParse(
    typeof input === "string" ? input : firstString(record.eventId),
  );
}

export function volunteerServiceSchedulePrintHref(eventId: string) {
  return `/volunteer-schedules/print?eventId=${encodeURIComponent(eventId)}`;
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, "en", { sensitivity: "base" });
}

export function groupVolunteerServiceSchedulePrintAssignments(
  rows: Array<
    VolunteerServiceSchedulePrintAssignment & { ministryName: string | null }
  >,
): VolunteerServiceSchedulePrintGroup[] {
  const byMinistry = new Map<string, VolunteerServiceSchedulePrintAssignment[]>();
  for (const row of rows) {
    const ministryName = row.ministryName?.trim() || UNASSIGNED_MINISTRY_LABEL;
    const group = byMinistry.get(ministryName) ?? [];
    group.push({
      roleLabel: row.roleLabel,
      memberName: row.memberName,
      statusLabel: row.statusLabel,
      confirmationLabel: row.confirmationLabel,
    });
    byMinistry.set(ministryName, group);
  }

  return [...byMinistry.entries()]
    .sort(([left], [right]) => {
      if (left === UNASSIGNED_MINISTRY_LABEL) return 1;
      if (right === UNASSIGNED_MINISTRY_LABEL) return -1;
      return compareText(left, right);
    })
    .map(([ministryName, assignments]) => ({
      ministryName,
      assignments: assignments.sort((left, right) => {
        const role = compareText(left.roleLabel, right.roleLabel);
        if (role !== 0) return role;
        const name = compareText(left.memberName, right.memberName);
        if (name !== 0) return name;
        return left.statusLabel.localeCompare(right.statusLabel);
      }),
    }));
}
