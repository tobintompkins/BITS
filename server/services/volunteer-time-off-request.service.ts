import { getMemberEngagementAccess } from "@/lib/auth/member-engagement-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import { getMemberDisplayName } from "@/lib/utils/member-display";
import {
  VOLUNTEER_TIME_OFF_OPEN_STATUSES,
  VOLUNTEER_TIME_OFF_STATUS_LABELS,
  datesOverlap,
  formatVolunteerTimeOffDate,
  parseDateOnly,
  parseStaffVolunteerTimeOffFilter,
  parseStaffVolunteerTimeOffReview,
  parseVolunteerTimeOffCancel,
  parseVolunteerTimeOffCreate,
  volunteerTimeOffResultMessage,
  type VolunteerTimeOffStatus,
} from "@/lib/validation/volunteer-time-off-request";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type MemberVolunteerTimeOffRow = {
  requestId: string;
  startDateLabel: string;
  endDateLabel: string;
  status: VolunteerTimeOffStatus;
  statusLabel: string;
  submittedLabel: string;
  memberReason: string | null;
  resultMessage: string | null;
  canCancel: boolean;
};

export type MemberVolunteerTimeOffView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "CONNECTION_PENDING"; accountEmail: string }
  | { status: "READY"; rows: MemberVolunteerTimeOffRow[] };

export type MemberVolunteerTimeOffMutationResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "CONNECTION_PENDING"; accountEmail: string }
  | { status: "INVALID"; message: string }
  | { status: "OVERLAP" }
  | { status: "NOT_FOUND" }
  | { status: "CREATED" }
  | { status: "CANCELLED" };

export type StaffVolunteerTimeOffRow = {
  requestId: string;
  memberName: string;
  startDateLabel: string;
  endDateLabel: string;
  memberReason: string | null;
  status: VolunteerTimeOffStatus;
  statusLabel: string;
  staffResolutionNote: string | null;
  submittedLabel: string;
};

export type StaffVolunteerTimeOffView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID_FILTER" }
  | {
      status: "READY";
      filterStatus: VolunteerTimeOffStatus | null;
      rows: StaffVolunteerTimeOffRow[];
    };

export type StaffVolunteerTimeOffMutationResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID" }
  | { status: "NOT_FOUND" }
  | { status: "UPDATED" };

const memberSelect = {
  id: true,
  startDate: true,
  endDate: true,
  status: true,
  createdAt: true,
  memberReason: true,
} as const;

const staffSelect = {
  id: true,
  startDate: true,
  endDate: true,
  status: true,
  createdAt: true,
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
} as const;

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
  startDate: Date;
  endDate: Date;
  status: VolunteerTimeOffStatus;
  createdAt: Date;
  memberReason: string | null;
}): MemberVolunteerTimeOffRow {
  return {
    requestId: row.id,
    startDateLabel: formatVolunteerTimeOffDate(row.startDate),
    endDateLabel: formatVolunteerTimeOffDate(row.endDate),
    status: row.status,
    statusLabel: VOLUNTEER_TIME_OFF_STATUS_LABELS[row.status],
    submittedLabel: formatVolunteerTimeOffDate(row.createdAt),
    memberReason: row.memberReason,
    resultMessage: volunteerTimeOffResultMessage(row.status),
    canCancel: VOLUNTEER_TIME_OFF_OPEN_STATUSES.includes(
      row.status as (typeof VOLUNTEER_TIME_OFF_OPEN_STATUSES)[number],
    ),
  };
}

export async function getMemberVolunteerTimeOffRequests(): Promise<MemberVolunteerTimeOffView> {
  const access = await resolveLinkedMember();
  if (access.status !== "READY") return access;

  const rows = await prisma.volunteerTimeOffRequest.findMany({
    where: {
      organizationId: access.organization.id,
      memberId: access.member.id,
    },
    orderBy: [{ startDate: "asc" }, { createdAt: "desc" }],
    select: memberSelect,
  });

  return {
    status: "READY",
    rows: rows.map((row) => toMemberRow(row)),
  };
}

export async function submitVolunteerTimeOffRequest(
  input: unknown,
): Promise<MemberVolunteerTimeOffMutationResult> {
  const access = await resolveLinkedMember();
  if (access.status !== "READY") return access;

  const parsed = parseVolunteerTimeOffCreate(input);
  if (!parsed.success) {
    return {
      status: "INVALID",
      message:
        parsed.error.issues[0]?.message ?? "Check the dates and try again.",
    };
  }

  const startDate = parseDateOnly(parsed.data.startDate)!;
  const endDate = parseDateOnly(parsed.data.endDate)!;

  const openRows = await prisma.volunteerTimeOffRequest.findMany({
    where: {
      organizationId: access.organization.id,
      memberId: access.member.id,
      status: { in: [...VOLUNTEER_TIME_OFF_OPEN_STATUSES] },
    },
    select: { startDate: true, endDate: true },
  });
  if (
    openRows.some((row) =>
      datesOverlap(row.startDate, row.endDate, startDate, endDate),
    )
  ) {
    return { status: "OVERLAP" };
  }

  const created = await prisma.volunteerTimeOffRequest.create({
    data: {
      organizationId: access.organization.id,
      memberId: access.member.id,
      startDate,
      endDate,
      memberReason: parsed.data.memberReason ?? null,
      status: "OPEN",
    },
    select: { id: true },
  });

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "SUBMIT_VOLUNTEER_TIME_OFF_REQUEST",
    entityType: "VolunteerTimeOffRequest",
    entityId: created.id,
    changes: [
      { field: "status", oldValue: null, newValue: "OPEN" },
      { field: "startDate", oldValue: null, newValue: parsed.data.startDate },
      { field: "endDate", oldValue: null, newValue: parsed.data.endDate },
      {
        field: "memberReason",
        oldValue: null,
        newValue: parsed.data.memberReason ? "set" : null,
      },
    ],
  });

  return { status: "CREATED" };
}

