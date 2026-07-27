import type {
  GiftProficiencyLevel,
  MemberDocumentType,
  MemberMinistryRole,
  MemberMinistryStatus,
  MembershipMilestoneType,
  MinistryType,
  SkillProficiencyLevel,
} from "@/app/generated/prisma/client";
import {
  getMemberEngagementAccess,
  requireEngagementPermission,
  sanitizeDocumentForAccess,
  type MemberEngagementAccess,
} from "@/lib/auth/member-engagement-permissions";
import {
  removeMemberDocumentFile,
  resolveExistingLocalDocumentAbsolutePath,
  saveMemberDocumentFile,
} from "@/lib/storage/member-document";
import {
  type MemberDocumentMetadataInput,
  type MemberInterestInput,
  type MemberMilestoneInput,
  type MemberMinistryInput,
  type MemberSkillInput,
  type MemberSpiritualGiftInput,
  type MinistryInput,
  type SpiritualGiftInput,
  buildSafeAuditChanges,
} from "@/lib/validation/member-engagement";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import {
  countActiveMinistryMembers,
  createMemberDocument,
  createMemberInterest,
  createMemberMilestone,
  createMemberMinistry,
  createMemberSkill,
  createMemberSpiritualGift,
  createMinistry,
  createSpiritualGift,
  deactivateMinistry,
  deleteMemberDocument,
  deleteMemberInterest,
  deleteMemberMilestone,
  deleteMemberMinistry,
  deleteMemberSkill,
  deleteMemberSpiritualGift,
  deleteMinistry,
  deleteSpiritualGift,
  findMemberDocumentById,
  findMemberDocuments,
  findMemberEngagementProfile,
  findMemberInOrganization,
  findMemberInterests,
  findMemberMilestoneById,
  findMemberMilestones,
  findMemberMinistries,
  findMemberMinistryById,
  findMemberSkills,
  findMemberSpiritualGiftById,
  findMemberSpiritualGifts,
  findMinistries,
  findMinistryById,
  findAllSpiritualGiftAssignments,
  findSpiritualGiftById,
  findSpiritualGifts,
  getEngagementDashboardCounts,
  searchMembersBySkill,
  setMemberAsMinistryLeader,
  setPrimaryMemberSpiritualGift,
  setSpiritualGiftActive,
  syncMemberDateFromMilestone,
  updateMemberDocument,
  updateMemberInterest,
  updateMemberMilestone,
  updateMemberMilestoneDocument,
  updateMemberMinistry,
  updateMemberSkill,
  updateMemberSpiritualGift,
  updateMinistry,
  updateSpiritualGift,
} from "@/server/repositories/member-engagement.repository";
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

function requireUserId(actor: Actor) {
  if (!actor.userAccountId) {
    throw new Error("A signed-in user account is required.");
  }
  return actor.userAccountId;
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

async function assertMemberInOrg(organizationId: string, memberId: string) {
  const member = await findMemberInOrganization(organizationId, memberId);
  if (!member) throw new Error("Member not found.");
  return member;
}

function milestoneDateField(
  type: MembershipMilestoneType,
): "salvationDate" | "baptismDate" | "memberSince" | null {
  if (type === "SALVATION") return "salvationDate";
  if (type === "BAPTISM") return "baptismDate";
  if (type === "MEMBERSHIP") return "memberSince";
  return null;
}

async function maybeSyncMemberDates(
  organizationId: string,
  memberId: string,
  milestoneType: MembershipMilestoneType,
  milestoneDate: Date,
  syncMemberDates: boolean | undefined,
) {
  const field = milestoneDateField(milestoneType);
  if (!field) return;

  await syncMemberDateFromMilestone(
    memberId,
    organizationId,
    field,
    milestoneDate,
    Boolean(syncMemberDates),
  );
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export async function getMemberMilestones(memberId: string) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canViewMilestones,
    "You do not have permission to view milestones.",
  );
  await assertMemberInOrg(organizationId, memberId);
  return findMemberMilestones(organizationId, memberId);
}

export async function getMemberMilestoneById(id: string) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canViewMilestones,
    "You do not have permission to view milestones.",
  );
  return findMemberMilestoneById(organizationId, id);
}

export async function createMemberMilestoneRecord(
  input: MemberMilestoneInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canManageMilestones,
    "You do not have permission to manage milestones.",
  );
  await assertMemberInOrg(organizationId, input.memberId);

  const milestoneDate = parseDate(input.milestoneDate)!;
  const record = await createMemberMilestone({
    organizationId,
    memberId: input.memberId,
    milestoneType: input.milestoneType as MembershipMilestoneType,
    title: input.title,
    milestoneDate,
    location: input.location ?? null,
    officiant: input.officiant ?? null,
    certificateNumber: input.certificateNumber ?? null,
    notes: input.notes ?? null,
    createdByUserId: requireUserId(actor),
  });

  await maybeSyncMemberDates(
    organizationId,
    input.memberId,
    input.milestoneType as MembershipMilestoneType,
    milestoneDate,
    input.syncMemberDates,
  );

  await audit(
    organizationId,
    actor,
    "CREATE",
    "MemberMilestone",
    record.id,
    buildSafeAuditChanges({
      memberId: input.memberId,
      milestoneType: input.milestoneType,
      title: input.title,
      milestoneDate: input.milestoneDate,
    }),
  );

  return record;
}

