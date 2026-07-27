import type {
  AttendanceType,
  FollowUpPriority,
  FollowUpStatus,
  FollowUpType,
  PrayerPrivacyLevel,
  PrayerRequestStatus,
} from "@/app/generated/prisma/client";
import type { TimelineFilter } from "@/lib/types/care-engagement";
import {
  canViewPrayerPrivacy,
  getCareAccess,
  sanitizePastoralNoteForAccess,
  type CareAccess,
} from "@/lib/auth/care-permissions";
import {
  type AttendanceInput,
  type CommunicationInput,
  type FollowUpInput,
  type PastoralCareInput,
  type PrayerRequestInput,
  buildSafeAuditChanges,
} from "@/lib/validation/care-engagement";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findEntityAuditEvents } from "@/server/repositories/audit-event.repository";
import {
  countFollowUpsByStatus,
  createAttendance,
  createCommunication,
  createFollowUp,
  createPastoralCareNote,
  createPrayerRequest,
  deleteAttendance,
  deleteCommunication,
  deleteFollowUp,
  deletePastoralCareNote,
  deletePrayerRequest,
  findAttendanceById,
  findAttendanceRecords,
  findCommunicationById,
  findCommunications,
  findFollowUpById,
  findFollowUps,
  findPastoralCareNoteById,
  findPastoralCareNotes,
  findPrayerRequestById,
  findPrayerRequests,
  findStaffUsers,
  getDashboardCareCounts,
  getMemberAttendanceStats,
  setPrayerRequestPublicVisibility,
  updateAttendance,
  updateCommunication,
  updateFollowUp,
  updatePastoralCareNote,
  updatePrayerRequest,
} from "@/server/repositories/care-engagement.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type Actor = { userAccountId: string | null; email: string | null };

async function getOrganizationId() {
  const organization = await findPrimaryOrganization();
  if (!organization) {
    throw new Error("Organization not found.");
  }
  return organization.id;
}

function parseDate(value?: string) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function parseDateTime(date: string, time?: string) {
  if (!time) return null;
  return new Date(`${date}T${time}:00.000Z`);
}

async function audit(
  organizationId: string,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string,
  changes: Array<{ field: string; oldValue: string | null; newValue: string | null }>,
) {
  await createAuditEvent({
    organizationId,
    actorUserAccountId: actor.userAccountId,
    action,
    entityType,
    entityId,
    changes:
      changes.length > 0
        ? changes
        : [{ field: "actorEmail", oldValue: null, newValue: actor.email }],
  });
}

function requireUserId(actor: Actor) {
  if (!actor.userAccountId) {
    throw new Error("A signed-in user account is required.");
  }
  return actor.userAccountId;
}

function allowedPrayerLevels(access: CareAccess): PrayerPrivacyLevel[] {
  const levels: PrayerPrivacyLevel[] = [];
  if (access.canViewPrayerRequests) {
    levels.push("PUBLIC", "PRAYER_TEAM");
  }
  if (access.canViewPastoralStaffPrayer) {
    levels.push("PASTORAL_STAFF");
  }
  if (access.canViewPrivatePrayer) {
    levels.push("PRIVATE");
  }
  return levels;
}

export async function getAttendanceRecords(filters: {
  memberId?: string;
  search?: string;
  serviceName?: string;
  attendanceType?: AttendanceType;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
}) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canViewAttendance) {
    throw new Error("You do not have permission to view attendance.");
  }

  const page = filters.page ?? 1;
  const take = 25;
  return findAttendanceRecords({
    organizationId,
    memberId: filters.memberId,
    search: filters.search,
    serviceName: filters.serviceName,
    attendanceType: filters.attendanceType,
    dateFrom: parseDate(filters.dateFrom) ?? undefined,
    dateTo: parseDate(filters.dateTo) ?? undefined,
    take,
    skip: (page - 1) * take,
  });
}

