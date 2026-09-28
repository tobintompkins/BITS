import { getMemberEngagementAccess } from "@/lib/auth/member-engagement-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import { getMemberDisplayName } from "@/lib/utils/member-display";
import { parseDateOnly } from "@/lib/validation/volunteer-time-off-request";
import {
  VOLUNTEER_TRAINING_STATUS_LABELS,
  formatVolunteerTrainingDate,
  parseStaffVolunteerTrainingFilter,
  parseVolunteerTrainingCreate,
  parseVolunteerTrainingRecordId,
  parseVolunteerTrainingUpdate,
  toVolunteerTrainingDateValue,
  volunteerTrainingStatus,
  type VolunteerTrainingRow,
  type VolunteerTrainingStatusFilter,
} from "@/lib/validation/volunteer-training";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type StaffVolunteerTrainingOption = {
  id: string;
  label: string;
};

export type StaffVolunteerTrainingView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID_FILTER" }
  | {
      status: "READY";
      filterStatus: VolunteerTrainingStatusFilter | null;
      members: StaffVolunteerTrainingOption[];
      ministries: StaffVolunteerTrainingOption[];
      rows: VolunteerTrainingRow[];
    };

export type StaffVolunteerTrainingMutationResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID" }
  | { status: "NOT_FOUND" }
  | { status: "MINISTRY_MISMATCH" }
  | { status: "CREATED" }
  | { status: "UPDATED" }
  | { status: "ARCHIVED" }
  | { status: "RESTORED" };

const memberNameSelect = {
  preferredName: true,
  firstName: true,
  middleName: true,
  lastName: true,
  suffix: true,
} as const;

const trainingSelect = {
  id: true,
  title: true,
  completedOn: true,
  expiresOn: true,
  archivedAt: true,
  member: { select: memberNameSelect },
  ministry: { select: { name: true } },
} as const;

