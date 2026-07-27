import type {
  ConsentChangeSource,
  DuplicateCandidateStatus,
  MemberConsentType,
  MemberRecordStatus,
  PreferredContactMethod,
  Prisma,
} from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { DUPLICATE_HIGH_CONFIDENCE_THRESHOLD } from "@/lib/constants/member-lifecycle";

const memberNameSelect = {
  id: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  email: true,
  phone: true,
  alternatePhone: true,
  membershipStatus: true,
  recordStatus: true,
  dateOfBirth: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  postalCode: true,
  country: true,
  middleName: true,
  suffix: true,
  gender: true,
  maritalStatus: true,
  memberSince: true,
  baptismDate: true,
  salvationDate: true,
  notes: true,
  preferredContactMethod: true,
  allowEmail: true,
  allowSms: true,
  allowPhoneCalls: true,
  allowPostalMail: true,
  allowDirectoryListing: true,
  allowPhotoUse: true,
  profilePhotoUrl: true,
  archivedAt: true,
  archiveReason: true,
  deceasedDate: true,
  mergedIntoMemberId: true,
  mergedAt: true,
} satisfies Prisma.MemberSelect;

export async function updateMemberLifecycleFields(
  memberId: string,
  organizationId: string,
  data: Prisma.MemberUncheckedUpdateManyInput,
) {
  const result = await prisma.member.updateMany({
    where: { id: memberId, organizationId },
    data,
  });
  if (result.count === 0) throw new Error("Member not found.");
  return prisma.member.findFirstOrThrow({
    where: { id: memberId, organizationId },
    select: memberNameSelect,
  });
}

