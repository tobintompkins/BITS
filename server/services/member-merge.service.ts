import type { Prisma } from "@/app/generated/prisma/client";
import { requireLifecyclePermission } from "@/lib/auth/member-lifecycle-permissions";
import { buildSafeAuditChanges } from "@/lib/validation/member-lifecycle";
import type { ExecuteMergeInput } from "@/lib/validation/member-lifecycle";
import { prisma } from "@/lib/db/prisma";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import {
  countRelatedRecords,
  findMemberMerges,
} from "@/server/repositories/member-lifecycle.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";
import { orderMemberPairIds } from "@/lib/members/duplicate-scoring";

type Actor = { userAccountId: string | null; email: string | null };

const MERGEABLE_FIELDS = [
  "firstName",
  "middleName",
  "lastName",
  "preferredName",
  "suffix",
  "email",
  "phone",
  "alternatePhone",
  "dateOfBirth",
  "gender",
  "maritalStatus",
  "membershipStatus",
  "memberSince",
  "baptismDate",
  "salvationDate",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "postalCode",
  "country",
  "notes",
  "preferredContactMethod",
  "allowEmail",
  "allowSms",
  "allowPhoneCalls",
  "allowPostalMail",
  "allowDirectoryListing",
  "allowPhotoUse",
  "profilePhotoUrl",
  "profilePhotoKey",
] as const;

type MergeableField = (typeof MERGEABLE_FIELDS)[number];