async function requireStaffTrainingAccess() {
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

function toRow(
  row: {
    id: string;
    title: string;
    completedOn: Date;
    expiresOn: Date | null;
    archivedAt: Date | null;
    member: {
      preferredName: string | null;
      firstName: string;
      middleName: string | null;
      lastName: string;
      suffix: string | null;
    };
    ministry: { name: string } | null;
  },
  now: Date,
): VolunteerTrainingRow {
  const status = volunteerTrainingStatus(row.expiresOn, now);
  return {
    recordId: row.id,
    memberName: getMemberDisplayName(row.member),
    ministryName: row.ministry?.name ?? null,
    title: row.title,
    completedOnLabel: formatVolunteerTrainingDate(row.completedOn),
    expiresOnLabel: row.expiresOn
      ? formatVolunteerTrainingDate(row.expiresOn)
      : null,
    completedOnValue: toVolunteerTrainingDateValue(row.completedOn),
    expiresOnValue: row.expiresOn
      ? toVolunteerTrainingDateValue(row.expiresOn)
      : "",
    status,
    statusLabel: VOLUNTEER_TRAINING_STATUS_LABELS[status],
    archived: row.archivedAt != null,
  };
}

async function assertActiveMember(
  organizationId: string,
  memberId: string,
) {
  return prisma.member.findFirst({
    where: {
      id: memberId,
      organizationId,
      recordStatus: "ACTIVE",
    },
    select: { id: true },
  });
}

async function assertActiveMinistryRoster(
  organizationId: string,
  memberId: string,
  ministryId: string,
) {
  const ministry = await prisma.ministry.findFirst({
    where: {
      id: ministryId,
      organizationId,
      isActive: true,
    },
    select: { id: true },
  });
  if (!ministry) return { status: "NOT_FOUND" as const };

  const roster = await prisma.memberMinistry.findFirst({
    where: {
      memberId,
      ministryId: ministry.id,
      status: "ACTIVE",
      endedDate: null,
      member: {
        organizationId,
        recordStatus: "ACTIVE",
      },
      ministry: {
        organizationId,
        isActive: true,
      },
    },
    select: { id: true },
  });
  if (!roster) return { status: "MINISTRY_MISMATCH" as const };
  return { status: "READY" as const, ministryId: ministry.id };
}

/**
 * Ownership-scoped staff training records. Client organization
 * fields are ignored.
 */
export async function getStaffVolunteerTraining(
  input: unknown = {},
  now = new Date(),
): Promise<StaffVolunteerTrainingView> {
  const access = await requireStaffTrainingAccess();
  if (access.status !== "READY") return access;

  const parsed = parseStaffVolunteerTrainingFilter(input);
  if (!parsed.success) return { status: "INVALID_FILTER" };
  const filterStatus = parsed.data.status;

  const [members, ministries, records] = await Promise.all([
    prisma.member.findMany({
      where: {
        organizationId: access.organization.id,
        recordStatus: "ACTIVE",
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        ...memberNameSelect,
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
    prisma.volunteerTrainingRecord.findMany({
      where: {
        organizationId: access.organization.id,
        archivedAt: filterStatus === "ARCHIVED" ? { not: null } : null,
      },
      orderBy: [{ expiresOn: "asc" }, { completedOn: "desc" }],
      select: trainingSelect,
    }),
  ]);

  const rows = records
    .map((row) => toRow(row, now))
    .filter((row) => {
      if (!filterStatus || filterStatus === "ARCHIVED") return true;
      return row.status === filterStatus;
    });

  return {
    status: "READY",
    filterStatus,
    members: members.map((member) => ({
      id: member.id,
      label: getMemberDisplayName(member),
    })),
    ministries: ministries.map((ministry) => ({
      id: ministry.id,
      label: ministry.name,
    })),
    rows,
  };
}

export async function createVolunteerTrainingRecord(
  input: unknown,
): Promise<StaffVolunteerTrainingMutationResult> {
  const access = await requireStaffTrainingAccess();
  if (access.status !== "READY") return access;

  const parsed = parseVolunteerTrainingCreate(input);
  if (!parsed.success) return { status: "INVALID" };

  const completedOn = parseDateOnly(parsed.data.completedOn);
  const expiresOn = parsed.data.expiresOn
    ? parseDateOnly(parsed.data.expiresOn)
    : null;
  if (!completedOn || (parsed.data.expiresOn && !expiresOn)) {
    return { status: "INVALID" };
  }

  const member = await assertActiveMember(
    access.organization.id,
    parsed.data.memberId,
  );
  if (!member) return { status: "NOT_FOUND" };

  let ministryId: string | null = null;
  if (parsed.data.ministryId) {
    const roster = await assertActiveMinistryRoster(
      access.organization.id,
      member.id,
      parsed.data.ministryId,
    );
    if (roster.status !== "READY") return roster;
    ministryId = roster.ministryId;
  }

  const created = await prisma.volunteerTrainingRecord.create({
    data: {
      organizationId: access.organization.id,
      memberId: member.id,
      ministryId,
      title: parsed.data.title,
      completedOn,
      expiresOn,
      createdByUserAccountId: access.userAccount.id,
      updatedByUserAccountId: access.userAccount.id,
    },
    select: { id: true },
  });

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "CREATE_VOLUNTEER_TRAINING_RECORD",
    entityType: "VolunteerTrainingRecord",
    entityId: created.id,
    changes: [
      { field: "title", oldValue: null, newValue: "set" },
      {
        field: "completedOn",
        oldValue: null,
        newValue: toVolunteerTrainingDateValue(completedOn),
      },
      {
        field: "expiresOn",
        oldValue: null,
        newValue: expiresOn ? toVolunteerTrainingDateValue(expiresOn) : null,
      },
    ],
  });

  return { status: "CREATED" };
}

export async function updateVolunteerTrainingRecord(
  input: unknown,
): Promise<StaffVolunteerTrainingMutationResult> {
  const access = await requireStaffTrainingAccess();
  if (access.status !== "READY") return access;

  const parsed = parseVolunteerTrainingUpdate(input);
  if (!parsed.success) return { status: "INVALID" };

  const completedOn = parseDateOnly(parsed.data.completedOn);
  const expiresOn = parsed.data.expiresOn
    ? parseDateOnly(parsed.data.expiresOn)
    : null;
  if (!completedOn || (parsed.data.expiresOn && !expiresOn)) {
    return { status: "INVALID" };
  }

  const existing = await prisma.volunteerTrainingRecord.findFirst({
    where: {
      id: parsed.data.recordId,
      organizationId: access.organization.id,
      archivedAt: null,
    },
    select: {
      id: true,
      title: true,
      completedOn: true,
      expiresOn: true,
    },
  });
  if (!existing) return { status: "NOT_FOUND" };

  const updated = await prisma.volunteerTrainingRecord.updateMany({
    where: {
      id: existing.id,
      organizationId: access.organization.id,
      archivedAt: null,
    },
    data: {
      title: parsed.data.title,
      completedOn,
      expiresOn,
      updatedByUserAccountId: access.userAccount.id,
    },
  });
  if (updated.count !== 1) return { status: "NOT_FOUND" };

  const changes: Array<{
    field: string;
    oldValue: string | null;
    newValue: string | null;
  }> = [];
  if (existing.title !== parsed.data.title) {
    changes.push({ field: "title", oldValue: "set", newValue: "set" });
  }
  const previousCompleted = toVolunteerTrainingDateValue(existing.completedOn);
  const nextCompleted = toVolunteerTrainingDateValue(completedOn);
  if (previousCompleted !== nextCompleted) {
    changes.push({
      field: "completedOn",
      oldValue: previousCompleted,
      newValue: nextCompleted,
    });
  }
  const previousExpires = existing.expiresOn
    ? toVolunteerTrainingDateValue(existing.expiresOn)
    : null;
  const nextExpires = expiresOn ? toVolunteerTrainingDateValue(expiresOn) : null;
  if (previousExpires !== nextExpires) {
    changes.push({
      field: "expiresOn",
      oldValue: previousExpires,
      newValue: nextExpires,
    });
  }

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "UPDATE_VOLUNTEER_TRAINING_RECORD",
    entityType: "VolunteerTrainingRecord",
    entityId: existing.id,
    changes,
  });

  return { status: "UPDATED" };
}

