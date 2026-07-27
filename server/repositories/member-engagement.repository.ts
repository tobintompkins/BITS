import type {
  GiftProficiencyLevel,
  MemberDocumentType,
  MemberMinistryRole,
  MemberMinistryStatus,
  MembershipMilestoneType,
  MinistryType,
  Prisma,
  SkillProficiencyLevel,
} from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

const memberNameSelect = {
  id: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  membershipStatus: true,
  email: true,
  phone: true,
  salvationDate: true,
  baptismDate: true,
  memberSince: true,
} satisfies Prisma.MemberSelect;

const userSelect = {
  id: true,
  displayName: true,
  primaryEmail: true,
} satisfies Prisma.UserAccountSelect;

function startOfMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfMonth(date = new Date()) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  );
}

function daysFromNow(days: number) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export async function findMemberMilestones(
  organizationId: string,
  memberId: string,
) {
  return prisma.memberMilestone.findMany({
    where: { organizationId, memberId },
    include: {
      createdBy: { select: userSelect },
    },
    orderBy: [{ milestoneDate: "desc" }, { createdAt: "desc" }],
  });
}

export async function findMemberMilestoneById(
  organizationId: string,
  id: string,
) {
  return prisma.memberMilestone.findFirst({
    where: { id, organizationId },
    include: {
      member: { select: memberNameSelect },
      createdBy: { select: userSelect },
    },
  });
}

export async function createMemberMilestone(data: {
  organizationId: string;
  memberId: string;
  milestoneType: MembershipMilestoneType;
  title: string;
  milestoneDate: Date;
  location?: string | null;
  officiant?: string | null;
  certificateNumber?: string | null;
  notes?: string | null;
  documentUrl?: string | null;
  documentKey?: string | null;
  createdByUserId: string;
}) {
  return prisma.memberMilestone.create({ data });
}

export async function updateMemberMilestone(
  id: string,
  organizationId: string,
  data: {
    milestoneType: MembershipMilestoneType;
    title: string;
    milestoneDate: Date;
    location?: string | null;
    officiant?: string | null;
    certificateNumber?: string | null;
    notes?: string | null;
    documentUrl?: string | null;
    documentKey?: string | null;
  },
) {
  const result = await prisma.memberMilestone.updateMany({
    where: { id, organizationId },
    data,
  });
  if (result.count === 0) throw new Error("Milestone not found.");
  return findMemberMilestoneById(organizationId, id);
}

export async function deleteMemberMilestone(
  id: string,
  organizationId: string,
) {
  const result = await prisma.memberMilestone.deleteMany({
    where: { id, organizationId },
  });
  if (result.count === 0) throw new Error("Milestone not found.");
}

export async function updateMemberMilestoneDocument(
  id: string,
  organizationId: string,
  data: { documentUrl: string | null; documentKey: string | null },
) {
  const result = await prisma.memberMilestone.updateMany({
    where: { id, organizationId },
    data,
  });
  if (result.count === 0) throw new Error("Milestone not found.");
  return findMemberMilestoneById(organizationId, id);
}

export async function syncMemberDateFromMilestone(
  memberId: string,
  organizationId: string,
  field: "salvationDate" | "baptismDate" | "memberSince",
  value: Date,
  force: boolean,
) {
  const member = await prisma.member.findFirst({
    where: { id: memberId, organizationId },
    select: {
      id: true,
      salvationDate: true,
      baptismDate: true,
      memberSince: true,
    },
  });
  if (!member) throw new Error("Member not found.");

  const existing = member[field];
  if (existing && !force) {
    return { synced: false as const, existing };
  }

  await prisma.member.update({
    where: { id: memberId },
    data: { [field]: value },
  });
  return { synced: true as const, existing };
}

// ---------------------------------------------------------------------------
// Spiritual gifts catalog
// ---------------------------------------------------------------------------

