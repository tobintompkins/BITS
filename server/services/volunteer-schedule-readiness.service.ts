import { getMemberEngagementAccess } from "@/lib/auth/member-engagement-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import {
  VOLUNTEER_SCHEDULE_READINESS_WINDOW_DAYS,
  volunteerScheduleReadinessEventWhere,
  type VolunteerScheduleReadinessAttentionRow,
} from "@/lib/validation/volunteer-schedule-readiness";
import { VOLUNTEER_SUBSTITUTE_OPEN_STATUSES } from "@/lib/validation/volunteer-substitute-request";
import {
  approvedTimeOffCoversEvent,
  formatVolunteerEventWhen,
} from "@/lib/validation/volunteer-service-schedule";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type VolunteerScheduleReadinessCounts = {
  scheduledAssignments: number;
  confirmedAssignments: number;
  awaitingConfirmation: number;
  openSubstituteRequests: number;
  overlappingApprovedTimeOff: number;
};

export type VolunteerScheduleReadinessView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | {
      status: "READY";
      windowDays: number;
      counts: VolunteerScheduleReadinessCounts;
      attention: VolunteerScheduleReadinessAttentionRow[];
    };

const assignmentSelect = {
  id: true,
  memberConfirmedAt: true,
  event: {
    select: {
      id: true,
      title: true,
      startDateTime: true,
      endDateTime: true,
      timezone: true,
      isAllDay: true,
    },
  },
} as const;

const substituteSelect = {
  assignmentId: true,
  assignment: {
    select: {
      eventId: true,
    },
  },
} as const;

const timeOffSelect = {
  startDate: true,
  endDate: true,
} as const;

async function requireStaffScheduleAccess() {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" as const };

  const access = await getMemberEngagementAccess(organization.id);
  if (!access.canManageMinistryRosters) {
    return { status: "UNAUTHORIZED" as const };
  }

  return { status: "READY" as const, organization };
}

/**
 * Read-only 14-day volunteer schedule snapshot for authorized leadership.
 * Organization is resolved server-side.
 */
export async function getVolunteerScheduleReadiness(
  now = new Date(),
): Promise<VolunteerScheduleReadinessView> {
  const access = await requireStaffScheduleAccess();
  if (access.status !== "READY") return access;

  const eventWhere = volunteerScheduleReadinessEventWhere(
    access.organization.id,
    now,
  );

  const [assignments, substitutes, timeOffRequests] = await Promise.all([
    prisma.volunteerServiceAssignment.findMany({
      where: {
        organizationId: access.organization.id,
        status: "SCHEDULED",
        event: eventWhere,
      },
      orderBy: { event: { startDateTime: "asc" } },
      select: assignmentSelect,
    }),
    prisma.volunteerSubstituteRequest.findMany({
      where: {
        organizationId: access.organization.id,
        status: { in: [...VOLUNTEER_SUBSTITUTE_OPEN_STATUSES] },
        assignment: {
          organizationId: access.organization.id,
          status: "SCHEDULED",
          event: eventWhere,
        },
      },
      select: substituteSelect,
    }),
    prisma.volunteerTimeOffRequest.findMany({
      where: {
        organizationId: access.organization.id,
        status: "APPROVED",
      },
      select: timeOffSelect,
    }),
  ]);

  const confirmedAssignments = assignments.filter(
    (row) => row.memberConfirmedAt,
  ).length;
  const overlappingApprovedTimeOff = timeOffRequests.filter((request) =>
    assignments.some((assignment) =>
      approvedTimeOffCoversEvent(
        request.startDate,
        request.endDate,
        assignment.event,
      ),
    ),
  ).length;

  const substituteCountByEvent = new Map<string, number>();
  for (const row of substitutes) {
    const eventId = row.assignment.eventId;
    substituteCountByEvent.set(
      eventId,
      (substituteCountByEvent.get(eventId) ?? 0) + 1,
    );
  }

  const attentionByEvent = new Map<
    string,
    VolunteerScheduleReadinessAttentionRow & { start: Date }
  >();
  for (const row of assignments) {
    const current = attentionByEvent.get(row.event.id) ?? {
      eventTitle: row.event.title,
      startsAtLabel: formatVolunteerEventWhen(row.event),
      awaitingConfirmationCount: 0,
      openSubstituteRequestCount: substituteCountByEvent.get(row.event.id) ?? 0,
      start: row.event.startDateTime,
    };
    if (!row.memberConfirmedAt) {
      current.awaitingConfirmationCount += 1;
    }
    attentionByEvent.set(row.event.id, current);
  }

  const attention = [...attentionByEvent.values()]
    .filter(
      (row) =>
        row.awaitingConfirmationCount > 0 || row.openSubstituteRequestCount > 0,
    )
    .sort((left, right) => left.start.getTime() - right.start.getTime())
    .map(({ eventTitle, startsAtLabel, awaitingConfirmationCount, openSubstituteRequestCount }) => ({
      eventTitle,
      startsAtLabel,
      awaitingConfirmationCount,
      openSubstituteRequestCount,
    }));

  return {
    status: "READY",
    windowDays: VOLUNTEER_SCHEDULE_READINESS_WINDOW_DAYS,
    counts: {
      scheduledAssignments: assignments.length,
      confirmedAssignments,
      awaitingConfirmation: assignments.length - confirmedAssignments,
      openSubstituteRequests: substitutes.length,
      overlappingApprovedTimeOff,
    },
    attention,
  };
}