export async function getAttendanceRecordById(id: string) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canViewAttendance) {
    throw new Error("You do not have permission to view attendance.");
  }
  return findAttendanceById(organizationId, id);
}

export async function getMemberAttendanceSummary(memberId: string) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canViewAttendance) {
    throw new Error("You do not have permission to view attendance.");
  }
  return getMemberAttendanceStats(organizationId, memberId);
}

export async function createAttendanceRecord(input: AttendanceInput, actor: Actor) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canManageAttendance) {
    throw new Error("You do not have permission to manage attendance.");
  }

  const record = await createAttendance({
    organizationId,
    memberId: input.memberId,
    attendanceDate: parseDate(input.attendanceDate)!,
    serviceName: input.serviceName,
    attendanceType: input.attendanceType as AttendanceType,
    checkInTime: parseDateTime(input.attendanceDate, input.checkInTime),
    checkOutTime: parseDateTime(input.attendanceDate, input.checkOutTime),
    checkedInByUserId: actor.userAccountId,
    notes: input.notes ?? null,
  });

  await audit(
    organizationId,
    actor,
    "CREATE",
    "MemberAttendance",
    record.id,
    buildSafeAuditChanges({
      memberId: input.memberId,
      attendanceDate: input.attendanceDate,
      serviceName: input.serviceName,
      attendanceType: input.attendanceType,
    }),
  );

  return record;
}

export async function updateAttendanceRecord(
  id: string,
  input: AttendanceInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canManageAttendance) {
    throw new Error("You do not have permission to manage attendance.");
  }

  const saved = await updateAttendance(id, organizationId, {
    memberId: input.memberId,
    attendanceDate: parseDate(input.attendanceDate)!,
    serviceName: input.serviceName,
    attendanceType: input.attendanceType as AttendanceType,
    checkInTime: parseDateTime(input.attendanceDate, input.checkInTime),
    checkOutTime: parseDateTime(input.attendanceDate, input.checkOutTime),
    notes: input.notes ?? null,
  });

  await audit(
    organizationId,
    actor,
    "UPDATE",
    "MemberAttendance",
    id,
    buildSafeAuditChanges({
      memberId: input.memberId,
      attendanceDate: input.attendanceDate,
      serviceName: input.serviceName,
      attendanceType: input.attendanceType,
    }),
  );

  return saved;
}

export async function deleteAttendanceRecord(id: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canManageAttendance || (!access.canDelete && !access.canManageAttendance)) {
    throw new Error("You do not have permission to delete attendance.");
  }
  // Staff can delete attendance they manage; volunteers cannot (canDelete false and REPORT_VIEWER has manage but patch says volunteers cannot delete)
  if (access.roleCode === "REPORT_VIEWER") {
    throw new Error("You do not have permission to delete attendance.");
  }

  await deleteAttendance(id, organizationId);
  await audit(organizationId, actor, "DELETE", "MemberAttendance", id, [
    { field: "id", oldValue: id, newValue: null },
  ]);
}

export async function getFollowUps(filters: {
  memberId?: string;
  status?: FollowUpStatus;
  priority?: FollowUpPriority;
  followUpType?: FollowUpType;
  assignedToUserId?: string;
  page?: number;
}) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canViewFollowUps) {
    throw new Error("You do not have permission to view follow-ups.");
  }

  const page = filters.page ?? 1;
  return findFollowUps({
    organizationId,
    ...filters,
    take: 25,
    skip: (page - 1) * 25,
  });
}

export async function getFollowUpById(id: string) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canViewFollowUps) {
    throw new Error("You do not have permission to view follow-ups.");
  }
  return findFollowUpById(organizationId, id);
}

export async function getFollowUpDashboardCounts() {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canViewFollowUps) {
    throw new Error("You do not have permission to view follow-ups.");
  }
  return countFollowUpsByStatus(organizationId);
}