export async function findSpiritualGifts(
  organizationId: string,
  options?: { activeOnly?: boolean },
) {
  return prisma.spiritualGift.findMany({
    where: {
      organizationId,
      ...(options?.activeOnly ? { isActive: true } : {}),
    },
    include: {
      _count: { select: { assignments: true } },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

export async function findSpiritualGiftById(
  organizationId: string,
  id: string,
) {
  return prisma.spiritualGift.findFirst({
    where: { id, organizationId },
    include: {
      _count: { select: { assignments: true } },
    },
  });
}

export async function createSpiritualGift(data: {
  organizationId: string;
  name: string;
  description?: string | null;
  category?: string | null;
  isActive?: boolean;
}) {
  return prisma.spiritualGift.create({ data });
}

export async function updateSpiritualGift(
  id: string,
  organizationId: string,
  data: {
    name: string;
    description?: string | null;
    category?: string | null;
    isActive?: boolean;
  },
) {
  const result = await prisma.spiritualGift.updateMany({
    where: { id, organizationId },
    data,
  });
  if (result.count === 0) throw new Error("Spiritual gift not found.");
  return findSpiritualGiftById(organizationId, id);
}

export async function deleteSpiritualGift(
  id: string,
  organizationId: string,
) {
  const gift = await findSpiritualGiftById(organizationId, id);
  if (!gift) throw new Error("Spiritual gift not found.");
  if (gift._count.assignments > 0) {
    throw new Error(
      "Cannot delete a spiritual gift that is assigned to members. Deactivate it instead.",
    );
  }
  await prisma.spiritualGift.delete({ where: { id } });
}

export async function setSpiritualGiftActive(
  id: string,
  organizationId: string,
  isActive: boolean,
) {
  const result = await prisma.spiritualGift.updateMany({
    where: { id, organizationId },
    data: { isActive },
  });
  if (result.count === 0) throw new Error("Spiritual gift not found.");
  return findSpiritualGiftById(organizationId, id);
}

// ---------------------------------------------------------------------------
// Member spiritual gifts
// ---------------------------------------------------------------------------

export async function findAllSpiritualGiftAssignments(organizationId: string) {
  return prisma.memberSpiritualGift.findMany({
    where: {
      spiritualGift: { organizationId },
    },
    include: {
      member: { select: memberNameSelect },
      spiritualGift: {
        select: { id: true, name: true, category: true },
      },
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
}

export async function findMemberSpiritualGifts(memberId: string) {
  return prisma.memberSpiritualGift.findMany({
    where: { memberId },
    include: {
      spiritualGift: true,
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
}

export async function findMemberSpiritualGiftById(id: string) {
  return prisma.memberSpiritualGift.findFirst({
    where: { id },
    include: {
      spiritualGift: true,
      member: { select: memberNameSelect },
    },
  });
}

export async function createMemberSpiritualGift(data: {
  memberId: string;
  spiritualGiftId: string;
  proficiencyLevel: GiftProficiencyLevel;
  isPrimary?: boolean;
  notes?: string | null;
  identifiedDate?: Date | null;
}) {
  if (data.isPrimary) {
    return prisma.$transaction(async (tx) => {
      await tx.memberSpiritualGift.updateMany({
        where: { memberId: data.memberId },
        data: { isPrimary: false },
      });
      return tx.memberSpiritualGift.create({ data });
    });
  }
  return prisma.memberSpiritualGift.create({ data });
}

export async function updateMemberSpiritualGift(
  id: string,
  data: {
    proficiencyLevel: GiftProficiencyLevel;
    isPrimary?: boolean;
    notes?: string | null;
    identifiedDate?: Date | null;
  },
) {
  const existing = await findMemberSpiritualGiftById(id);
  if (!existing) throw new Error("Member spiritual gift not found.");

  if (data.isPrimary) {
    return prisma.$transaction(async (tx) => {
      await tx.memberSpiritualGift.updateMany({
        where: { memberId: existing.memberId, NOT: { id } },
        data: { isPrimary: false },
      });
      return tx.memberSpiritualGift.update({
        where: { id },
        data,
        include: { spiritualGift: true },
      });
    });
  }

  return prisma.memberSpiritualGift.update({
    where: { id },
    data,
    include: { spiritualGift: true },
  });
}

export async function deleteMemberSpiritualGift(id: string) {
  const existing = await findMemberSpiritualGiftById(id);
  if (!existing) throw new Error("Member spiritual gift not found.");
  await prisma.memberSpiritualGift.delete({ where: { id } });
  return existing;
}

export async function setPrimaryMemberSpiritualGift(
  id: string,
  memberId: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.memberSpiritualGift.updateMany({
      where: { memberId },
      data: { isPrimary: false },
    });
    return tx.memberSpiritualGift.update({
      where: { id },
      data: { isPrimary: true },
      include: { spiritualGift: true },
    });
  });
}

// ---------------------------------------------------------------------------
// Ministries
// ---------------------------------------------------------------------------

export type MinistryFilters = {
  organizationId: string;
  search?: string;
  ministryType?: MinistryType;
  isActive?: boolean;
};

export async function findMinistries(filters: MinistryFilters) {
  const where: Prisma.MinistryWhereInput = {
    organizationId: filters.organizationId,
    ...(filters.ministryType ? { ministryType: filters.ministryType } : {}),
    ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: "insensitive" } },
            { description: { contains: filters.search, mode: "insensitive" } },
            { location: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  return prisma.ministry.findMany({
    where,
    include: {
      leader: { select: userSelect },
      _count: {
        select: {
          members: {
            where: { status: { in: ["ACTIVE", "INTERESTED", "PAUSED"] } },
          },
        },
      },
      members: {
        where: { isLeader: true, status: { in: ["ACTIVE", "PAUSED"] } },
        include: { member: { select: memberNameSelect } },
        take: 5,
      },
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
}

export async function findMinistryById(organizationId: string, id: string) {
  return prisma.ministry.findFirst({
    where: { id, organizationId },
    include: {
      leader: { select: userSelect },
      members: {
        include: { member: { select: memberNameSelect } },
        orderBy: [{ isLeader: "desc" }, { status: "asc" }, { createdAt: "asc" }],
      },
    },
  });
}

export async function createMinistry(data: {
  organizationId: string;
  name: string;
  description?: string | null;
  ministryType: MinistryType;
  leaderUserId?: string | null;
  isActive?: boolean;
  meetingSchedule?: string | null;
  location?: string | null;
}) {
  return prisma.ministry.create({ data });
}

export async function updateMinistry(
  id: string,
  organizationId: string,
  data: {
    name: string;
    description?: string | null;
    ministryType: MinistryType;
    leaderUserId?: string | null;
    isActive?: boolean;
    meetingSchedule?: string | null;
    location?: string | null;
  },
) {
  const result = await prisma.ministry.updateMany({
    where: { id, organizationId },
    data,
  });
  if (result.count === 0) throw new Error("Ministry not found.");
  return findMinistryById(organizationId, id);
}

export async function countActiveMinistryMembers(ministryId: string) {
  return prisma.memberMinistry.count({
    where: {
      ministryId,
      status: { in: ["ACTIVE", "INTERESTED", "PAUSED"] },
    },
  });
}

export async function deleteMinistry(id: string, organizationId: string) {
  const result = await prisma.ministry.deleteMany({
    where: { id, organizationId },
  });
  if (result.count === 0) throw new Error("Ministry not found.");
}

export async function deactivateMinistry(id: string, organizationId: string) {
  const result = await prisma.ministry.updateMany({
    where: { id, organizationId },
    data: { isActive: false },
  });
  if (result.count === 0) throw new Error("Ministry not found.");
  return findMinistryById(organizationId, id);
}

// ---------------------------------------------------------------------------
// Member ministries
// ---------------------------------------------------------------------------

export async function findMemberMinistries(memberId: string) {
  return prisma.memberMinistry.findMany({
    where: { memberId },
    include: {
      ministry: true,
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

export async function findMemberMinistryById(id: string) {
  return prisma.memberMinistry.findFirst({
    where: { id },
    include: {
      ministry: true,
      member: { select: memberNameSelect },
    },
  });
}

export async function createMemberMinistry(data: {
  memberId: string;
  ministryId: string;
  role: MemberMinistryRole;
  status: MemberMinistryStatus;
  joinedDate?: Date | null;
  endedDate?: Date | null;
  notes?: string | null;
  isLeader?: boolean;
}) {
  return prisma.memberMinistry.create({ data });
}

export async function updateMemberMinistry(
  id: string,
  data: {
    role: MemberMinistryRole;
    status: MemberMinistryStatus;
    joinedDate?: Date | null;
    endedDate?: Date | null;
    notes?: string | null;
    isLeader?: boolean;
  },
) {
  const existing = await findMemberMinistryById(id);
  if (!existing) throw new Error("Ministry assignment not found.");
  return prisma.memberMinistry.update({
    where: { id },
    data,
    include: {
      ministry: true,
      member: { select: memberNameSelect },
    },
  });
}

export async function deleteMemberMinistry(id: string) {
  const existing = await findMemberMinistryById(id);
  if (!existing) throw new Error("Ministry assignment not found.");
  await prisma.memberMinistry.delete({ where: { id } });
  return existing;
}

export async function setMemberAsMinistryLeader(id: string) {
  const existing = await findMemberMinistryById(id);
  if (!existing) throw new Error("Ministry assignment not found.");
  return prisma.memberMinistry.update({
    where: { id },
    data: { isLeader: true, role: "TEAM_LEAD" },
    include: {
      ministry: true,
      member: { select: memberNameSelect },
    },
  });
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export async function findMemberSkills(memberId: string) {
  return prisma.memberSkill.findMany({
    where: { memberId },
    orderBy: [{ skillName: "asc" }],
  });
}

export async function findMemberSkillById(id: string) {
  return prisma.memberSkill.findFirst({
    where: { id },
    include: { member: { select: memberNameSelect } },
  });
}

export async function createMemberSkill(data: {
  memberId: string;
  skillName: string;
  skillCategory?: string | null;
  proficiencyLevel: SkillProficiencyLevel;
  yearsExperience?: number | null;
  isAvailableToServe?: boolean;
  notes?: string | null;
}) {
  return prisma.memberSkill.create({ data });
}

export async function updateMemberSkill(
  id: string,
  data: {
    skillName: string;
    skillCategory?: string | null;
    proficiencyLevel: SkillProficiencyLevel;
    yearsExperience?: number | null;
    isAvailableToServe?: boolean;
    notes?: string | null;
  },
) {
  const existing = await findMemberSkillById(id);
  if (!existing) throw new Error("Skill not found.");
  return prisma.memberSkill.update({
    where: { id },
    data,
    include: { member: { select: memberNameSelect } },
  });
}

export async function deleteMemberSkill(id: string) {
  const existing = await findMemberSkillById(id);
  if (!existing) throw new Error("Skill not found.");
  await prisma.memberSkill.delete({ where: { id } });
  return existing;
}

export async function searchMembersBySkill(filters: {
  organizationId: string;
  skillName?: string;
  skillCategory?: string;
  availableToServeOnly?: boolean;
  search?: string;
}) {
  return prisma.memberSkill.findMany({
    where: {
      member: { organizationId: filters.organizationId },
      ...(filters.skillName
        ? { skillName: { contains: filters.skillName, mode: "insensitive" } }
        : {}),
      ...(filters.skillCategory
        ? {
            skillCategory: {
              contains: filters.skillCategory,
              mode: "insensitive",
            },
          }
        : {}),
      ...(filters.availableToServeOnly ? { isAvailableToServe: true } : {}),
      ...(filters.search
        ? {
            OR: [
              { skillName: { contains: filters.search, mode: "insensitive" } },
              {
                skillCategory: {
                  contains: filters.search,
                  mode: "insensitive",
                },
              },
              {
                member: {
                  OR: [
                    {
                      firstName: {
                        contains: filters.search,
                        mode: "insensitive",
                      },
                    },
                    {
                      lastName: {
                        contains: filters.search,
                        mode: "insensitive",
                      },
                    },
                    {
                      preferredName: {
                        contains: filters.search,
                        mode: "insensitive",
                      },
                    },
                  ],
                },
              },
            ],
          }
        : {}),
    },
    include: {
      member: { select: memberNameSelect },
    },
    orderBy: [{ skillName: "asc" }, { createdAt: "desc" }],
    take: 100,
  });
}

// ---------------------------------------------------------------------------
// Interests
// ---------------------------------------------------------------------------

export async function findMemberInterests(memberId: string) {
  return prisma.memberInterest.findMany({
    where: { memberId },
    orderBy: [{ interestName: "asc" }],
  });
}

export async function findMemberInterestById(id: string) {
  return prisma.memberInterest.findFirst({
    where: { id },
    include: { member: { select: memberNameSelect } },
  });
}

export async function createMemberInterest(data: {
  memberId: string;
  interestName: string;
  interestCategory?: string | null;
  notes?: string | null;
}) {
  return prisma.memberInterest.create({ data });
}

export async function updateMemberInterest(
  id: string,
  data: {
    interestName: string;
    interestCategory?: string | null;
    notes?: string | null;
  },
) {
  const existing = await findMemberInterestById(id);
  if (!existing) throw new Error("Interest not found.");
  return prisma.memberInterest.update({
    where: { id },
    data,
    include: { member: { select: memberNameSelect } },
  });
}

export async function deleteMemberInterest(id: string) {
  const existing = await findMemberInterestById(id);
  if (!existing) throw new Error("Interest not found.");
  await prisma.memberInterest.delete({ where: { id } });
  return existing;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function findMemberDocuments(
  organizationId: string,
  memberId: string,
  options?: { includeConfidential?: boolean },
) {
  return prisma.memberDocument.findMany({
    where: {
      organizationId,
      memberId,
      ...(options?.includeConfidential
        ? {}
        : { isConfidential: false }),
    },
    include: {
      uploadedBy: { select: userSelect },
    },
    orderBy: [{ createdAt: "desc" }],
  });
}

export async function findMemberDocumentById(
  organizationId: string,
  id: string,
) {
  return prisma.memberDocument.findFirst({
    where: { id, organizationId },
    include: {
      member: { select: memberNameSelect },
      uploadedBy: { select: userSelect },
    },
  });
}

export async function createMemberDocument(data: {
  organizationId: string;
  memberId: string;
  documentType: MemberDocumentType;
  title: string;
  description?: string | null;
  fileName: string;
  fileUrl: string;
  fileKey: string;
  mimeType: string;
  fileSize: number;
  isConfidential?: boolean;
  expirationDate?: Date | null;
  uploadedByUserId: string;
}) {
  return prisma.memberDocument.create({ data });
}

export async function updateMemberDocument(
  id: string,
  organizationId: string,
  data: {
    documentType?: MemberDocumentType;
    title?: string;
    description?: string | null;
    isConfidential?: boolean;
    expirationDate?: Date | null;
    fileName?: string;
    fileUrl?: string;
    fileKey?: string;
    mimeType?: string;
    fileSize?: number;
  },
) {
  const result = await prisma.memberDocument.updateMany({
    where: { id, organizationId },
    data,
  });
  if (result.count === 0) throw new Error("Document not found.");
  return findMemberDocumentById(organizationId, id);
}

export async function deleteMemberDocument(
  id: string,
  organizationId: string,
) {
  const existing = await findMemberDocumentById(organizationId, id);
  if (!existing) throw new Error("Document not found.");
  await prisma.memberDocument.delete({ where: { id } });
  return existing;
}

// ---------------------------------------------------------------------------
// Profile aggregate + dashboard
// ---------------------------------------------------------------------------

export async function findMemberEngagementProfile(
  organizationId: string,
  memberId: string,
) {
  const [milestones, gifts, ministries, skills, interests, documents] =
    await Promise.all([
      findMemberMilestones(organizationId, memberId),
      findMemberSpiritualGifts(memberId),
      findMemberMinistries(memberId),
      findMemberSkills(memberId),
      findMemberInterests(memberId),
      findMemberDocuments(organizationId, memberId, {
        includeConfidential: true,
      }),
    ]);

  return { milestones, gifts, ministries, skills, interests, documents };
}

export async function getEngagementDashboardCounts(organizationId: string) {
  const monthStart = startOfMonth();
  const monthEnd = endOfMonth();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const soon = daysFromNow(30);

  const [
    baptismsThisMonth,
    membershipMilestonesThisMonth,
    newMembersByMemberSince,
    availableToServeGroups,
    activeMinistryVolunteers,
    activeMinistries,
    ministriesWithLeaders,
    documentsExpiringSoon,
  ] = await Promise.all([
    prisma.memberMilestone.count({
      where: {
        organizationId,
        milestoneType: "BAPTISM",
        milestoneDate: { gte: monthStart, lte: monthEnd },
      },
    }),
    prisma.memberMilestone.count({
      where: {
        organizationId,
        milestoneType: "MEMBERSHIP",
        milestoneDate: { gte: monthStart, lte: monthEnd },
      },
    }),
    prisma.member.count({
      where: {
        organizationId,
        memberSince: { gte: monthStart, lte: monthEnd },
      },
    }),
    prisma.memberSkill.groupBy({
      by: ["memberId"],
      where: {
        isAvailableToServe: true,
        member: { organizationId },
      },
    }),
    prisma.memberMinistry.count({
      where: {
        status: "ACTIVE",
        ministry: { organizationId, isActive: true },
      },
    }),
    prisma.ministry.findMany({
      where: { organizationId, isActive: true },
      select: {
        id: true,
        leaderUserId: true,
        members: {
          where: { isLeader: true, status: { in: ["ACTIVE", "PAUSED"] } },
          select: { id: true },
          take: 1,
        },
      },
    }),
    prisma.ministry.count({
      where: {
        organizationId,
        isActive: true,
        OR: [
          { leaderUserId: { not: null } },
          {
            members: {
              some: { isLeader: true, status: { in: ["ACTIVE", "PAUSED"] } },
            },
          },
        ],
      },
    }),
    prisma.memberDocument.count({
      where: {
        organizationId,
        expirationDate: { gte: today, lte: soon },
      },
    }),
  ]);

  const ministriesWithoutLeaders = activeMinistries.filter(
    (ministry) => !ministry.leaderUserId && ministry.members.length === 0,
  ).length;

  return {
    baptismsThisMonth,
    newMembersThisMonth: Math.max(
      membershipMilestonesThisMonth,
      newMembersByMemberSince,
    ),
    availableToServe: availableToServeGroups.length,
    activeMinistryVolunteers,
    ministriesWithoutLeaders:
      ministriesWithoutLeaders ||
      Math.max(0, activeMinistries.length - ministriesWithLeaders),
    documentsExpiringSoon,
  };
}

export async function findMemberInOrganization(
  organizationId: string,
  memberId: string,
) {
  return prisma.member.findFirst({
    where: { id: memberId, organizationId },
    select: memberNameSelect,
  });
}