export async function findMembersByRecordStatus(
  organizationId: string,
  recordStatus: MemberRecordStatus,
) {
  return prisma.member.findMany({
    where: { organizationId, recordStatus },
    select: memberNameSelect,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

export async function findMembersForDuplicateScan(
  organizationId: string,
  options?: { includeArchived?: boolean; take?: number },
) {
  const statuses: MemberRecordStatus[] = ["ACTIVE", "INACTIVE"];
  if (options?.includeArchived) {
    statuses.push("ARCHIVED");
  }

  return prisma.member.findMany({
    where: {
      organizationId,
      recordStatus: { in: statuses },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      email: true,
      phone: true,
      alternatePhone: true,
      dateOfBirth: true,
      addressLine1: true,
      city: true,
      state: true,
      postalCode: true,
      recordStatus: true,
      householdLinks: { select: { householdId: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    ...(options?.take != null ? { take: options.take } : {}),
  });
}

/** Load all existing duplicate pair keys for an org (avoids N² lookups). */
export async function findExistingDuplicatePairKeys(organizationId: string) {
  const rows = await prisma.memberDuplicateCandidate.findMany({
    where: { organizationId },
    select: { memberAId: true, memberBId: true },
  });

  return new Set(rows.map((row) => `${row.memberAId}|${row.memberBId}`));
}

export async function createConsentHistoryEntry(data: {
  memberId: string;
  consentType: MemberConsentType;
  previousValue: string | null;
  newValue: string;
  source: ConsentChangeSource;
  notes?: string | null;
  changedByUserId?: string | null;
}) {
  return prisma.memberConsentHistory.create({ data });
}

export async function findConsentHistory(memberId: string) {
  return prisma.memberConsentHistory.findMany({
    where: { memberId },
    include: {
      changedBy: {
        select: { id: true, displayName: true, primaryEmail: true },
      },
    },
    orderBy: { changedAt: "desc" },
  });
}

export async function createDuplicateCandidate(data: {
  organizationId: string;
  memberAId: string;
  memberBId: string;
  matchScore: number;
  matchReasons: string[];
}) {
  return prisma.memberDuplicateCandidate.create({
    data: {
      organizationId: data.organizationId,
      memberAId: data.memberAId,
      memberBId: data.memberBId,
      matchScore: data.matchScore,
      matchReasons: data.matchReasons,
      status: "PENDING",
    },
  });
}

export async function findExistingDuplicatePair(
  memberAId: string,
  memberBId: string,
) {
  return prisma.memberDuplicateCandidate.findUnique({
    where: { memberAId_memberBId: { memberAId, memberBId } },
  });
}

export type DuplicateCandidateFilters = {
  organizationId: string;
  status?: DuplicateCandidateStatus;
  search?: string;
  highConfidenceOnly?: boolean;
  take?: number;
  skip?: number;
};

export async function findDuplicateCandidates(
  filters: DuplicateCandidateFilters,
) {
  const where: Prisma.MemberDuplicateCandidateWhereInput = {
    organizationId: filters.organizationId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.highConfidenceOnly
      ? { matchScore: { gte: DUPLICATE_HIGH_CONFIDENCE_THRESHOLD } }
      : {}),
    ...(filters.search
      ? {
          OR: [
            {
              memberA: {
                OR: [
                  { firstName: { contains: filters.search, mode: "insensitive" } },
                  { lastName: { contains: filters.search, mode: "insensitive" } },
                  { email: { contains: filters.search, mode: "insensitive" } },
                ],
              },
            },
            {
              memberB: {
                OR: [
                  { firstName: { contains: filters.search, mode: "insensitive" } },
                  { lastName: { contains: filters.search, mode: "insensitive" } },
                  { email: { contains: filters.search, mode: "insensitive" } },
                ],
              },
            },
          ],
        }
      : {}),
  };

  const [records, total] = await Promise.all([
    prisma.memberDuplicateCandidate.findMany({
      where,
      include: {
        memberA: { select: memberNameSelect },
        memberB: { select: memberNameSelect },
        reviewedBy: {
          select: { id: true, displayName: true, primaryEmail: true },
        },
      },
      orderBy: [{ matchScore: "desc" }, { createdAt: "desc" }],
      take: filters.take ?? 50,
      skip: filters.skip ?? 0,
    }),
    prisma.memberDuplicateCandidate.count({ where }),
  ]);

  return { records, total };
}

export async function findDuplicateCandidateById(
  organizationId: string,
  id: string,
) {
  return prisma.memberDuplicateCandidate.findFirst({
    where: { id, organizationId },
    include: {
      memberA: { select: memberNameSelect },
      memberB: { select: memberNameSelect },
      reviewedBy: {
        select: { id: true, displayName: true, primaryEmail: true },
      },
    },
  });
}

export async function updateDuplicateCandidateStatus(
  id: string,
  organizationId: string,
  data: {
    status: DuplicateCandidateStatus;
    reviewedByUserId?: string | null;
    reviewedAt?: Date | null;
  },
) {
  const result = await prisma.memberDuplicateCandidate.updateMany({
    where: { id, organizationId },
    data,
  });
  if (result.count === 0) throw new Error("Duplicate candidate not found.");
  return findDuplicateCandidateById(organizationId, id);
}

export async function findDuplicateCandidateForPair(
  organizationId: string,
  memberAId: string,
  memberBId: string,
) {
  return prisma.memberDuplicateCandidate.findFirst({
    where: {
      organizationId,
      memberAId,
      memberBId,
    },
  });
}

export async function createMemberMerge(data: {
  primaryMemberId: string;
  duplicateMemberId: string;
  mergedByUserId: string;
  mergeSummary: string;
  fieldSelections: Prisma.InputJsonValue;
  relatedRecordSummary: Prisma.InputJsonValue;
}) {
  return prisma.memberMerge.create({ data });
}

export async function findMemberMerges(memberId: string) {
  return prisma.memberMerge.findMany({
    where: {
      OR: [{ primaryMemberId: memberId }, { duplicateMemberId: memberId }],
    },
    include: {
      primaryMember: { select: memberNameSelect },
      duplicateMember: { select: memberNameSelect },
      mergedBy: {
        select: { id: true, displayName: true, primaryEmail: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function countRelatedRecords(memberId: string) {
  const [
    householdLinks,
    emergencyContacts,
    attendances,
    followUps,
    pastoralCareNotes,
    prayerRequests,
    communications,
    milestones,
    spiritualGifts,
    ministries,
    skills,
    interests,
    documents,
    consentHistory,
  ] = await Promise.all([
    prisma.memberHousehold.count({ where: { memberId } }),
    prisma.memberEmergencyContact.count({ where: { memberId } }),
    prisma.memberAttendance.count({ where: { memberId } }),
    prisma.memberFollowUp.count({ where: { memberId } }),
    prisma.pastoralCareNote.count({ where: { memberId } }),
    prisma.prayerRequest.count({ where: { memberId } }),
    prisma.memberCommunication.count({ where: { memberId } }),
    prisma.memberMilestone.count({ where: { memberId } }),
    prisma.memberSpiritualGift.count({ where: { memberId } }),
    prisma.memberMinistry.count({ where: { memberId } }),
    prisma.memberSkill.count({ where: { memberId } }),
    prisma.memberInterest.count({ where: { memberId } }),
    prisma.memberDocument.count({ where: { memberId } }),
    prisma.memberConsentHistory.count({ where: { memberId } }),
  ]);

  return {
    householdLinks,
    emergencyContacts,
    attendances,
    followUps,
    pastoralCareNotes,
    prayerRequests,
    communications,
    milestones,
    spiritualGifts,
    ministries,
    skills,
    interests,
    documents,
    consentHistory,
  };
}

export async function getLifecycleDashboardCounts(organizationId: string) {
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const [
    pendingDuplicates,
    highConfidenceDuplicates,
    archivedMembers,
    inactiveMembers,
    deceasedMembers,
    emailOptOuts,
    smsOptOuts,
    directoryOptOuts,
    mergedThisMonth,
    dismissedCandidates,
    confirmedDuplicates,
  ] = await Promise.all([
    prisma.memberDuplicateCandidate.count({
      where: { organizationId, status: "PENDING" },
    }),
    prisma.memberDuplicateCandidate.count({
      where: {
        organizationId,
        status: "PENDING",
        matchScore: { gte: DUPLICATE_HIGH_CONFIDENCE_THRESHOLD },
      },
    }),
    prisma.member.count({
      where: { organizationId, recordStatus: "ARCHIVED" },
    }),
    prisma.member.count({
      where: { organizationId, recordStatus: "INACTIVE" },
    }),
    prisma.member.count({
      where: { organizationId, recordStatus: "DECEASED" },
    }),
    prisma.member.count({
      where: { organizationId, allowEmail: false, recordStatus: { not: "MERGED" } },
    }),
    prisma.member.count({
      where: { organizationId, allowSms: false, recordStatus: { not: "MERGED" } },
    }),
    prisma.member.count({
      where: {
        organizationId,
        allowDirectoryListing: false,
        recordStatus: { not: "MERGED" },
      },
    }),
    prisma.memberMerge.count({
      where: {
        primaryMember: { organizationId },
        createdAt: { gte: startOfMonth },
      },
    }),
    prisma.memberDuplicateCandidate.count({
      where: { organizationId, status: "DISMISSED" },
    }),
    prisma.memberDuplicateCandidate.count({
      where: { organizationId, status: "CONFIRMED_DUPLICATE" },
    }),
  ]);

  return {
    pendingDuplicates,
    highConfidenceDuplicates,
    archivedMembers,
    inactiveMembers,
    deceasedMembers,
    emailOptOuts,
    smsOptOuts,
    directoryOptOuts,
    mergedThisMonth,
    dismissedCandidates,
    confirmedDuplicates,
  };
}

export async function findMemberSafeComparison(
  organizationId: string,
  memberId: string,
) {
  const member = await prisma.member.findFirst({
    where: { id: memberId, organizationId },
    select: memberNameSelect,
  });
  if (!member) return null;

  const counts = await countRelatedRecords(memberId);
  return { member, counts };
}

export type CommunicationPreferencesData = {
  preferredContactMethod: PreferredContactMethod | null;
  allowEmail: boolean;
  allowSms: boolean;
  allowPhoneCalls: boolean;
  allowPostalMail: boolean;
  allowDirectoryListing: boolean;
  allowPhotoUse: boolean;
  emailOptOutDate: Date | null;
  smsOptOutDate: Date | null;
  directoryOptOutDate: Date | null;
  photoOptOutDate: Date | null;
  consentUpdatedAt: Date | null;
};

export async function findMemberCommunicationPreferences(
  organizationId: string,
  memberId: string,
) {
  return prisma.member.findFirst({
    where: { id: memberId, organizationId },
    select: {
      id: true,
      preferredContactMethod: true,
      allowEmail: true,
      allowSms: true,
      allowPhoneCalls: true,
      allowPostalMail: true,
      allowDirectoryListing: true,
      allowPhotoUse: true,
      emailOptOutDate: true,
      smsOptOutDate: true,
      directoryOptOutDate: true,
      photoOptOutDate: true,
      consentUpdatedAt: true,
      recordStatus: true,
    },
  });
}