export async function archiveVolunteerTrainingRecord(
  input: unknown,
): Promise<StaffVolunteerTrainingMutationResult> {
  const access = await requireStaffTrainingAccess();
  if (access.status !== "READY") return access;

  const parsed = parseVolunteerTrainingRecordId(input);
  if (!parsed.success) return { status: "INVALID" };

  const existing = await prisma.volunteerTrainingRecord.findFirst({
    where: {
      id: parsed.data,
      organizationId: access.organization.id,
      archivedAt: null,
    },
    select: { id: true },
  });
  if (!existing) return { status: "NOT_FOUND" };

  const archivedAt = new Date();
  const updated = await prisma.volunteerTrainingRecord.updateMany({
    where: {
      id: existing.id,
      organizationId: access.organization.id,
      archivedAt: null,
    },
    data: {
      archivedAt,
      archivedByUserAccountId: access.userAccount.id,
      updatedByUserAccountId: access.userAccount.id,
    },
  });
  if (updated.count !== 1) return { status: "NOT_FOUND" };

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "ARCHIVE_VOLUNTEER_TRAINING_RECORD",
    entityType: "VolunteerTrainingRecord",
    entityId: existing.id,
    changes: [{ field: "archivedAt", oldValue: null, newValue: "set" }],
  });

  return { status: "ARCHIVED" };
}

export async function restoreVolunteerTrainingRecord(
  input: unknown,
): Promise<StaffVolunteerTrainingMutationResult> {
  const access = await requireStaffTrainingAccess();
  if (access.status !== "READY") return access;

  const parsed = parseVolunteerTrainingRecordId(input);
  if (!parsed.success) return { status: "INVALID" };

  const existing = await prisma.volunteerTrainingRecord.findFirst({
    where: {
      id: parsed.data,
      organizationId: access.organization.id,
      archivedAt: { not: null },
    },
    select: { id: true },
  });
  if (!existing) return { status: "NOT_FOUND" };

  const updated = await prisma.volunteerTrainingRecord.updateMany({
    where: {
      id: existing.id,
      organizationId: access.organization.id,
      archivedAt: { not: null },
    },
    data: {
      archivedAt: null,
      archivedByUserAccountId: null,
      updatedByUserAccountId: access.userAccount.id,
    },
  });
  if (updated.count !== 1) return { status: "NOT_FOUND" };

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "RESTORE_VOLUNTEER_TRAINING_RECORD",
    entityType: "VolunteerTrainingRecord",
    entityId: existing.id,
    changes: [{ field: "archivedAt", oldValue: "set", newValue: null }],
  });

  return { status: "RESTORED" };
}
