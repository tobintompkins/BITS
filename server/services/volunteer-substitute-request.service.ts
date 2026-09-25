import { getMemberEngagementAccess } from "@/lib/auth/member-engagement-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import { getMemberDisplayName } from "@/lib/utils/member-display";
import { formatVolunteerEventWhen } from "@/lib/validation/volunteer-service-schedule";
import {
  VOLUNTEER_SUBSTITUTE_OPEN_STATUSES,
  VOLUNTEER_SUBSTITUTE_STATUS_LABELS,
  parseStaffVolunteerSubstituteFilter,
  parseStaffVolunteerSubstituteReview,
  parseVolunteerSubstituteCancel,
  parseVolunteerSubstituteCreate,
  volunteerSubstituteResultMessage,
  type VolunteerSubstituteStatus,
} from "@/lib/validation/volunteer-substitute-request";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

const UPCOMING_EVENT_STATUSES = ["DRAFT", "PUBLISHED"] as const;

export type MemberVolunteerSubstituteRow = {
  requestId: string;
  assignmentId: string;
  status: VolunteerSubstituteStatus;
  statusLabel: string;
  memberReason: string | null;
  resultMessage: string | null;
  canCancel: boolean;
};

export type MemberVolunteerSubstituteView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "CONNECTION_PENDING"; accountEmail: string }
  | { status: "READY"; rows: MemberVolunteerSubstituteRow[] };

export type MemberVolunteerSubstituteMutationResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "CONNECTION_PENDING"; accountEmail: string }
  | { status: "INVALID"; message: string }
  | { status: "NOT_FOUND" }
  | { status: "DUPLICATE" }
  | { status: "CREATED" }
  | { status: "CANCELLED" };

export type StaffVolunteerSubstituteRow = {
  requestId: string;
  assignmentId: string;
  memberName: string;
  eventTitle: string;
  startsAtLabel: string;
  ministryName: string | null;
  roleLabel: string;
  memberReason: string | null;
  status: VolunteerSubstituteStatus;
  statusLabel: string;
  staffResolutionNote: string | null;
};

export type StaffVolunteerSubstituteView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID_FILTER" }
  | {
      status: "READY";
      filterStatus: VolunteerSubstituteStatus | null;
      rows: StaffVolunteerSubstituteRow[];
    };

export type StaffVolunteerSubstituteMutationResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID" }
  | { status: "NOT_FOUND" }
  | { status: "UPDATED" };

const memberSelect = {
  id: true,
  assignmentId: true,
  status: true,
  memberReason: true,
} as const;

const staffSelect = {
  id: true,
  assignmentId: true,
  status: true,
  memberReason: true,
  staffResolutionNote: true,
  member: {
    select: {
      preferredName: true,
      firstName: true,
      middleName: true,
      lastName: true,
      suffix: true,
    },
  },
  assignment: {
    select: {
      roleLabel: true,
      ministry: { select: { name: true } },
      event: {
        select: {
          title: true,
          startDateTime: true,
          endDateTime: true,
          timezone: true,
          isAllDay: true,
        },
      },
    },
  },
} as const;

function upcomingEventWhere(organizationId: string, now: Date) {
  return {
    organizationId,
    eventStatus: { in: [...UPCOMING_EVENT_STATUSES] },
    endDateTime: { gte: now },
  };
}

async function resolveLinkedMember() {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" as const };

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
      status: "CONNECTION_PENDING" as const,
      accountEmail: userAccount.primaryEmail,
    };
  }

  return { status: "READY" as const, userAccount, organization, member };
}

async function requireStaffReviewAccess() {
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

function toMemberRow(row: {
  id: string;
  assignmentId: string;
  status: VolunteerSubstituteStatus;
  memberReason: string | null;
}): MemberVolunteerSubstituteRow {
  return {
    requestId: row.id,
    assignmentId: row.assignmentId,
    status: row.status,
    statusLabel: VOLUNTEER_SUBSTITUTE_STATUS_LABELS[row.status],
    memberReason: row.memberReason,
    resultMessage: volunteerSubstituteResultMessage(row.status),
    canCancel: VOLUNTEER_SUBSTITUTE_OPEN_STATUSES.includes(
      row.status as (typeof VOLUNTEER_SUBSTITUTE_OPEN_STATUSES)[number],
    ),
  };
}

export async function getMemberSubstituteRequests(): Promise<MemberVolunteerSubstituteView> {
  const access = await resolveLinkedMember();
  if (access.status !== "READY") return access;

  const rows = await prisma.volunteerSubstituteRequest.findMany({
    where: {
      organizationId: access.organization.id,
      memberId: access.member.id,
    },
    orderBy: { createdAt: "desc" },
    select: memberSelect,
  });

  return {
    status: "READY",
    rows: rows.map((row) => toMemberRow(row)),
  };
}

export async function submitVolunteerSubstituteRequest(
  input: unknown,
): Promise<MemberVolunteerSubstituteMutationResult> {
  const access = await resolveLinkedMember();
  if (access.status !== "READY") return access;

  const parsed = parseVolunteerSubstituteCreate(input);
  if (!parsed.success) {
    return {
      status: "INVALID",
      message:
        parsed.error.issues[0]?.message ?? "Check the request and try again.",
    };
  }

  const assignment = await prisma.volunteerServiceAssignment.findFirst({
    where: {
      id: parsed.data.assignmentId,
      organizationId: access.organization.id,
      memberId: access.member.id,
      status: "SCHEDULED",
      event: upcomingEventWhere(access.organization.id, new Date()),
    },
    select: { id: true, status: true },
  });
  if (!assignment) return { status: "NOT_FOUND" };

  const existingOpen = await prisma.volunteerSubstituteRequest.findFirst({
    where: {
      organizationId: access.organization.id,
      assignmentId: assignment.id,
      memberId: access.member.id,
      status: { in: [...VOLUNTEER_SUBSTITUTE_OPEN_STATUSES] },
    },
    select: { id: true },
  });
  if (existingOpen) return { status: "DUPLICATE" };

  const created = await prisma.volunteerSubstituteRequest.create({
    data: {
      organizationId: access.organization.id,
      assignmentId: assignment.id,
      memberId: access.member.id,
      memberReason: parsed.data.memberReason ?? null,
      status: "OPEN",
    },
    select: { id: true },
  });

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "SUBMIT_VOLUNTEER_SUBSTITUTE_REQUEST",
    entityType: "VolunteerSubstituteRequest",
    entityId: created.id,
    changes: [
      { field: "status", oldValue: null, newValue: "OPEN" },
      { field: "assignmentId", oldValue: null, newValue: assignment.id },
      {
        field: "memberReason",
        oldValue: null,
        newValue: parsed.data.memberReason ? "set" : null,
      },
    ],
  });

  return { status: "CREATED" };
}

