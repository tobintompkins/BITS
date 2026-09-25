import { getMemberEngagementAccess } from "@/lib/auth/member-engagement-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import { getMemberDisplayName } from "@/lib/utils/member-display";
import {
  approvedTimeOffCoversEvent,
  formatVolunteerEventWhen,
  normalizeVolunteerRoleLabel,
  parseVolunteerServiceAssignmentCancel,
  parseVolunteerServiceAssignmentCreate,
  publicVolunteerLocationText,
  volunteerEventsConflict,
  volunteerRoleKey,
  type MemberVolunteerScheduleRow,
} from "@/lib/validation/volunteer-service-schedule";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

const UPCOMING_EVENT_STATUSES = ["DRAFT", "PUBLISHED"] as const;

export type StaffVolunteerScheduleOption = {
  id: string;
  label: string;
};

export type StaffVolunteerScheduleRow = {
  assignmentId: string;
  eventTitle: string;
  startsAtLabel: string;
  memberName: string;
  ministryName: string | null;
  roleLabel: string;
  status: "SCHEDULED" | "CANCELLED";
};

export type StaffVolunteerScheduleView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | {
      status: "READY";
      events: StaffVolunteerScheduleOption[];
      members: StaffVolunteerScheduleOption[];
      ministries: StaffVolunteerScheduleOption[];
      rows: StaffVolunteerScheduleRow[];
    };

export type StaffVolunteerScheduleMutationResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID" }
  | { status: "NOT_FOUND" }
  | { status: "MINISTRY_MISMATCH" }
  | { status: "DUPLICATE" }
  | { status: "TIME_OFF_CONFLICT" }
  | { status: "OVERLAP_CONFLICT" }
  | { status: "CREATED" }
  | { status: "CANCELLED" };

export type MemberVolunteerScheduleView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "CONNECTION_PENDING"; accountEmail: string }
  | { status: "READY"; rows: MemberVolunteerScheduleRow[] };

const publicLocationSelect = {
  name: true,
  roomName: true,
  isOnline: true,
  city: true,
  state: true,
} as const;

const staffAssignmentSelect = {
  id: true,
  roleLabel: true,
  status: true,
  event: {
    select: {
      title: true,
      startDateTime: true,
      endDateTime: true,
      timezone: true,
      isAllDay: true,
    },
  },
  member: {
    select: {
      preferredName: true,
      firstName: true,
      middleName: true,
      lastName: true,
      suffix: true,
    },
  },
  ministry: {
    select: { name: true },
  },
} as const;

const memberAssignmentSelect = {
  id: true,
  roleLabel: true,
  event: {
    select: {
      title: true,
      startDateTime: true,
      endDateTime: true,
      timezone: true,
      isAllDay: true,
      location: { select: publicLocationSelect },
    },
  },
  ministry: {
    select: { name: true },
  },
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

  return { status: "READY" as const, userAccount, organization };
}

function upcomingEventWhere(organizationId: string, now: Date) {
  return {
    organizationId,
    eventStatus: { in: [...UPCOMING_EVENT_STATUSES] },
    endDateTime: { gte: now },
  };
}