export async function updateMemberMilestoneRecord(
  id: string,
  input: MemberMilestoneInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canManageMilestones,
    "You do not have permission to manage milestones.",
  );

  const milestoneDate = parseDate(input.milestoneDate)!;
  const saved = await updateMemberMilestone(id, organizationId, {
    milestoneType: input.milestoneType as MembershipMilestoneType,
    title: input.title,
    milestoneDate,
    location: input.location ?? null,
    officiant: input.officiant ?? null,
    certificateNumber: input.certificateNumber ?? null,
    notes: input.notes ?? null,
  });

  await maybeSyncMemberDates(
    organizationId,
    input.memberId,
    input.milestoneType as MembershipMilestoneType,
    milestoneDate,
    input.syncMemberDates,
  );

  await audit(
    organizationId,
    actor,
    "UPDATE",
    "MemberMilestone",
    id,
    buildSafeAuditChanges({
      memberId: input.memberId,
      milestoneType: input.milestoneType,
      title: input.title,
      milestoneDate: input.milestoneDate,
    }),
  );

  return saved;
}

export async function deleteMemberMilestoneRecord(id: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canManageMilestones,
    "You do not have permission to manage milestones.",
  );

  const existing = await findMemberMilestoneById(organizationId, id);
  if (!existing) throw new Error("Milestone not found.");

  if (existing.documentKey) {
    await removeMemberDocumentFile(existing.documentKey);
  }

  await deleteMemberMilestone(id, organizationId);
  await audit(
    organizationId,
    actor,
    "DELETE",
    "MemberMilestone",
    id,
    buildSafeAuditChanges({
      memberId: existing.memberId,
      milestoneType: existing.milestoneType,
      title: existing.title,
    }),
  );
}

export async function uploadMilestoneDocument(
  id: string,
  file: File,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canManageMilestones,
    "You do not have permission to manage milestones.",
  );

  const existing = await findMemberMilestoneById(organizationId, id);
  if (!existing) throw new Error("Milestone not found.");

  if (existing.documentKey) {
    await removeMemberDocumentFile(existing.documentKey);
  }

  const stored = await saveMemberDocumentFile(
    organizationId,
    existing.memberId,
    file,
  );

  const saved = await updateMemberMilestoneDocument(id, organizationId, {
    documentUrl: stored.publicUrl,
    documentKey: stored.storageKey,
  });

  await audit(
    organizationId,
    actor,
    "UPDATE",
    "MemberMilestone",
    id,
    buildSafeAuditChanges({
      documentAttached: true,
      fileName: stored.fileName,
      fileSize: stored.fileSize,
    }),
  );

  return saved;
}

export async function removeMilestoneDocument(id: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canManageMilestones,
    "You do not have permission to manage milestones.",
  );

  const existing = await findMemberMilestoneById(organizationId, id);
  if (!existing) throw new Error("Milestone not found.");

  if (existing.documentKey) {
    await removeMemberDocumentFile(existing.documentKey);
  }

  const saved = await updateMemberMilestoneDocument(id, organizationId, {
    documentUrl: null,
    documentKey: null,
  });

  await audit(
    organizationId,
    actor,
    "UPDATE",
    "MemberMilestone",
    id,
    buildSafeAuditChanges({ documentRemoved: true }),
  );

  return saved;
}

// ---------------------------------------------------------------------------
// Spiritual gifts
// ---------------------------------------------------------------------------

export async function getSpiritualGifts(options?: { activeOnly?: boolean }) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canViewSpiritualGifts || a.canManageSpiritualGiftCatalog,
    "You do not have permission to view spiritual gifts.",
  );
  return findSpiritualGifts(organizationId, options);
}

export async function createSpiritualGiftRecord(
  input: SpiritualGiftInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canManageSpiritualGiftCatalog,
    "You do not have permission to manage the spiritual gift catalog.",
  );

  const record = await createSpiritualGift({
    organizationId,
    name: input.name,
    description: input.description ?? null,
    category: input.category ?? null,
    isActive: input.isActive ?? true,
  });

  await audit(
    organizationId,
    actor,
    "CREATE",
    "SpiritualGift",
    record.id,
    buildSafeAuditChanges({
      name: input.name,
      category: input.category,
      isActive: input.isActive ?? true,
    }),
  );

  return record;
}