export async function createFollowUpRecord(input: FollowUpInput, actor: Actor) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canManageFollowUps) {
    throw new Error("You do not have permission to manage follow-ups.");
  }

  const record = await createFollowUp({
    organizationId,
    memberId: input.memberId,
    followUpType: input.followUpType as FollowUpType,
    status: (input.status as FollowUpStatus) ?? "OPEN",
    priority: (input.priority as FollowUpPriority) ?? "NORMAL",
    assignedToUserId: input.assignedToUserId ?? null,
    dueDate: parseDate(input.dueDate),
    subject: input.subject,
    notes: input.notes ?? null,
    outcome: input.outcome ?? null,
    createdByUserId: requireUserId(actor),
  });

  await audit(
    organizationId,
    actor,
    "CREATE",
    "MemberFollowUp",
    record.id,
    buildSafeAuditChanges({
      memberId: input.memberId,
      followUpType: input.followUpType,
      status: input.status,
      priority: input.priority,
      subject: input.subject,
    }),
  );

  return record;
}

export async function updateFollowUpRecord(
  id: string,
  input: FollowUpInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canManageFollowUps) {
    throw new Error("You do not have permission to manage follow-ups.");
  }

  const saved = await updateFollowUp(id, organizationId, {
    memberId: input.memberId,
    followUpType: input.followUpType as FollowUpType,
    status: input.status as FollowUpStatus,
    priority: input.priority as FollowUpPriority,
    assignedToUserId: input.assignedToUserId ?? null,
    dueDate: parseDate(input.dueDate),
    subject: input.subject,
    notes: input.notes ?? null,
    outcome: input.outcome ?? null,
  });

  await audit(
    organizationId,
    actor,
    "UPDATE",
    "MemberFollowUp",
    id,
    buildSafeAuditChanges({
      status: input.status,
      priority: input.priority,
      subject: input.subject,
    }),
  );

  return saved;
}

export async function markFollowUpInProgress(id: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canManageFollowUps) {
    throw new Error("You do not have permission to manage follow-ups.");
  }
  const saved = await updateFollowUp(id, organizationId, { status: "IN_PROGRESS" });
  await audit(organizationId, actor, "STATUS_CHANGE", "MemberFollowUp", id, [
    { field: "status", oldValue: null, newValue: "IN_PROGRESS" },
  ]);
  return saved;
}

export async function markFollowUpComplete(
  id: string,
  actor: Actor,
  outcome?: string,
) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canManageFollowUps) {
    throw new Error("You do not have permission to manage follow-ups.");
  }
  const saved = await updateFollowUp(id, organizationId, {
    status: "COMPLETED",
    completedAt: new Date(),
    ...(outcome ? { outcome } : {}),
  });
  await audit(organizationId, actor, "STATUS_CHANGE", "MemberFollowUp", id, [
    { field: "status", oldValue: null, newValue: "COMPLETED" },
  ]);
  return saved;
}

export async function reopenFollowUp(id: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canManageFollowUps) {
    throw new Error("You do not have permission to manage follow-ups.");
  }
  const saved = await updateFollowUp(id, organizationId, {
    status: "OPEN",
    completedAt: null,
  });
  await audit(organizationId, actor, "STATUS_CHANGE", "MemberFollowUp", id, [
    { field: "status", oldValue: null, newValue: "OPEN" },
  ]);
  return saved;
}

export async function deleteFollowUpRecord(id: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canDelete) {
    throw new Error("You do not have permission to delete follow-ups.");
  }
  await deleteFollowUp(id, organizationId);
  await audit(organizationId, actor, "DELETE", "MemberFollowUp", id, [
    { field: "id", oldValue: id, newValue: null },
  ]);
}

export async function getPastoralCareNotes(filters: {
  memberId?: string;
  page?: number;
}) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canViewPastoralCare) {
    throw new Error("You do not have permission to view pastoral care.");
  }

  const page = filters.page ?? 1;
  const result = await findPastoralCareNotes({
    organizationId,
    memberId: filters.memberId,
    includeConfidential: access.canViewConfidentialPastoralCare,
    take: 25,
    skip: (page - 1) * 25,
  });

  return {
    total: result.total,
    records: result.records.map((note) => {
      const sanitized = sanitizePastoralNoteForAccess(note, access);
      return { ...note, note: sanitized.note, restricted: sanitized.restricted };
    }),
  };
}