export async function getStaffVolunteerSchedule(): Promise<StaffVolunteerScheduleView> {
  const access = await requireStaffScheduleAccess();
  if (access.status !== "READY") return access;

  const now = new Date();
  const [events, members, ministries, assignments] = await Promise.all([
    prisma.event.findMany({
      where: upcomingEventWhere(access.organization.id, now),
      orderBy: { startDateTime: "asc" },
      select: {
        id: true,
        title: true,
        startDateTime: true,
        endDateTime: true,
        timezone: true,
        isAllDay: true,
      },
    }),
    prisma.member.findMany({
      where: {
        organizationId: access.organization.id,
        recordStatus: "ACTIVE",
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        preferredName: true,
        firstName: true,
        middleName: true,
        lastName: true,
        suffix: true,
      },
    }),
    prisma.ministry.findMany({
      where: {
        organizationId: access.organization.id,
        isActive: true,
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.volunteerServiceAssignment.findMany({
      where: {
        organizationId: access.organization.id,
        event: upcomingEventWhere(access.organization.id, now),
      },
      orderBy: [{ event: { startDateTime: "asc" } }, { createdAt: "asc" }],
      select: staffAssignmentSelect,
    }),
  ]);

  return {
    status: "READY",
    events: events.map((event) => ({
      id: event.id,
      label: `${event.title} · ${formatVolunteerEventWhen(event)}`,
    })),
    members: members.map((member) => ({
      id: member.id,
      label: getMemberDisplayName(member),
    })),
    ministries: ministries.map((ministry) => ({
      id: ministry.id,
      label: ministry.name,
    })),
    rows: assignments.map((row) => ({
      assignmentId: row.id,
      eventTitle: row.event.title,
      startsAtLabel: formatVolunteerEventWhen(row.event),
      memberName: getMemberDisplayName(row.member),
      ministryName: row.ministry?.name ?? null,
      roleLabel: row.roleLabel,
      status: row.status,
    })),
  };
}

export async function createVolunteerServiceAssignment(
  input: unknown,
): Promise<StaffVolunteerScheduleMutationResult> {
  const access = await requireStaffScheduleAccess();
  if (access.status !== "READY") return access;

  const parsed = parseVolunteerServiceAssignmentCreate(input);
  if (!parsed.success) return { status: "INVALID" };

  const roleLabel = normalizeVolunteerRoleLabel(parsed.data.roleLabel);
  const now = new Date();

  const event = await prisma.event.findFirst({
    where: {
      id: parsed.data.eventId,
      ...upcomingEventWhere(access.organization.id, now),
    },
    select: {
      id: true,
      startDateTime: true,
      endDateTime: true,
      timezone: true,
      isAllDay: true,
    },
  });
  if (!event) return { status: "NOT_FOUND" };

  const member = await prisma.member.findFirst({
    where: {
      id: parsed.data.memberId,
      organizationId: access.organization.id,
      recordStatus: "ACTIVE",
    },
    select: { id: true },
  });
  if (!member) return { status: "NOT_FOUND" };

  const ministryId = parsed.data.ministryId ?? null;

  if (ministryId) {
    const ministry = await prisma.ministry.findFirst({
      where: {
        id: ministryId,
        organizationId: access.organization.id,
        isActive: true,
      },
      select: { id: true },
    });
    if (!ministry) return { status: "NOT_FOUND" };

    const roster = await prisma.memberMinistry.findFirst({
      where: {
        memberId: member.id,
        ministryId: ministry.id,
        status: "ACTIVE",
        endedDate: null,
        member: {
          organizationId: access.organization.id,
          recordStatus: "ACTIVE",
        },
        ministry: {
          organizationId: access.organization.id,
          isActive: true,
        },
      },
      select: { id: true },
    });
    if (!roster) return { status: "MINISTRY_MISMATCH" };
  }

  const approvedTimeOff = await prisma.volunteerTimeOffRequest.findMany({
    where: {
      organizationId: access.organization.id,
      memberId: member.id,
      status: "APPROVED",
    },
    select: {
      startDate: true,
      endDate: true,
    },
  });
  if (
    approvedTimeOff.some((row) =>
      approvedTimeOffCoversEvent(row.startDate, row.endDate, event),
    )
  ) {
    return { status: "TIME_OFF_CONFLICT" };
  }

  const existing = await prisma.volunteerServiceAssignment.findMany({
    where: {
      organizationId: access.organization.id,
      memberId: member.id,
      status: "SCHEDULED",
    },
    select: {
      eventId: true,
      roleLabel: true,
      ministryId: true,
      event: {
        select: {
          startDateTime: true,
          endDateTime: true,
          timezone: true,
          isAllDay: true,
        },
      },
    },
  });
  const duplicate = existing.some(
    (row) =>
      row.eventId === event.id &&
      (row.ministryId ?? null) === ministryId &&
      volunteerRoleKey(row.roleLabel) === volunteerRoleKey(roleLabel),
  );
  if (duplicate) return { status: "DUPLICATE" };

  if (
    existing.some((row) => volunteerEventsConflict(event, row.event))
  ) {
    return { status: "OVERLAP_CONFLICT" };
  }

  const staffNote = parsed.data.staffNote ?? null;
  const created = await prisma.volunteerServiceAssignment.create({
    data: {
      organizationId: access.organization.id,
      eventId: event.id,
      memberId: member.id,
      ministryId,
      createdByUserId: access.userAccount.id,
      roleLabel,
      status: "SCHEDULED",
      staffNote,
    },
    select: { id: true },
  });

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "CREATE_VOLUNTEER_SERVICE_ASSIGNMENT",
    entityType: "VolunteerServiceAssignment",
    entityId: created.id,
    changes: [
      { field: "status", oldValue: null, newValue: "SCHEDULED" },
      { field: "roleLabel", oldValue: null, newValue: roleLabel },
      { field: "eventId", oldValue: null, newValue: event.id },
      { field: "memberId", oldValue: null, newValue: member.id },
      {
        field: "ministryId",
        oldValue: null,
        newValue: ministryId,
      },
      {
        field: "staffNote",
        oldValue: null,
        newValue: staffNote ? "set" : null,
      },
    ],
  });

  return { status: "CREATED" };
}

export async function cancelVolunteerServiceAssignment(
  input: unknown,
): Promise<StaffVolunteerScheduleMutationResult> {
  const access = await requireStaffScheduleAccess();
  if (access.status !== "READY") return access;

  const parsed = parseVolunteerServiceAssignmentCancel(input);
  if (!parsed.success) return { status: "INVALID" };

  const existing = await prisma.volunteerServiceAssignment.findFirst({
    where: {
      id: parsed.data.assignmentId,
      organizationId: access.organization.id,
      status: "SCHEDULED",
    },
    select: { id: true },
  });
  if (!existing) return { status: "NOT_FOUND" };

  const updated = await prisma.volunteerServiceAssignment.updateMany({
    where: {
      id: existing.id,
      organizationId: access.organization.id,
      status: "SCHEDULED",
    },
    data: {
      status: "CANCELLED",
      cancellationNote: parsed.data.cancellationNote,
      cancelledAt: new Date(),
      cancelledByUserId: access.userAccount.id,
    },
  });
  if (updated.count !== 1) return { status: "NOT_FOUND" };

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "CANCEL_VOLUNTEER_SERVICE_ASSIGNMENT",
    entityType: "VolunteerServiceAssignment",
    entityId: existing.id,
    changes: [
      { field: "status", oldValue: "SCHEDULED", newValue: "CANCELLED" },
      {
        field: "cancellationNote",
        oldValue: null,
        newValue: parsed.data.cancellationNote ? "set" : null,
      },
    ],
  });

  return { status: "CANCELLED" };
}

export async function getMemberVolunteerSchedule(): Promise<MemberVolunteerScheduleView> {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" };

  const member = await prisma.member.findFirst({
    where: {
      organizationId: organization.id,
      userAccountId: userAccount.id,
      recordStatus: "ACTIVE",
    },
    select: { id: true },
  });
  if (!member) {
    return {
      status: "CONNECTION_PENDING",
      accountEmail: userAccount.primaryEmail,
    };
  }

  const now = new Date();
  const rows = await prisma.volunteerServiceAssignment.findMany({
    where: {
      organizationId: organization.id,
      memberId: member.id,
      status: "SCHEDULED",
      event: upcomingEventWhere(organization.id, now),
    },
    orderBy: { event: { startDateTime: "asc" } },
    select: memberAssignmentSelect,
  });

  return {
    status: "READY",
    rows: rows.map((row) => ({
      assignmentId: row.id,
      eventTitle: row.event.title,
      startsAtLabel: formatVolunteerEventWhen(row.event),
      location: publicVolunteerLocationText(row.event.location),
      ministryName: row.ministry?.name ?? null,
      roleLabel: row.roleLabel,
    })),
  };
}