export async function updateSpiritualGiftRecord(
  id: string,
  input: SpiritualGiftInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canManageSpiritualGiftCatalog,
    "You do not have permission to manage the spiritual gift catalog.",
  );

  const saved = await updateSpiritualGift(id, organizationId, {
    name: input.name,
    description: input.description ?? null,
    category: input.category ?? null,
    isActive: input.isActive ?? true,
  });

  await audit(
    organizationId,
    actor,
    "UPDATE",
    "SpiritualGift",
    id,
    buildSafeAuditChanges({
      name: input.name,
      category: input.category,
      isActive: input.isActive ?? true,
    }),
  );

  return saved;
}

export async function deleteSpiritualGiftRecord(id: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canManageSpiritualGiftCatalog && a.canDeleteCatalog,
    "You do not have permission to delete spiritual gifts.",
  );

  await deleteSpiritualGift(id, organizationId);
  await audit(
    organizationId,
    actor,
    "DELETE",
    "SpiritualGift",
    id,
    buildSafeAuditChanges({ deleted: true }),
  );
}

export async function toggleSpiritualGiftActive(
  id: string,
  isActive: boolean,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canManageSpiritualGiftCatalog,
    "You do not have permission to manage the spiritual gift catalog.",
  );

  const saved = await setSpiritualGiftActive(id, organizationId, isActive);
  await audit(
    organizationId,
    actor,
    "UPDATE",
    "SpiritualGift",
    id,
    buildSafeAuditChanges({ isActive }),
  );
  return saved;
}

export async function assignSpiritualGiftToMember(
  input: MemberSpiritualGiftInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canAssignSpiritualGifts,
    "You do not have permission to assign spiritual gifts.",
  );
  await assertMemberInOrg(organizationId, input.memberId);

  const gift = await findSpiritualGiftById(
    organizationId,
    input.spiritualGiftId,
  );
  if (!gift) throw new Error("Spiritual gift not found.");

  const record = await createMemberSpiritualGift({
    memberId: input.memberId,
    spiritualGiftId: input.spiritualGiftId,
    proficiencyLevel: input.proficiencyLevel as GiftProficiencyLevel,
    isPrimary: input.isPrimary ?? false,
    notes: input.notes ?? null,
    identifiedDate: parseDate(input.identifiedDate),
  });

  await audit(
    organizationId,
    actor,
    "CREATE",
    "MemberSpiritualGift",
    record.id,
    buildSafeAuditChanges({
      memberId: input.memberId,
      spiritualGiftId: input.spiritualGiftId,
      proficiencyLevel: input.proficiencyLevel,
      isPrimary: input.isPrimary ?? false,
    }),
  );

  return record;
}

export async function updateMemberSpiritualGiftRecord(
  id: string,
  input: Omit<MemberSpiritualGiftInput, "memberId" | "spiritualGiftId"> & {
    memberId?: string;
    spiritualGiftId?: string;
  },
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canAssignSpiritualGifts,
    "You do not have permission to assign spiritual gifts.",
  );

  const existing = await findMemberSpiritualGiftById(id);
  if (!existing) throw new Error("Member spiritual gift not found.");
  await assertMemberInOrg(organizationId, existing.memberId);

  const saved = await updateMemberSpiritualGift(id, {
    proficiencyLevel: input.proficiencyLevel as GiftProficiencyLevel,
    isPrimary: input.isPrimary ?? false,
    notes: input.notes ?? null,
    identifiedDate: parseDate(input.identifiedDate),
  });

  await audit(
    organizationId,
    actor,
    "UPDATE",
    "MemberSpiritualGift",
    id,
    buildSafeAuditChanges({
      proficiencyLevel: input.proficiencyLevel,
      isPrimary: input.isPrimary ?? false,
    }),
  );

  return saved;
}

export async function removeMemberSpiritualGift(id: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canAssignSpiritualGifts,
    "You do not have permission to assign spiritual gifts.",
  );

  const existing = await deleteMemberSpiritualGift(id);
  await assertMemberInOrg(organizationId, existing.memberId);

  await audit(
    organizationId,
    actor,
    "DELETE",
    "MemberSpiritualGift",
    id,
    buildSafeAuditChanges({
      memberId: existing.memberId,
      spiritualGiftId: existing.spiritualGiftId,
    }),
  );
}

export async function setPrimaryMemberSpiritualGiftRecord(
  id: string,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canAssignSpiritualGifts,
    "You do not have permission to assign spiritual gifts.",
  );

  const existing = await findMemberSpiritualGiftById(id);
  if (!existing) throw new Error("Member spiritual gift not found.");
  await assertMemberInOrg(organizationId, existing.memberId);

  const saved = await setPrimaryMemberSpiritualGift(id, existing.memberId);
  await audit(
    organizationId,
    actor,
    "UPDATE",
    "MemberSpiritualGift",
    id,
    buildSafeAuditChanges({ isPrimary: true, memberId: existing.memberId }),
  );
  return saved;
}

// ---------------------------------------------------------------------------
// Ministries
// ---------------------------------------------------------------------------