export async function getPastoralCareNoteById(id: string) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canViewPastoralCare) {
    throw new Error("You do not have permission to view pastoral care.");
  }

  const note = await findPastoralCareNoteById(organizationId, id);
  if (!note) return null;
  if (note.isConfidential && !access.canViewConfidentialPastoralCare) {
    throw new Error("You do not have permission to view this confidential note.");
  }
  return note;
}

export async function createPastoralCareNoteRecord(
  input: PastoralCareInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canManagePastoralCare) {
    throw new Error("You do not have permission to manage pastoral care.");
  }
  if (input.isConfidential && !access.canViewConfidentialPastoralCare) {
    throw new Error("You do not have permission to create confidential notes.");
  }

  const record = await createPastoralCareNote({
    organizationId,
    memberId: input.memberId,
    category: input.category as never,
    title: input.title,
    note: input.note,
    isConfidential: input.isConfidential ?? false,
    assignedPastorUserId: input.assignedPastorUserId ?? null,
    followUpDate: parseDate(input.followUpDate),
    createdByUserId: requireUserId(actor),
  });

  await audit(
    organizationId,
    actor,
    "CREATE",
    "PastoralCareNote",
    record.id,
    buildSafeAuditChanges({
      memberId: input.memberId,
      category: input.category,
      isConfidential: String(input.isConfidential ?? false),
      title: input.isConfidential ? "[confidential]" : input.title,
    }),
  );

  return record;
}

export async function updatePastoralCareNoteRecord(
  id: string,
  input: PastoralCareInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canManagePastoralCare) {
    throw new Error("You do not have permission to manage pastoral care.");
  }

  const existing = await findPastoralCareNoteById(organizationId, id);
  if (!existing) throw new Error("Pastoral care note not found.");
  if (existing.isConfidential && !access.canViewConfidentialPastoralCare) {
    throw new Error("You do not have permission to edit this confidential note.");
  }

  const saved = await updatePastoralCareNote(id, organizationId, {
    memberId: input.memberId,
    category: input.category as never,
    title: input.title,
    note: input.note,
    isConfidential: input.isConfidential ?? false,
    assignedPastorUserId: input.assignedPastorUserId ?? null,
    followUpDate: parseDate(input.followUpDate),
  });

  await audit(
    organizationId,
    actor,
    "UPDATE",
    "PastoralCareNote",
    id,
    buildSafeAuditChanges({
      category: input.category,
      isConfidential: String(input.isConfidential ?? false),
    }),
  );

  return saved;
}

export async function resolvePastoralCareNote(id: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canManagePastoralCare) {
    throw new Error("You do not have permission to manage pastoral care.");
  }
  const saved = await updatePastoralCareNote(id, organizationId, {
    resolvedAt: new Date(),
  });
  await audit(organizationId, actor, "RESOLVE", "PastoralCareNote", id, [
    { field: "resolvedAt", oldValue: null, newValue: new Date().toISOString() },
  ]);
  return saved;
}

export async function reopenPastoralCareNote(id: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canManagePastoralCare) {
    throw new Error("You do not have permission to manage pastoral care.");
  }
  const saved = await updatePastoralCareNote(id, organizationId, {
    resolvedAt: null,
  });
  await audit(organizationId, actor, "REOPEN", "PastoralCareNote", id, [
    { field: "resolvedAt", oldValue: "set", newValue: null },
  ]);
  return saved;
}

export async function deletePastoralCareNoteRecord(id: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canDelete) {
    throw new Error("You do not have permission to delete pastoral care notes.");
  }
  await deletePastoralCareNote(id, organizationId);
  await audit(organizationId, actor, "DELETE", "PastoralCareNote", id, [
    { field: "id", oldValue: id, newValue: null },
  ]);
}

