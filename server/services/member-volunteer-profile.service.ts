import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  formatEngagementEnumLabel,
  giftProficiencyLevelOptions,
  skillProficiencyLevelOptions,
} from "@/lib/constants/member-engagement";
import { prisma } from "@/lib/db/prisma";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type MemberVolunteerGift = {
  name: string;
  levelLabel: string;
};

export type MemberVolunteerSkill = {
  name: string;
  levelLabel: string;
};

export type MemberVolunteerInterest = {
  name: string;
};

export type MemberVolunteerProfileResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "CONNECTION_PENDING"; accountEmail: string }
  | {
      status: "READY";
      gifts: MemberVolunteerGift[];
      skills: MemberVolunteerSkill[];
      interests: MemberVolunteerInterest[];
    };

const giftSelect = {
  proficiencyLevel: true,
  spiritualGift: {
    select: {
      name: true,
    },
  },
} as const;

const skillSelect = {
  skillName: true,
  proficiencyLevel: true,
} as const;

const interestSelect = {
  interestName: true,
} as const;

/**
 * Read-only gifts, skills, and interests for the signed-in linked member.
 * Account, organization, and member are resolved server-side only.
 */
export async function getMemberVolunteerProfile(): Promise<MemberVolunteerProfileResult> {
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

  const [gifts, skills, interests] = await Promise.all([
    prisma.memberSpiritualGift.findMany({
      where: {
        memberId: member.id,
        spiritualGift: {
          organizationId: organization.id,
          isActive: true,
        },
      },
      orderBy: { spiritualGift: { name: "asc" } },
      select: giftSelect,
    }),
    prisma.memberSkill.findMany({
      where: { memberId: member.id },
      orderBy: { skillName: "asc" },
      select: skillSelect,
    }),
    prisma.memberInterest.findMany({
      where: { memberId: member.id },
      orderBy: { interestName: "asc" },
      select: interestSelect,
    }),
  ]);

  return {
    status: "READY",
    gifts: gifts.map((row) => ({
      name: row.spiritualGift.name,
      levelLabel: formatEngagementEnumLabel(
        giftProficiencyLevelOptions,
        row.proficiencyLevel,
      ),
    })),
    skills: skills.map((row) => ({
      name: row.skillName,
      levelLabel: formatEngagementEnumLabel(
        skillProficiencyLevelOptions,
        row.proficiencyLevel,
      ),
    })),
    interests: interests.map((row) => ({
      name: row.interestName,
    })),
  };
}