export async function getMinistries(filters?: {
  search?: string;
  ministryType?: MinistryType;
  isActive?: boolean;
}) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canViewMinistries,
    "You do not have permission to view ministries.",
  );
  return findMinistries({ organizationId, ...filters });
}

export async function getMinistryById(id: string) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canViewMinistries,
    "You do not have permission to view ministries.",
  );
  return findMinistryById(organizationId, id);
}

export async function createMinistryRecord(input: MinistryInput, actor: Actor) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canManageMinistries,
    "You do not have permission to manage ministries.",
  );

  const record = await createMinistry({
    organizationId,
    name: input.name,
    description: input.description ?? null,
    ministryType: input.ministryType as MinistryType,
    leaderUserId: input.leaderUserId ?? null,
    isActive: input.isActive ?? true,
    meetingSchedule: input.meetingSchedule ?? null,
    location: input.location ?? null,
  });

  await audit(
    organizationId,
    actor,
    "CREATE",
    "Ministry",
    record.id,
    buildSafeAuditChanges({
      name: input.name,
      ministryType: input.ministryType,
      isActive: input.isActive ?? true,
    }),
  );

  return record;
}

export async function updateMinistryRecord(
  id: string,
  input: MinistryInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canManageMinistries,
    "You do not have permission to manage ministries.",
  );

  const saved = await updateMinistry(id, organizationId, {
    name: input.name,
    description: input.description ?? null,
    ministryType: input.ministryType as MinistryType,
    leaderUserId: input.leaderUserId ?? null,
    isActive: input.isActive ?? true,
    meetingSchedule: input.meetingSchedule ?? null,
    location: input.location ?? null,
  });

  await audit(
    organizationId,
    actor,
    "UPDATE",
    "Ministry",
    id,
    buildSafeAuditChanges({
      name: input.name,
      ministryType: input.ministryType,
      isActive: input.isActive ?? true,
    }),
  );

  return saved;
}

export async function deleteMinistryRecord(
  id: string,
  actor: Actor,
  options?: { forceArchive?: boolean; deactivate?: boolean },
) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canManageMinistries,
    "You do not have permission to manage ministries.",
  );

  const existing = await findMinistryById(organizationId, id);
  if (!existing) throw new Error("Ministry not found.");

  const activeCount = await countActiveMinistryMembers(id);
  if (activeCount > 0 && !options?.forceArchive) {
    if (options?.deactivate !== false) {
      const saved = await deactivateMinistry(id, organizationId);
      await audit(
        organizationId,
        actor,
        "UPDATE",
        "Ministry",
        id,
        buildSafeAuditChanges({
          isActive: false,
          reason: "Deactivated because active members remain",
        }),
      );
      return { action: "deactivated" as const, ministry: saved };
    }
    throw new Error(
      "Ministry has active members. Deactivate it or pass forceArchive to delete.",
    );
  }

  await deleteMinistry(id, organizationId);
  await audit(
    organizationId,
    actor,
    "DELETE",
    "Ministry",
    id,
    buildSafeAuditChanges({ name: existing.name }),
  );
  return { action: "deleted" as const, ministry: existing };
}

export async function addMemberToMinistry(
  input: MemberMinistryInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canManageMinistryRosters || a.canManageMinistries,
    "You do not have permission to manage ministry rosters.",
  );
  await assertMemberInOrg(organizationId, input.memberId);

  const ministry = await findMinistryById(organizationId, input.ministryId);
  if (!ministry) throw new Error("Ministry not found.");

  const record = await createMemberMinistry({
    memberId: input.memberId,
    ministryId: input.ministryId,
    role: input.role as MemberMinistryRole,
    status: input.status as MemberMinistryStatus,
    joinedDate: parseDate(input.joinedDate),
    endedDate: parseDate(input.endedDate),
    notes: input.notes ?? null,
    isLeader: input.isLeader ?? false,
  });

  await audit(
    organizationId,
    actor,
    "CREATE",
    "MemberMinistry",
    record.id,
    buildSafeAuditChanges({
      memberId: input.memberId,
      ministryId: input.ministryId,
      role: input.role,
      status: input.status,
    }),
  );

  return record;
}

export async function updateMemberMinistryRecord(
  id: string,
  input: Omit<MemberMinistryInput, "memberId" | "ministryId"> & {
    memberId?: string;
    ministryId?: string;
  },
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canManageMinistryRosters || a.canManageMinistries,
    "You do not have permission to manage ministry rosters.",
  );

  const existing = await findMemberMinistryById(id);
  if (!existing) throw new Error("Ministry assignment not found.");
  await assertMemberInOrg(organizationId, existing.memberId);

  const saved = await updateMemberMinistry(id, {
    role: input.role as MemberMinistryRole,
    status: input.status as MemberMinistryStatus,
    joinedDate: parseDate(input.joinedDate),
    endedDate: parseDate(input.endedDate),
    notes: input.notes ?? null,
    isLeader: input.isLeader ?? false,
  });

  await audit(
    organizationId,
    actor,
    "UPDATE",
    "MemberMinistry",
    id,
    buildSafeAuditChanges({
      role: input.role,
      status: input.status,
      isLeader: input.isLeader ?? false,
    }),
  );

  return saved;
}