export async function getPrayerRequests(filters: {
  memberId?: string;
  status?: PrayerRequestStatus;
  privacyLevel?: PrayerPrivacyLevel;
  assignedToUserId?: string;
  page?: number;
}) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canViewPrayerRequests) {
    throw new Error("You do not have permission to view prayer requests.");
  }

  const page = filters.page ?? 1;
  return findPrayerRequests({
    organizationId,
    memberId: filters.memberId,
    status: filters.status,
    privacyLevel: filters.privacyLevel,
    assignedToUserId: filters.assignedToUserId,
    allowedPrivacyLevels: allowedPrayerLevels(access),
    take: 25,
    skip: (page - 1) * 25,
  });
}

export async function getPrayerRequestById(id: string) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canViewPrayerRequests) {
    throw new Error("You do not have permission to view prayer requests.");
  }

  const request = await findPrayerRequestById(organizationId, id);
  if (!request) return null;
  if (
    !canViewPrayerPrivacy(access, request.privacyLevel, request.createdByUserId)
  ) {
    throw new Error("You do not have permission to view this prayer request.");
  }
  return request;
}

export async function createPrayerRequestRecord(
  input: PrayerRequestInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canManagePrayerRequests) {
    throw new Error("You do not have permission to manage prayer requests.");
  }

  const record = await createPrayerRequest({
    organizationId,
    memberId: input.memberId ?? null,
    requesterName: input.requesterName ?? null,
    request: input.request,
    status: (input.status as PrayerRequestStatus) ?? "ACTIVE",
    privacyLevel: (input.privacyLevel as PrayerPrivacyLevel) ?? "PRAYER_TEAM",
    assignedToUserId: input.assignedToUserId ?? null,
    createdByUserId: requireUserId(actor),
  });

  await audit(
    organizationId,
    actor,
    "CREATE",
    "PrayerRequest",
    record.id,
    buildSafeAuditChanges({
      privacyLevel: input.privacyLevel,
      status: input.status,
      memberId: input.memberId ?? null,
    }),
  );

  return record;
}

export async function updatePrayerRequestRecord(
  id: string,
  input: PrayerRequestInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canManagePrayerRequests) {
    throw new Error("You do not have permission to manage prayer requests.");
  }

  const saved = await updatePrayerRequest(id, organizationId, {
    memberId: input.memberId ?? null,
    requesterName: input.requesterName ?? null,
    request: input.request,
    status: input.status as PrayerRequestStatus,
    privacyLevel: input.privacyLevel as PrayerPrivacyLevel,
    assignedToUserId: input.assignedToUserId ?? null,
    answerNotes: input.answerNotes ?? null,
  });

  await audit(
    organizationId,
    actor,
    "UPDATE",
    "PrayerRequest",
    id,
    buildSafeAuditChanges({
      privacyLevel: input.privacyLevel,
      status: input.status,
    }),
  );

  return saved;
}

export async function markPrayerRequestInPrayer(id: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canManagePrayerRequests) {
    throw new Error("You do not have permission to manage prayer requests.");
  }
  const saved = await updatePrayerRequest(id, organizationId, {
    status: "IN_PRAYER",
  });
  await audit(organizationId, actor, "STATUS_CHANGE", "PrayerRequest", id, [
    { field: "status", oldValue: null, newValue: "IN_PRAYER" },
  ]);
  return saved;
}

export async function markPrayerRequestAnswered(
  id: string,
  actor: Actor,
  answerNotes?: string,
) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canManagePrayerRequests) {
    throw new Error("You do not have permission to manage prayer requests.");
  }
  const saved = await updatePrayerRequest(id, organizationId, {
    status: "ANSWERED",
    answeredAt: new Date(),
    ...(answerNotes ? { answerNotes } : {}),
  });
  await audit(organizationId, actor, "ANSWER", "PrayerRequest", id, [
    { field: "status", oldValue: null, newValue: "ANSWERED" },
  ]);
  return saved;
}