export async function cancelVolunteerSubstituteRequest(
  input: unknown,
): Promise<MemberVolunteerSubstituteMutationResult> {
  const access = await resolveLinkedMember();
  if (access.status !== "READY") return access;

  const parsed = parseVolunteerSubstituteCancel(input);
  if (!parsed.success) return { status: "NOT_FOUND" };

  const existing = await prisma.volunteerSubstituteRequest.findFirst({
    where: {
      id: parsed.data.requestId,
      organizationId: access.organization.id,
      memberId: access.member.id,
      status: { in: [...VOLUNTEER_SUBSTITUTE_OPEN_STATUSES] },
    },
    select: { id: true, status: true },
  });
  if (!existing) return { status: "NOT_FOUND" };

  const updated = await prisma.volunteerSubstituteRequest.updateMany({
    where: {
      id: existing.id,
      organizationId: access.organization.id,
      memberId: access.member.id,
      status: { in: [...VOLUNTEER_SUBSTITUTE_OPEN_STATUSES] },
    },
    data: { status: "CANCELLED" },
  });
  if (updated.count !== 1) return { status: "NOT_FOUND" };

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "CANCEL_VOLUNTEER_SUBSTITUTE_REQUEST",
    entityType: "VolunteerSubstituteRequest",
    entityId: existing.id,
    changes: [
      { field: "status", oldValue: existing.status, newValue: "CANCELLED" },
    ],
  });

  return { status: "CANCELLED" };
}

export async function getStaffVolunteerSubstituteRequests(
  input: unknown = {},
): Promise<StaffVolunteerSubstituteView> {
  const access = await requireStaffReviewAccess();
  if (access.status !== "READY") return access;

  const parsed = parseStaffVolunteerSubstituteFilter(input);
  if (!parsed.success) return { status: "INVALID_FILTER" };

  const filterStatus = parsed.data.status;
  const rows = await prisma.volunteerSubstituteRequest.findMany({
    where: {
      organizationId: access.organization.id,
      ...(filterStatus ? { status: filterStatus } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: staffSelect,
  });

  return {
    status: "READY",
    filterStatus,
    rows: rows.map((row) => ({
      requestId: row.id,
      assignmentId: row.assignmentId,
      memberName: getMemberDisplayName(row.member),
      eventTitle: row.assignment.event.title,
      startsAtLabel: formatVolunteerEventWhen(row.assignment.event),
      ministryName: row.assignment.ministry?.name ?? null,
      roleLabel: row.assignment.roleLabel,
      memberReason: row.memberReason,
      status: row.status,
      statusLabel: VOLUNTEER_SUBSTITUTE_STATUS_LABELS[row.status],
      staffResolutionNote: row.staffResolutionNote,
    })),
  };
}

export async function reviewVolunteerSubstituteRequest(
  input: unknown,
): Promise<StaffVolunteerSubstituteMutationResult> {
  const access = await requireStaffReviewAccess();
  if (access.status !== "READY") return access;

  const parsed = parseStaffVolunteerSubstituteReview(input);
  if (!parsed.success) return { status: "INVALID" };

  const existing = await prisma.volunteerSubstituteRequest.findFirst({
    where: {
      id: parsed.data.requestId,
      organizationId: access.organization.id,
      status: { in: [...VOLUNTEER_SUBSTITUTE_OPEN_STATUSES] },
    },
    select: { id: true, status: true, assignmentId: true },
  });
  if (!existing) return { status: "NOT_FOUND" };

  const nextStatus = parsed.data.status;
  const resolved =
    nextStatus === "RESOLVED" || nextStatus === "DECLINED"
      ? {
          resolvedAt: new Date(),
          resolvedByUserId: access.userAccount.id,
        }
      : {
          resolvedAt: null,
          resolvedByUserId: null,
        };

  const updated = await prisma.volunteerSubstituteRequest.updateMany({
    where: {
      id: existing.id,
      organizationId: access.organization.id,
      status: { in: [...VOLUNTEER_SUBSTITUTE_OPEN_STATUSES] },
    },
    data: {
      status: nextStatus,
      staffResolutionNote: parsed.data.staffResolutionNote ?? null,
      ...resolved,
    },
  });
  if (updated.count !== 1) return { status: "NOT_FOUND" };

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "REVIEW_VOLUNTEER_SUBSTITUTE_REQUEST",
    entityType: "VolunteerSubstituteRequest",
    entityId: existing.id,
    changes: [
      { field: "status", oldValue: existing.status, newValue: nextStatus },
      {
        field: "staffResolutionNote",
        oldValue: null,
        newValue: parsed.data.staffResolutionNote ? "set" : null,
      },
    ],
  });

  return { status: "UPDATED" };
}