export async function removeMemberFromMinistry(id: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canManageMinistryRosters || a.canManageMinistries,
    "You do not have permission to manage ministry rosters.",
  );

  const existing = await deleteMemberMinistry(id);
  await audit(
    organizationId,
    actor,
    "DELETE",
    "MemberMinistry",
    id,
    buildSafeAuditChanges({
      memberId: existing.memberId,
      ministryId: existing.ministryId,
    }),
  );
}

export async function setMemberAsMinistryLeaderRecord(
  id: string,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canManageMinistryRosters || a.canManageMinistries,
    "You do not have permission to manage ministry rosters.",
  );

  const saved = await setMemberAsMinistryLeader(id);
  await audit(
    organizationId,
    actor,
    "UPDATE",
    "MemberMinistry",
    id,
    buildSafeAuditChanges({ isLeader: true }),
  );
  return saved;
}

// ---------------------------------------------------------------------------
// Skills & interests
// ---------------------------------------------------------------------------

export async function getMemberSkills(memberId: string) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canViewSkillsInterests,
    "You do not have permission to view skills.",
  );
  await assertMemberInOrg(organizationId, memberId);
  return findMemberSkills(memberId);
}

export async function createMemberSkillRecord(
  input: MemberSkillInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canManageSkillsInterests,
    "You do not have permission to manage skills.",
  );
  await assertMemberInOrg(organizationId, input.memberId);

  const record = await createMemberSkill({
    memberId: input.memberId,
    skillName: input.skillName,
    skillCategory: input.skillCategory ?? null,
    proficiencyLevel: input.proficiencyLevel as SkillProficiencyLevel,
    yearsExperience: input.yearsExperience ?? null,
    isAvailableToServe: input.isAvailableToServe ?? false,
    notes: input.notes ?? null,
  });

  await audit(
    organizationId,
    actor,
    "CREATE",
    "MemberSkill",
    record.id,
    buildSafeAuditChanges({
      memberId: input.memberId,
      skillName: input.skillName,
      proficiencyLevel: input.proficiencyLevel,
      isAvailableToServe: input.isAvailableToServe ?? false,
    }),
  );

  return record;
}

export async function updateMemberSkillRecord(
  id: string,
  input: MemberSkillInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canManageSkillsInterests,
    "You do not have permission to manage skills.",
  );

  const saved = await updateMemberSkill(id, {
    skillName: input.skillName,
    skillCategory: input.skillCategory ?? null,
    proficiencyLevel: input.proficiencyLevel as SkillProficiencyLevel,
    yearsExperience: input.yearsExperience ?? null,
    isAvailableToServe: input.isAvailableToServe ?? false,
    notes: input.notes ?? null,
  });

  await audit(
    organizationId,
    actor,
    "UPDATE",
    "MemberSkill",
    id,
    buildSafeAuditChanges({
      skillName: input.skillName,
      proficiencyLevel: input.proficiencyLevel,
      isAvailableToServe: input.isAvailableToServe ?? false,
    }),
  );

  return saved;
}

export async function deleteMemberSkillRecord(id: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canManageSkillsInterests,
    "You do not have permission to manage skills.",
  );

  const existing = await deleteMemberSkill(id);
  await audit(
    organizationId,
    actor,
    "DELETE",
    "MemberSkill",
    id,
    buildSafeAuditChanges({
      memberId: existing.memberId,
      skillName: existing.skillName,
    }),
  );
}

export async function getMemberInterests(memberId: string) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canViewSkillsInterests,
    "You do not have permission to view interests.",
  );
  await assertMemberInOrg(organizationId, memberId);
  return findMemberInterests(memberId);
}

export async function createMemberInterestRecord(
  input: MemberInterestInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canManageSkillsInterests,
    "You do not have permission to manage interests.",
  );
  await assertMemberInOrg(organizationId, input.memberId);

  const record = await createMemberInterest({
    memberId: input.memberId,
    interestName: input.interestName,
    interestCategory: input.interestCategory ?? null,
    notes: input.notes ?? null,
  });

  await audit(
    organizationId,
    actor,
    "CREATE",
    "MemberInterest",
    record.id,
    buildSafeAuditChanges({
      memberId: input.memberId,
      interestName: input.interestName,
    }),
  );

  return record;
}

export async function updateMemberInterestRecord(
  id: string,
  input: MemberInterestInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canManageSkillsInterests,
    "You do not have permission to manage interests.",
  );

  const saved = await updateMemberInterest(id, {
    interestName: input.interestName,
    interestCategory: input.interestCategory ?? null,
    notes: input.notes ?? null,
  });

  await audit(
    organizationId,
    actor,
    "UPDATE",
    "MemberInterest",
    id,
    buildSafeAuditChanges({ interestName: input.interestName }),
  );

  return saved;
}