export async function archivePrayerRequest(id: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canManagePrayerRequests) {
    throw new Error("You do not have permission to manage prayer requests.");
  }
  const saved = await updatePrayerRequest(id, organizationId, {
    status: "ARCHIVED",
  });
  await audit(organizationId, actor, "ARCHIVE", "PrayerRequest", id, [
    { field: "status", oldValue: null, newValue: "ARCHIVED" },
  ]);
  return saved;
}

export async function setPrayerRequestPublicVisibilityRecord(
  id: string,
  isPublic: boolean,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canManagePrayerRequests) {
    throw new Error("You do not have permission to manage prayer requests.");
  }
  await setPrayerRequestPublicVisibility(id, organizationId, isPublic);
  await audit(organizationId, actor, "UPDATE", "PrayerRequest", id, [
    { field: "isPublic", oldValue: null, newValue: String(isPublic) },
  ]);
}

export async function deletePrayerRequestRecord(id: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canDelete) {
    throw new Error("You do not have permission to delete prayer requests.");
  }
  await deletePrayerRequest(id, organizationId);
  await audit(organizationId, actor, "DELETE", "PrayerRequest", id, [
    { field: "id", oldValue: id, newValue: null },
  ]);
}

export async function getMemberCommunications(filters: {
  memberId?: string;
  page?: number;
}) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canViewCommunications) {
    throw new Error("You do not have permission to view communications.");
  }
  const page = filters.page ?? 1;
  return findCommunications({
    organizationId,
    memberId: filters.memberId,
    take: 25,
    skip: (page - 1) * 25,
  });
}

export async function getMemberCommunicationById(id: string) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canViewCommunications) {
    throw new Error("You do not have permission to view communications.");
  }
  return findCommunicationById(organizationId, id);
}

export async function createMemberCommunicationRecord(
  input: CommunicationInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canManageCommunications) {
    throw new Error("You do not have permission to manage communications.");
  }

  const record = await createCommunication({
    organizationId,
    memberId: input.memberId,
    communicationType: input.communicationType as never,
    direction: input.direction as never,
    subject: input.subject ?? null,
    messageSummary: input.messageSummary,
    communicationDate: new Date(input.communicationDate),
    contactedByUserId: requireUserId(actor),
    outcome: input.outcome ?? null,
    followUpRequired: input.followUpRequired ?? false,
    followUpDate: parseDate(input.followUpDate),
  });

  await audit(
    organizationId,
    actor,
    "CREATE",
    "MemberCommunication",
    record.id,
    buildSafeAuditChanges({
      memberId: input.memberId,
      communicationType: input.communicationType,
      direction: input.direction,
    }),
  );

  return record;
}

export async function updateMemberCommunicationRecord(
  id: string,
  input: CommunicationInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canManageCommunications) {
    throw new Error("You do not have permission to manage communications.");
  }

  const saved = await updateCommunication(id, organizationId, {
    memberId: input.memberId,
    communicationType: input.communicationType as never,
    direction: input.direction as never,
    subject: input.subject ?? null,
    messageSummary: input.messageSummary,
    communicationDate: new Date(input.communicationDate),
    outcome: input.outcome ?? null,
    followUpRequired: input.followUpRequired ?? false,
    followUpDate: parseDate(input.followUpDate),
  });

  await audit(
    organizationId,
    actor,
    "UPDATE",
    "MemberCommunication",
    id,
    buildSafeAuditChanges({
      communicationType: input.communicationType,
      direction: input.direction,
    }),
  );

  return saved;
}

export async function deleteMemberCommunicationRecord(id: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canDelete) {
    throw new Error("You do not have permission to delete communications.");
  }
  await deleteCommunication(id, organizationId);
  await audit(organizationId, actor, "DELETE", "MemberCommunication", id, [
    { field: "id", oldValue: id, newValue: null },
  ]);
}