async function getOrganizationId() {
  const organization = await findPrimaryOrganization();
  if (!organization) throw new Error("Organization not found.");
  return organization.id;
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

function completenessScore(member: Record<string, unknown>) {
  const fields = [
    "email",
    "phone",
    "dateOfBirth",
    "addressLine1",
    "city",
    "state",
    "postalCode",
    "memberSince",
    "baptismDate",
    "profilePhotoUrl",
  ];
  return fields.reduce(
    (score, field) => score + (member[field] ? 1 : 0),
    0,
  );
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export async function prepareMemberMerge(
  primaryMemberId: string,
  duplicateMemberId: string,
) {
  const organizationId = await getOrganizationId();
  await requireLifecyclePermission(
    organizationId,
    (a) => a.canMergeMembers,
    "You do not have permission to merge members.",
  );

  if (primaryMemberId === duplicateMemberId) {
    throw new Error("Primary and duplicate must be different members.");
  }

  const [primary, duplicate] = await Promise.all([
    prisma.member.findFirst({
      where: { id: primaryMemberId, organizationId },
    }),
    prisma.member.findFirst({
      where: { id: duplicateMemberId, organizationId },
    }),
  ]);

  if (!primary || !duplicate) {
    throw new Error("One or both members were not found.");
  }

  if (primary.recordStatus === "MERGED" || duplicate.recordStatus === "MERGED") {
    throw new Error("Cannot merge a record that is already merged.");
  }

  const [primaryCounts, duplicateCounts] = await Promise.all([
    countRelatedRecords(primary.id),
    countRelatedRecords(duplicate.id),
  ]);

  const primaryScore =
    completenessScore(primary) +
    Object.values(primaryCounts).reduce((a, b) => a + b, 0) +
    (primary.recordStatus === "ACTIVE" ? 10 : 0);
  const duplicateScore =
    completenessScore(duplicate) +
    Object.values(duplicateCounts).reduce((a, b) => a + b, 0) +
    (duplicate.recordStatus === "ACTIVE" ? 10 : 0);

  const recommendedPrimaryId =
    primaryScore >= duplicateScore ? primary.id : duplicate.id;

  const fieldComparisons = MERGEABLE_FIELDS.map((field) => ({
    field,
    primaryValue: formatFieldValue(primary[field as keyof typeof primary]),
    duplicateValue: formatFieldValue(duplicate[field as keyof typeof duplicate]),
    recommended: "primary" as const,
  }));

  return {
    primary,
    duplicate,
    primaryCounts,
    duplicateCounts,
    recommendedPrimaryId,
    recommendationReasons: [
      primaryScore >= duplicateScore
        ? "Selected primary has higher completeness and related-record activity."
        : "Suggested swapping primary based on completeness and related records.",
      primary.recordStatus === "ACTIVE" || duplicate.recordStatus === "ACTIVE"
        ? "Active record status is preferred when available."
        : "Neither record is currently active.",
    ],
    fieldComparisons,
    requiresArchivedConfirmation:
      primary.recordStatus === "ARCHIVED" || duplicate.recordStatus === "ARCHIVED",
  };
}

export async function validateMemberMerge(input: {
  primaryMemberId: string;
  duplicateMemberId: string;
  confirmArchivedPrimary?: boolean;
}) {
  const organizationId = await getOrganizationId();
  await requireLifecyclePermission(
    organizationId,
    (a) => a.canMergeMembers,
    "You do not have permission to merge members.",
  );

  if (input.primaryMemberId === input.duplicateMemberId) {
    return { valid: false, message: "Primary and duplicate must differ." };
  }

  const [primary, duplicate] = await Promise.all([
    prisma.member.findFirst({
      where: { id: input.primaryMemberId, organizationId },
    }),
    prisma.member.findFirst({
      where: { id: input.duplicateMemberId, organizationId },
    }),
  ]);

  if (!primary || !duplicate) {
    return { valid: false, message: "One or both members were not found." };
  }
  if (primary.recordStatus === "MERGED" || duplicate.recordStatus === "MERGED") {
    return { valid: false, message: "Cannot merge an already merged record." };
  }
  if (primary.organizationId !== duplicate.organizationId) {
    return { valid: false, message: "Members must belong to the same organization." };
  }
  if (
    (primary.recordStatus === "ARCHIVED" || duplicate.recordStatus === "ARCHIVED") &&
    !input.confirmArchivedPrimary
  ) {
    return {
      valid: false,
      message: "Confirm merging when an archived record is involved.",
    };
  }

  return { valid: true, message: "Merge is valid.", primary, duplicate };
}

function parseSelectionValue(
  field: MergeableField,
  raw: string,
): string | boolean | Date | null {
  if (raw === "" || raw === undefined) return null;
  if (
    field === "allowEmail" ||
    field === "allowSms" ||
    field === "allowPhoneCalls" ||
    field === "allowPostalMail" ||
    field === "allowDirectoryListing" ||
    field === "allowPhotoUse"
  ) {
    return raw === "true";
  }
  if (
    field === "dateOfBirth" ||
    field === "memberSince" ||
    field === "baptismDate" ||
    field === "salvationDate"
  ) {
    return new Date(`${raw}T00:00:00.000Z`);
  }
  return raw;
}

export async function executeMemberMerge(
  input: ExecuteMergeInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  const access = await requireLifecyclePermission(
    organizationId,
    (a) => a.canMergeMembers,
    "You do not have permission to merge members.",
  );
  void access;

  if (!actor.userAccountId) {
    throw new Error("A signed-in user account is required to merge members.");
  }

  const validation = await validateMemberMerge({
    primaryMemberId: input.primaryMemberId,
    duplicateMemberId: input.duplicateMemberId,
    confirmArchivedPrimary: input.confirmArchivedPrimary,
  });
  if (!validation.valid || !validation.primary || !validation.duplicate) {
    throw new Error(validation.message);
  }

  await audit(
    organizationId,
    actor,
    "MERGE_STARTED",
    "MemberMerge",
    input.primaryMemberId,
    buildSafeAuditChanges({
      primaryMemberId: input.primaryMemberId,
      duplicateMemberId: input.duplicateMemberId,
      actorEmail: actor.email,
    }),
  );

  try {
    const result = await prisma.$transaction(async (tx) => {
      const [primary, duplicate] = await Promise.all([
        tx.member.findFirst({
          where: { id: input.primaryMemberId, organizationId },
        }),
        tx.member.findFirst({
          where: { id: input.duplicateMemberId, organizationId },
        }),
      ]);

      if (!primary || !duplicate) {
        throw new Error("One or both members were not found.");
      }
      if (primary.recordStatus === "MERGED" || duplicate.recordStatus === "MERGED") {
        throw new Error("Cannot merge a record that is already merged.");
      }
      if (primary.organizationId !== duplicate.organizationId) {
        throw new Error("Members must belong to the same organization.");
      }

      const fieldUpdates: Prisma.MemberUpdateInput = {};
      for (const [field, source] of Object.entries(input.fieldSelections)) {
        if (!MERGEABLE_FIELDS.includes(field as MergeableField)) continue;
        const typedField = field as MergeableField;
        if (source === "primary") continue;
        if (source === "duplicate") {
          const value = duplicate[typedField as keyof typeof duplicate];
          (fieldUpdates as Record<string, unknown>)[typedField] = value ?? null;
          continue;
        }
        (fieldUpdates as Record<string, unknown>)[typedField] = parseSelectionValue(
          typedField,
          source,
        );
      }

      if (Object.keys(fieldUpdates).length > 0) {
        await tx.member.update({
          where: { id: primary.id },
          data: fieldUpdates,
        });
      }

      const relatedSummary: Record<string, number> = {};

      // Household links — move unique households; reassign primary contact if needed
      const duplicateHouseholds = await tx.memberHousehold.findMany({
        where: { memberId: duplicate.id },
      });
      let householdMoved = 0;
      for (const link of duplicateHouseholds) {
        const existing = await tx.memberHousehold.findUnique({
          where: {
            memberId_householdId: {
              memberId: primary.id,
              householdId: link.householdId,
            },
          },
        });
        if (existing) {
          await tx.memberHousehold.delete({ where: { id: link.id } });
        } else {
          await tx.memberHousehold.update({
            where: { id: link.id },
            data: { memberId: primary.id },
          });
          householdMoved += 1;
        }
      }
      await tx.memberHouseholdUnit.updateMany({
        where: { primaryContactId: duplicate.id },
        data: { primaryContactId: primary.id },
      });
      relatedSummary.householdLinks = householdMoved;

      // Emergency contacts — dedupe by name+phone
      const primaryContacts = await tx.memberEmergencyContact.findMany({
        where: { memberId: primary.id },
      });
      const duplicateContacts = await tx.memberEmergencyContact.findMany({
        where: { memberId: duplicate.id },
      });
      let contactsMoved = 0;
      for (const contact of duplicateContacts) {
        const key = `${contact.name.trim().toLowerCase()}|${contact.phone.replace(/\D/g, "")}`;
        const exists = primaryContacts.some(
          (c) =>
            `${c.name.trim().toLowerCase()}|${c.phone.replace(/\D/g, "")}` === key,
        );
        if (exists) {
          await tx.memberEmergencyContact.delete({ where: { id: contact.id } });
        } else {
          await tx.memberEmergencyContact.update({
            where: { id: contact.id },
            data: { memberId: primary.id },
          });
          contactsMoved += 1;
        }
      }
      relatedSummary.emergencyContacts = contactsMoved;

      const attendanceMoved = await tx.memberAttendance.updateMany({
        where: { memberId: duplicate.id },
        data: { memberId: primary.id },
      });
      relatedSummary.attendances = attendanceMoved.count;

      const followUpsMoved = await tx.memberFollowUp.updateMany({
        where: { memberId: duplicate.id },
        data: { memberId: primary.id },
      });
      relatedSummary.followUps = followUpsMoved.count;

      const pastoralMoved = await tx.pastoralCareNote.updateMany({
        where: { memberId: duplicate.id },
        data: { memberId: primary.id },
      });
      relatedSummary.pastoralCareNotes = pastoralMoved.count;

      const prayerMoved = await tx.prayerRequest.updateMany({
        where: { memberId: duplicate.id },
        data: { memberId: primary.id },
      });
      relatedSummary.prayerRequests = prayerMoved.count;

      const communicationsMoved = await tx.memberCommunication.updateMany({
        where: { memberId: duplicate.id },
        data: { memberId: primary.id },
      });
      relatedSummary.communications = communicationsMoved.count;

      const milestonesMoved = await tx.memberMilestone.updateMany({
        where: { memberId: duplicate.id },
        data: { memberId: primary.id },
      });
      relatedSummary.milestones = milestonesMoved.count;

      const skillsMoved = await tx.memberSkill.updateMany({
        where: { memberId: duplicate.id },
        data: { memberId: primary.id },
      });
      relatedSummary.skills = skillsMoved.count;

      const interestsMoved = await tx.memberInterest.updateMany({
        where: { memberId: duplicate.id },
        data: { memberId: primary.id },
      });
      relatedSummary.interests = interestsMoved.count;

      const documentsMoved = await tx.memberDocument.updateMany({
        where: { memberId: duplicate.id },
        data: { memberId: primary.id },
      });
      relatedSummary.documents = documentsMoved.count;

      const consentMoved = await tx.memberConsentHistory.updateMany({
        where: { memberId: duplicate.id },
        data: { memberId: primary.id },
      });
      relatedSummary.consentHistory = consentMoved.count;

      // Spiritual gifts — unique per gift; keep stronger/more recent
      const primaryGifts = await tx.memberSpiritualGift.findMany({
        where: { memberId: primary.id },
      });
      const duplicateGifts = await tx.memberSpiritualGift.findMany({
        where: { memberId: duplicate.id },
      });
      let giftsMoved = 0;
      for (const gift of duplicateGifts) {
        const conflict = primaryGifts.find(
          (g) => g.spiritualGiftId === gift.spiritualGiftId,
        );
        if (conflict) {
          const keepDuplicate =
            gift.isPrimary ||
            (!conflict.isPrimary && gift.updatedAt > conflict.updatedAt);
          if (keepDuplicate) {
            await tx.memberSpiritualGift.delete({ where: { id: conflict.id } });
            await tx.memberSpiritualGift.update({
              where: { id: gift.id },
              data: { memberId: primary.id },
            });
            giftsMoved += 1;
          } else {
            await tx.memberSpiritualGift.delete({ where: { id: gift.id } });
          }
        } else {
          await tx.memberSpiritualGift.update({
            where: { id: gift.id },
            data: { memberId: primary.id },
          });
          giftsMoved += 1;
        }
      }
      relatedSummary.spiritualGifts = giftsMoved;

      // Ministries — unique per ministry
      const primaryMinistries = await tx.memberMinistry.findMany({
        where: { memberId: primary.id },
      });
      const duplicateMinistries = await tx.memberMinistry.findMany({
        where: { memberId: duplicate.id },
      });
      let ministriesMoved = 0;
      for (const ministry of duplicateMinistries) {
        const conflict = primaryMinistries.find(
          (m) => m.ministryId === ministry.ministryId,
        );
        if (conflict) {
          const keepDuplicate =
            ministry.isLeader ||
            (!conflict.isLeader &&
              (ministry.joinedDate?.getTime() ?? 0) >
                (conflict.joinedDate?.getTime() ?? 0));
          if (keepDuplicate) {
            await tx.memberMinistry.delete({ where: { id: conflict.id } });
            await tx.memberMinistry.update({
              where: { id: ministry.id },
              data: { memberId: primary.id },
            });
            ministriesMoved += 1;
          } else {
            await tx.memberMinistry.delete({ where: { id: ministry.id } });
          }
        } else {
          await tx.memberMinistry.update({
            where: { id: ministry.id },
            data: { memberId: primary.id },
          });
          ministriesMoved += 1;
        }
      }
      relatedSummary.ministries = ministriesMoved;

      await tx.member.update({
        where: { id: duplicate.id },
        data: {
          recordStatus: "MERGED",
          mergedIntoMemberId: primary.id,
          mergedAt: new Date(),
          mergedByUserId: actor.userAccountId,
          allowEmail: false,
          allowSms: false,
          allowPhoneCalls: false,
          allowPostalMail: false,
          allowDirectoryListing: false,
          allowPhotoUse: false,
        },
      });

      const mergeSummary = `Merged ${duplicate.firstName} ${duplicate.lastName} into ${primary.firstName} ${primary.lastName}.`;
      const mergeRecord = await tx.memberMerge.create({
        data: {
          primaryMemberId: primary.id,
          duplicateMemberId: duplicate.id,
          mergedByUserId: actor.userAccountId!,
          mergeSummary,
          fieldSelections: input.fieldSelections,
          relatedRecordSummary: relatedSummary,
        },
      });

      const [aId, bId] = orderMemberPairIds(primary.id, duplicate.id);
      const candidate = await tx.memberDuplicateCandidate.findFirst({
        where: {
          organizationId,
          memberAId: aId,
          memberBId: bId,
        },
      });
      if (candidate) {
        await tx.memberDuplicateCandidate.update({
          where: { id: candidate.id },
          data: {
            status: "MERGED",
            reviewedByUserId: actor.userAccountId,
            reviewedAt: new Date(),
          },
        });
      }

      return { mergeRecord, relatedSummary, primaryId: primary.id, duplicateId: duplicate.id };
    });

    await audit(
      organizationId,
      actor,
      "MERGE_COMPLETED",
      "MemberMerge",
      result.mergeRecord.id,
      buildSafeAuditChanges({
        primaryMemberId: result.primaryId,
        duplicateMemberId: result.duplicateId,
        ...Object.fromEntries(
          Object.entries(result.relatedSummary).map(([k, v]) => [k, v]),
        ),
      }),
    );

    return result;
  } catch (error) {
    await audit(
      organizationId,
      actor,
      "MERGE_FAILED",
      "MemberMerge",
      input.primaryMemberId,
      buildSafeAuditChanges({
        error: error instanceof Error ? error.message : "Unknown error",
        duplicateMemberId: input.duplicateMemberId,
      }),
    );
    throw error;
  }
}

export async function getMemberMergeHistory(memberId: string) {
  const organizationId = await getOrganizationId();
  await requireLifecyclePermission(
    organizationId,
    (a) => a.canViewMerged,
    "You do not have permission to view merge history.",
  );

  const member = await prisma.member.findFirst({
    where: { id: memberId, organizationId },
    select: { id: true },
  });
  if (!member) throw new Error("Member not found.");

  return findMemberMerges(memberId);
}

export async function getMergedMemberRedirect(memberId: string) {
  const organizationId = await getOrganizationId();
  const access = await requireLifecyclePermission(
    organizationId,
    (a) => a.canViewMerged,
    "You do not have permission to view merged records.",
  );

  const member = await prisma.member.findFirst({
    where: { id: memberId, organizationId },
    select: {
      id: true,
      recordStatus: true,
      mergedIntoMemberId: true,
      firstName: true,
      lastName: true,
      preferredName: true,
    },
  });

  if (!member) return null;
  if (member.recordStatus !== "MERGED" || !member.mergedIntoMemberId) {
    return { member, primary: null, access };
  }

  const primary = await prisma.member.findFirst({
    where: { id: member.mergedIntoMemberId, organizationId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      recordStatus: true,
    },
  });

  return { member, primary, access };
}