export async function deleteMemberInterestRecord(id: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canManageSkillsInterests,
    "You do not have permission to manage interests.",
  );

  const existing = await deleteMemberInterest(id);
  await audit(
    organizationId,
    actor,
    "DELETE",
    "MemberInterest",
    id,
    buildSafeAuditChanges({
      memberId: existing.memberId,
      interestName: existing.interestName,
    }),
  );
}

export async function searchMembersBySkillQuery(filters: {
  skillName?: string;
  skillCategory?: string;
  availableToServeOnly?: boolean;
  search?: string;
}) {
  const organizationId = await getOrganizationId();
  const access = await requireEngagementPermission(
    organizationId,
    (a) => a.canViewSkillsInterests,
    "You do not have permission to search skills.",
  );

  const results = await searchMembersBySkill({
    organizationId,
    ...filters,
  });

  if (access.canViewContactInSkillSearch) {
    return results;
  }

  return results.map((row) => ({
    ...row,
    member: {
      ...row.member,
      email: null,
      phone: null,
    },
  }));
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function getMemberDocuments(memberId: string) {
  const organizationId = await getOrganizationId();
  const access = await requireEngagementPermission(
    organizationId,
    (a) => a.canViewDocuments,
    "You do not have permission to view documents.",
  );
  await assertMemberInOrg(organizationId, memberId);

  const documents = await findMemberDocuments(organizationId, memberId, {
    includeConfidential: access.canViewConfidentialDocuments,
  });

  return documents.map((doc) => sanitizeDocumentForAccess(doc, access));
}

export async function getMemberDocumentById(id: string) {
  const organizationId = await getOrganizationId();
  const access = await requireEngagementPermission(
    organizationId,
    (a) => a.canViewDocuments,
    "You do not have permission to view documents.",
  );

  const document = await findMemberDocumentById(organizationId, id);
  if (!document) return null;

  if (document.isConfidential && !access.canViewConfidentialDocuments) {
    throw new Error("You do not have permission to view this confidential document.");
  }

  return sanitizeDocumentForAccess(document, access);
}

export async function uploadMemberDocumentRecord(
  input: MemberDocumentMetadataInput,
  file: File,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  const access = await requireEngagementPermission(
    organizationId,
    (a) => a.canManageDocuments,
    "You do not have permission to manage documents.",
  );
  await assertMemberInOrg(organizationId, input.memberId);

  if (input.isConfidential && !access.canManageConfidentialDocuments) {
    throw new Error(
      "You do not have permission to upload confidential documents.",
    );
  }

  const stored = await saveMemberDocumentFile(
    organizationId,
    input.memberId,
    file,
  );

  const record = await createMemberDocument({
    organizationId,
    memberId: input.memberId,
    documentType: input.documentType as MemberDocumentType,
    title: input.title,
    description: input.description ?? null,
    fileName: stored.fileName,
    fileUrl: stored.publicUrl,
    fileKey: stored.storageKey,
    mimeType: stored.mimeType,
    fileSize: stored.fileSize,
    isConfidential: input.isConfidential ?? false,
    expirationDate: parseDate(input.expirationDate),
    uploadedByUserId: requireUserId(actor),
  });

  await audit(
    organizationId,
    actor,
    "CREATE",
    "MemberDocument",
    record.id,
    buildSafeAuditChanges({
      memberId: input.memberId,
      documentType: input.documentType,
      title: input.title,
      fileName: stored.fileName,
      fileSize: stored.fileSize,
      isConfidential: input.isConfidential ?? false,
    }),
  );

  return record;
}

export async function updateMemberDocumentMetadata(
  id: string,
  input: MemberDocumentMetadataInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  const access = await requireEngagementPermission(
    organizationId,
    (a) => a.canManageDocuments,
    "You do not have permission to manage documents.",
  );

  const existing = await findMemberDocumentById(organizationId, id);
  if (!existing) throw new Error("Document not found.");

  if (
    (input.isConfidential || existing.isConfidential) &&
    !access.canManageConfidentialDocuments
  ) {
    throw new Error(
      "You do not have permission to manage confidential documents.",
    );
  }

  const saved = await updateMemberDocument(id, organizationId, {
    documentType: input.documentType as MemberDocumentType,
    title: input.title,
    description: input.description ?? null,
    isConfidential: input.isConfidential ?? false,
    expirationDate: parseDate(input.expirationDate),
  });

  await audit(
    organizationId,
    actor,
    "UPDATE",
    "MemberDocument",
    id,
    buildSafeAuditChanges({
      documentType: input.documentType,
      title: input.title,
      isConfidential: input.isConfidential ?? false,
    }),
  );

  return saved;
}

export async function replaceMemberDocument(
  id: string,
  file: File,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  const access = await requireEngagementPermission(
    organizationId,
    (a) => a.canManageDocuments,
    "You do not have permission to manage documents.",
  );

  const existing = await findMemberDocumentById(organizationId, id);
  if (!existing) throw new Error("Document not found.");

  if (existing.isConfidential && !access.canManageConfidentialDocuments) {
    throw new Error(
      "You do not have permission to manage confidential documents.",
    );
  }

  await removeMemberDocumentFile(existing.fileKey);
  const stored = await saveMemberDocumentFile(
    organizationId,
    existing.memberId,
    file,
  );

  const saved = await updateMemberDocument(id, organizationId, {
    fileName: stored.fileName,
    fileUrl: stored.publicUrl,
    fileKey: stored.storageKey,
    mimeType: stored.mimeType,
    fileSize: stored.fileSize,
  });

  await audit(
    organizationId,
    actor,
    "UPDATE",
    "MemberDocument",
    id,
    buildSafeAuditChanges({
      fileReplaced: true,
      fileName: stored.fileName,
      fileSize: stored.fileSize,
    }),
  );

  return saved;
}

export async function deleteMemberDocumentRecord(id: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  const access = await requireEngagementPermission(
    organizationId,
    (a) => a.canManageDocuments,
    "You do not have permission to manage documents.",
  );

  const existing = await findMemberDocumentById(organizationId, id);
  if (!existing) throw new Error("Document not found.");

  if (existing.isConfidential && !access.canManageConfidentialDocuments) {
    throw new Error(
      "You do not have permission to manage confidential documents.",
    );
  }

  await removeMemberDocumentFile(existing.fileKey);
  await deleteMemberDocument(id, organizationId);

  await audit(
    organizationId,
    actor,
    "DELETE",
    "MemberDocument",
    id,
    buildSafeAuditChanges({
      memberId: existing.memberId,
      title: existing.title,
      documentType: existing.documentType,
      isConfidential: existing.isConfidential,
    }),
  );
}

export async function getProtectedMemberDocumentDownload(
  id: string,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  const access = await requireEngagementPermission(
    organizationId,
    (a) => a.canViewDocuments,
    "You do not have permission to view documents.",
  );

  const document = await findMemberDocumentById(organizationId, id);
  if (!document) throw new Error("Document not found.");

  if (document.isConfidential && !access.canViewConfidentialDocuments) {
    throw new Error(
      "You do not have permission to download this confidential document.",
    );
  }

  if (document.isConfidential) {
    await audit(
      organizationId,
      actor,
      "VIEW",
      "MemberDocument",
      id,
      buildSafeAuditChanges({
        confidentialAccess: true,
        title: document.title,
        documentType: document.documentType,
      }),
    );
  }

  return {
    absolutePath: await resolveExistingLocalDocumentAbsolutePath(document.fileKey),
    fileName: document.fileName,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    isConfidential: document.isConfidential,
    title: document.title,
  };
}

// ---------------------------------------------------------------------------
// Profile + dashboard + export helpers
// ---------------------------------------------------------------------------

export async function getMemberEngagementProfileData(memberId: string) {
  const organizationId = await getOrganizationId();
  const access = await getMemberEngagementAccess(organizationId);
  await assertMemberInOrg(organizationId, memberId);

  const empty = {
    milestones: [] as Awaited<ReturnType<typeof findMemberMilestones>>,
    gifts: [] as Awaited<ReturnType<typeof findMemberSpiritualGifts>>,
    ministries: [] as Awaited<ReturnType<typeof findMemberMinistries>>,
    skills: [] as Awaited<ReturnType<typeof findMemberSkills>>,
    interests: [] as Awaited<ReturnType<typeof findMemberInterests>>,
    documents: [] as ReturnType<typeof sanitizeDocumentForAccess>[],
    catalogGifts: [] as Awaited<ReturnType<typeof findSpiritualGifts>>,
    allMinistries: [] as Awaited<ReturnType<typeof findMinistries>>,
  };

  const profile = await findMemberEngagementProfile(organizationId, memberId);

  const documents = access.canViewDocuments
    ? profile.documents
        .filter((doc) => !doc.isConfidential || access.canViewConfidentialDocuments)
        .map((doc) => sanitizeDocumentForAccess(doc, access))
    : [];

  const [catalogGifts, allMinistries] = await Promise.all([
    access.canViewSpiritualGifts || access.canAssignSpiritualGifts
      ? findSpiritualGifts(organizationId, { activeOnly: true })
      : Promise.resolve([]),
    access.canViewMinistries
      ? findMinistries({ organizationId, isActive: true })
      : Promise.resolve([]),
  ]);

  return {
    access,
    data: {
      milestones: access.canViewMilestones ? profile.milestones : empty.milestones,
      gifts: access.canViewSpiritualGifts ? profile.gifts : empty.gifts,
      ministries: access.canViewMinistries ? profile.ministries : empty.ministries,
      skills: access.canViewSkillsInterests ? profile.skills : empty.skills,
      interests: access.canViewSkillsInterests ? profile.interests : empty.interests,
      documents,
      catalogGifts,
      allMinistries,
    },
  };
}

export async function getEngagementDashboardWidgets() {
  const organizationId = await getOrganizationId();
  const access = await getMemberEngagementAccess(organizationId);
  const counts = await getEngagementDashboardCounts(organizationId);

  return {
    access,
    widgets: [
      access.canViewMilestones
        ? {
            key: "baptismsThisMonth",
            label: "Baptisms This Month",
            count: counts.baptismsThisMonth,
            href: "/members",
          }
        : null,
      access.canViewMilestones
        ? {
            key: "newMembersThisMonth",
            label: "New Members This Month",
            count: counts.newMembersThisMonth,
            href: "/members?status=ACTIVE",
          }
        : null,
      access.canViewSkillsInterests
        ? {
            key: "availableToServe",
            label: "Available to Serve",
            count: counts.availableToServe,
            href: "/members/skills?available=1",
          }
        : null,
      access.canViewMinistries
        ? {
            key: "activeMinistryVolunteers",
            label: "Active Ministry Volunteers",
            count: counts.activeMinistryVolunteers,
            href: "/ministries",
          }
        : null,
      access.canViewMinistries
        ? {
            key: "ministriesWithoutLeaders",
            label: "Ministries Without Leaders",
            count: counts.ministriesWithoutLeaders,
            href: "/ministries",
          }
        : null,
      access.canViewDocuments
        ? {
            key: "documentsExpiringSoon",
            label: "Documents Expiring Soon",
            count: counts.documentsExpiringSoon,
            href: "/members",
          }
        : null,
    ].filter(Boolean),
  };
}

export async function exportMinistryRosterCsv(ministryId: string) {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canViewMinistries && a.canExport,
    "You do not have permission to export ministry data.",
  );

  const ministry = await findMinistryById(organizationId, ministryId);
  if (!ministry) throw new Error("Ministry not found.");

  const header = [
    "Member Name",
    "Role",
    "Status",
    "Is Leader",
    "Joined Date",
    "Ended Date",
  ];
  const rows = ministry.members.map((assignment) => {
    const name = [
      assignment.member.preferredName || assignment.member.firstName,
      assignment.member.lastName,
    ]
      .filter(Boolean)
      .join(" ");
    return [
      name,
      assignment.role,
      assignment.status,
      assignment.isLeader ? "Yes" : "No",
      assignment.joinedDate?.toISOString().slice(0, 10) ?? "",
      assignment.endedDate?.toISOString().slice(0, 10) ?? "",
    ]
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(",");
  });

  return [header.join(","), ...rows].join("\n");
}