export async function createFollowUpFromCommunication(
  communicationId: string,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  if (!access.canManageFollowUps || !access.canViewCommunications) {
    throw new Error("You do not have permission to create follow-ups.");
  }

  const communication = await findCommunicationById(
    organizationId,
    communicationId,
  );
  if (!communication) throw new Error("Communication not found.");

  const followUp = await createFollowUp({
    organizationId,
    memberId: communication.memberId,
    followUpType: "GENERAL",
    status: "OPEN",
    priority: "NORMAL",
    assignedToUserId: actor.userAccountId,
    dueDate: communication.followUpDate,
    subject: `Follow-up from ${communication.communicationType} communication`,
    notes: communication.messageSummary,
    createdByUserId: requireUserId(actor),
  });

  await audit(
    organizationId,
    actor,
    "CREATE_FROM_COMMUNICATION",
    "MemberFollowUp",
    followUp.id,
    buildSafeAuditChanges({
      communicationId,
      memberId: communication.memberId,
    }),
  );

  return followUp;
}

export async function getStaffUserOptions() {
  const organizationId = await getOrganizationId();
  return findStaffUsers(organizationId);
}

export async function getCareDashboardWidgets() {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  const counts = await getDashboardCareCounts(organizationId);

  return {
    access,
    widgets: [
      access.canViewAttendance
        ? {
            key: "attendanceThisWeek",
            label: "Attendance This Week",
            count: counts.attendanceThisWeek,
            href: "/attendance",
          }
        : null,
      access.canViewFollowUps
        ? {
            key: "firstTimeVisitors",
            label: "First-Time Visitors",
            count: counts.firstTimeVisitors,
            href: "/members?status=VISITOR",
          }
        : null,
      access.canViewFollowUps
        ? {
            key: "openFollowUps",
            label: "Open Follow-Ups",
            count: counts.openFollowUps,
            href: "/follow-ups?status=OPEN",
          }
        : null,
      access.canViewFollowUps
        ? {
            key: "overdueFollowUps",
            label: "Overdue Follow-Ups",
            count: counts.overdueFollowUps,
            href: "/follow-ups?status=OVERDUE",
          }
        : null,
      access.canViewPrayerRequests
        ? {
            key: "activePrayerRequests",
            label: "Active Prayer Requests",
            count: counts.activePrayerRequests,
            href: "/prayer-requests?status=ACTIVE",
          }
        : null,
      access.canViewPastoralCare
        ? {
            key: "pastoralCareFollowUpsDue",
            label: "Pastoral Care Follow-Ups Due",
            count: counts.pastoralCareFollowUpsDue,
            href: "/pastoral-care",
          }
        : null,
    ].filter(Boolean),
  };
}

export type { TimelineFilter };