export async function cancelVolunteerTimeOffRequest(
  input: unknown,
): Promise<MemberVolunteerTimeOffMutationResult> {
  const access = await resolveLinkedMember();
  if (access.status !== "READY") return access;

  const parsed = parseVolunteerTimeOffCancel(input);
  if (!parsed.success) return { status: "NOT_FOUND" };

  const existing = await prisma.volunteerTimeOffRequest.findFirst({
    where: {
      id: parsed.data.requestId,
      organizationId: access.organization.id,
      memberId: access.member.id,
      status: { in: [...VOLUNTEER_TIME_OFF_OPEN_STATUSES] },
    },
    select: { id: true, status: true },
  });
  if (!existing) return { status: "NOT_FOUND" };

  const updated = await prisma.volunteerTimeOffRequest.updateMany({
    where: {
      id: existing.id,
      organizationId: access.organization.id,
      memberId: access.member.id,
      status: { in: [...VOLUNTEER_TIME_OFF_OPEN_STATUSES] },
    },
    data: { status: "CANCELLED" },
  });
  if (updated.count !== 1) return { status: "NOT_FOUND" };

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "CANCEL_VOLUNTEER_TIME_OFF_REQUEST",
    entityType: "VolunteerTimeOffRequest",
    entityId: existing.id,
    changes: [
      { field: "status", oldValue: existing.status, newValue: "CANCELLED" },
    ],
  });

  return { status: "CANCELLED" };
}

export async function getStaffVolunteerTimeOffRequests(
  input: unknown = {},
): Promise<StaffVolunteerTimeOffView> {
  const access = await requireStaffReviewAccess();
  if (access.status !== "READY") return access;

  const parsed = parseStaffVolunteerTimeOffFilter(input);
  if (!parsed.success) return { status: "INVALID_FILTER" };

  const filterStatus = parsed.data.status;
  const rows = await prisma.volunteerTimeOffRequest.findMany({
    where: {
      organizationId: access.organization.id,
      ...(filterStatus ? { status: filterStatus } : {}),
    },
    orderBy: [{ startDate: "asc" }, { createdAt: "desc" }],
    select: staffSelect,
  });

  return {
    status: "READY",
    filterStatus,
    rows: rows.map((row) => ({
      requestId: row.id,
      memberName: getMemberDisplayName(row.member),
      startDateLabel: formatVolunteerTimeOffDate(row.startDate),
      endDateLabel: formatVolunteerTimeOffDate(row.endDate),
      memberReason: row.memberReason,
      status: row.status,
      statusLabel: VOLUNTEER_TIME_OFF_STATUS_LABELS[row.status],
      staffResolutionNote: row.staffResolutionNote,
      submittedLabel: formatVolunteerTimeOffDate(row.createdAt),
    })),
  };
}

export async function reviewVolunteerTimeOffRequest(
  input: unknown,
): Promise<StaffVolunteerTimeOffMutationResult> {
  const access = await requireStaffReviewAccess();
  if (access.status !== "READY") return access;

  const parsed = parseStaffVolunteerTimeOffReview(input);
  if (!parsed.success) return { status: "INVALID" };

  const existing = await prisma.volunteerTimeOffRequest.findFirst({
    where: {
      id: parsed.data.requestId,
      organizationId: access.organization.id,
      status: { in: [...VOLUNTEER_TIME_OFF_OPEN_STATUSES] },
    },
    select: { id: true, status: true },
  });
  if (!existing) return { status: "NOT_FOUND" };

  const nextStatus = parsed.data.status;
  const resolved =
    nextStatus === "APPROVED" || nextStatus === "DECLINED"
      ? {
          resolvedAt: new Date(),
          resolvedByUserId: access.userAccount.id,
        }
      : {
          resolvedAt: null,
          resolvedByUserId: null,
        };

  const updated = await prisma.volunteerTimeOffRequest.updateMany({
    where: {
      id: existing.id,
      organizationId: access.organization.id,
      status: { in: [...VOLUNTEER_TIME_OFF_OPEN_STATUSES] },
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
    action: "REVIEW_VOLUNTEER_TIME_OFF_REQUEST",
    entityType: "VolunteerTimeOffRequest",
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