export async function exportSkillsDirectoryCsv(filters?: {
  skillName?: string;
  availableToServeOnly?: boolean;
}) {
  const organizationId = await getOrganizationId();
  const access = await requireEngagementPermission(
    organizationId,
    (a) => a.canViewSkillsInterests && a.canExport,
    "You do not have permission to export skills.",
  );

  const results = await searchMembersBySkill({
    organizationId,
    ...filters,
  });

  const header = [
    "Member Name",
    "Skill",
    "Category",
    "Proficiency",
    "Years",
    "Available to Serve",
    ...(access.canViewContactInSkillSearch ? ["Email", "Phone"] : []),
  ];

  const rows = results.map((row) => {
    const name = [
      row.member.preferredName || row.member.firstName,
      row.member.lastName,
    ]
      .filter(Boolean)
      .join(" ");
    const cells = [
      name,
      row.skillName,
      row.skillCategory ?? "",
      row.proficiencyLevel,
      row.yearsExperience ?? "",
      row.isAvailableToServe ? "Yes" : "No",
    ];
    if (access.canViewContactInSkillSearch) {
      cells.push(row.member.email ?? "", row.member.phone ?? "");
    }
    return cells
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(",");
  });

  return [header.join(","), ...rows].join("\n");
}

export async function exportSpiritualGiftAssignmentsCsv() {
  const organizationId = await getOrganizationId();
  await requireEngagementPermission(
    organizationId,
    (a) => a.canViewSpiritualGifts && a.canExport,
    "You do not have permission to export spiritual gift assignments.",
  );

  const assignments = await findAllSpiritualGiftAssignments(organizationId);
  const header = [
    "Member Name",
    "Gift",
    "Category",
    "Proficiency",
    "Primary",
    "Identified Date",
  ];

  const rows = assignments.map((assignment) => {
    const name = [
      assignment.member.preferredName || assignment.member.firstName,
      assignment.member.lastName,
    ]
      .filter(Boolean)
      .join(" ");
    return [
      name,
      assignment.spiritualGift.name,
      assignment.spiritualGift.category ?? "",
      assignment.proficiencyLevel,
      assignment.isPrimary ? "Yes" : "No",
      assignment.identifiedDate?.toISOString().slice(0, 10) ?? "",
    ]
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(",");
  });

  return [header.join(","), ...rows].join("\n");
}

export { getMemberEngagementAccess };
export type { MemberEngagementAccess };