export async function getMemberActivityTimeline(
  memberId: string,
  filter: TimelineFilter = "all",
  options?: { page?: number; pageSize?: number },
) {
  const organizationId = await getOrganizationId();
  const access = await getCareAccess(organizationId);
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options?.pageSize ?? 20));

  const items: Array<{
    id: string;
    category: TimelineFilter;
    title: string;
    description: string;
    actor: string;
    occurredAt: Date;
    href?: string;
  }> = [];

  if (filter === "all" || filter === "profile") {
    const audits = await findEntityAuditEvents(organizationId, "Member", memberId, 50);
    for (const event of audits) {
      items.push({
        id: `audit-${event.id}`,
        category: "profile",
        title: `Member ${event.action.toLowerCase()}`,
        description: "Profile or membership change",
        actor:
          event.actor?.displayName ?? event.actor?.primaryEmail ?? "System",
        occurredAt: event.occurredAt,
        href: `/member/${memberId}`,
      });
    }
  }

  if ((filter === "all" || filter === "attendance") && access.canViewAttendance) {
    const { records } = await findAttendanceRecords({
      organizationId,
      memberId,
      take: 50,
    });
    for (const record of records) {
      items.push({
        id: `attendance-${record.id}`,
        category: "attendance",
        title: `Attendance: ${record.serviceName}`,
        description: `${record.attendanceType} on ${record.attendanceDate.toISOString().slice(0, 10)}`,
        actor: record.checkedInBy?.displayName ?? "Staff",
        occurredAt: record.createdAt,
        href: `/attendance/${record.id}/edit`,
      });
    }
  }

  if ((filter === "all" || filter === "follow-ups") && access.canViewFollowUps) {
    const { records } = await findFollowUps({ organizationId, memberId, take: 50 });
    for (const record of records) {
      items.push({
        id: `followup-${record.id}`,
        category: "follow-ups",
        title: record.subject,
        description: `${record.followUpType} · ${record.status}`,
        actor:
          record.createdBy?.displayName ??
          record.createdBy?.primaryEmail ??
          "Public guest submission",
        occurredAt: record.createdAt,
        href: `/follow-ups/${record.id}`,
      });
    }
  }

  if (
    (filter === "all" || filter === "pastoral-care") &&
    access.canViewPastoralCare
  ) {
    const { records } = await findPastoralCareNotes({
      organizationId,
      memberId,
      // Load confidential notes so we can show opaque restricted placeholders.
      includeConfidential: true,
      take: 50,
    });
    let restrictedOrdinal = 0;
    for (const record of records) {
      const sanitized = sanitizePastoralNoteForAccess(record, access);
      const restricted = Boolean(sanitized.restricted);
      items.push({
        // Opaque id — do not leak real UUID when the note is restricted.
        id: restricted
          ? `pastoral-restricted-${restrictedOrdinal++}`
          : `pastoral-${record.id}`,
        category: "pastoral-care",
        title: restricted ? "Confidential pastoral care" : record.title,
        description: restricted
          ? "Confidential pastoral care note"
          : `${record.category} · ${record.note.slice(0, 80)}`,
        actor: restricted
          ? "Restricted"
          : (record.createdBy?.displayName ??
            record.createdBy?.primaryEmail ??
            "Public guest submission"),
        occurredAt: record.createdAt,
        href: restricted ? undefined : `/pastoral-care/${record.id}`,
      });
    }
  }

  if ((filter === "all" || filter === "prayer") && access.canViewPrayerRequests) {
    const { records } = await findPrayerRequests({
      organizationId,
      memberId,
      allowedPrivacyLevels: allowedPrayerLevels(access),
      take: 50,
    });
    for (const record of records) {
      const isPrivate = record.privacyLevel === "PRIVATE";
      items.push({
        id: `prayer-${record.id}`,
        category: "prayer",
        title: "Prayer request",
        description: isPrivate && !access.canViewPrivatePrayer
          ? "Private prayer request"
          : `${record.status} · ${record.request.slice(0, 80)}`,
        actor:
          record.createdBy?.displayName ??
          record.createdBy?.primaryEmail ??
          "Public guest submission",
        occurredAt: record.createdAt,
        href: `/prayer-requests/${record.id}`,
      });
    }
  }

  if (
    (filter === "all" || filter === "communications") &&
    access.canViewCommunications
  ) {
    const { records } = await findCommunications({
      organizationId,
      memberId,
      take: 50,
    });
    for (const record of records) {
      items.push({
        id: `comm-${record.id}`,
        category: "communications",
        title: `${record.communicationType} (${record.direction})`,
        description: record.messageSummary.slice(0, 100),
        actor: record.contactedBy.displayName ?? record.contactedBy.primaryEmail,
        occurredAt: record.communicationDate,
      });
    }
  }

  const sorted = items.sort(
    (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
  );
  const total = sorted.length;
  const start = (page - 1) * pageSize;

  return {
    items: sorted.slice(start, start + pageSize),
    total,
    page,
    pageSize,
  };
}

export { getCareAccess };
