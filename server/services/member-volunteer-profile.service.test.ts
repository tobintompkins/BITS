import { beforeEach, describe, expect, it, vi } from "vitest";

type MemberRow = {
  id: string;
  organizationId: string;
  userAccountId: string | null;
  recordStatus: string;
  firstName: string;
  lastName: string;
  email: string;
};

type GiftCatalogRow = {
  id: string;
  organizationId: string;
  name: string;
  isActive: boolean;
};

type GiftRow = {
  id: string;
  memberId: string;
  spiritualGiftId: string;
  proficiencyLevel: string;
  notes: string | null;
  isPrimary: boolean;
};

type SkillRow = {
  id: string;
  memberId: string;
  skillName: string;
  proficiencyLevel: string;
  notes: string | null;
  isAvailableToServe: boolean;
};

type InterestRow = {
  id: string;
  memberId: string;
  interestName: string;
  notes: string | null;
};

const store = vi.hoisted(() => ({
  members: [] as MemberRow[],
  gifts: [] as GiftCatalogRow[],
  memberGifts: [] as GiftRow[],
  skills: [] as SkillRow[],
  interests: [] as InterestRow[],
  lastMemberWhere: null as unknown,
  lastGiftWhere: null as unknown,
  lastGiftSelect: null as unknown,
  lastSkillWhere: null as unknown,
  lastSkillSelect: null as unknown,
  lastInterestWhere: null as unknown,
  lastInterestSelect: null as unknown,
}));

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    member: {
      findFirst: async ({
        where,
      }: {
        where: {
          organizationId: string;
          userAccountId: string;
          recordStatus: string;
        };
      }) => {
        store.lastMemberWhere = where;
        const row = store.members.find(
          (item) =>
            item.organizationId === where.organizationId &&
            item.userAccountId === where.userAccountId &&
            item.recordStatus === where.recordStatus,
        );
        return row ? { id: row.id } : null;
      },
    },
    memberSpiritualGift: {
      findMany: async ({
        where,
        select,
      }: {
        where: {
          memberId: string;
          spiritualGift: { organizationId: string; isActive: boolean };
        };
        select: unknown;
      }) => {
        store.lastGiftWhere = where;
        store.lastGiftSelect = select;
        return store.memberGifts
          .filter((row) => {
            const gift = store.gifts.find((item) => item.id === row.spiritualGiftId);
            return (
              row.memberId === where.memberId &&
              gift?.organizationId === where.spiritualGift.organizationId &&
              gift.isActive === where.spiritualGift.isActive
            );
          })
          .sort((left, right) => {
            const leftName =
              store.gifts.find((item) => item.id === left.spiritualGiftId)?.name ??
              "";
            const rightName =
              store.gifts.find((item) => item.id === right.spiritualGiftId)?.name ??
              "";
            return leftName.localeCompare(rightName);
          })
          .map((row) => ({
            proficiencyLevel: row.proficiencyLevel,
            spiritualGift: {
              name: store.gifts.find((item) => item.id === row.spiritualGiftId)?.name,
            },
          }));
      },
    },
    memberSkill: {
      findMany: async ({
        where,
        select,
      }: {
        where: { memberId: string };
        select: unknown;
      }) => {
        store.lastSkillWhere = where;
        store.lastSkillSelect = select;
        return store.skills
          .filter((row) => row.memberId === where.memberId)
          .sort((left, right) => left.skillName.localeCompare(right.skillName))
          .map((row) => ({
            skillName: row.skillName,
            proficiencyLevel: row.proficiencyLevel,
          }));
      },
    },
    memberInterest: {
      findMany: async ({
        where,
        select,
      }: {
        where: { memberId: string };
        select: unknown;
      }) => {
        store.lastInterestWhere = where;
        store.lastInterestSelect = select;
        return store.interests
          .filter((row) => row.memberId === where.memberId)
          .sort((left, right) =>
            left.interestName.localeCompare(right.interestName),
          )
          .map((row) => ({
            interestName: row.interestName,
          }));
      },
    },
  },
}));

import { getMemberVolunteerProfile } from "./member-volunteer-profile.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const OTHER_USER = "00000000-0000-4000-8000-00000000c002";
const MEMBER_ID = "00000000-0000-4000-8000-00000000m001";
const OTHER_MEMBER = "00000000-0000-4000-8000-00000000m002";
const OWN_EMAIL = "ann@church.test";
const TEACHING_ID = "00000000-0000-4000-8000-00000000g001";
const MERCY_ID = "00000000-0000-4000-8000-00000000g002";
const INACTIVE_ID = "00000000-0000-4000-8000-00000000g003";
const OTHER_ORG_GIFT = "00000000-0000-4000-8000-00000000g004";

function seed() {
  store.members = [
    {
      id: MEMBER_ID,
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
      firstName: "Ann",
      lastName: "Adams",
      email: OWN_EMAIL,
    },
    {
      id: OTHER_MEMBER,
      organizationId: ORG_ID,
      userAccountId: OTHER_USER,
      recordStatus: "ACTIVE",
      firstName: "Other",
      lastName: "Person",
      email: "other@church.test",
    },
  ];
  store.gifts = [
    { id: TEACHING_ID, organizationId: ORG_ID, name: "Teaching", isActive: true },
    { id: MERCY_ID, organizationId: ORG_ID, name: "Mercy", isActive: true },
    {
      id: INACTIVE_ID,
      organizationId: ORG_ID,
      name: "Hidden Gift",
      isActive: false,
    },
    {
      id: OTHER_ORG_GIFT,
      organizationId: OTHER_ORG,
      name: "Other Church Gift",
      isActive: true,
    },
  ];
  store.memberGifts = [
    {
      id: "00000000-0000-4000-8000-00000000a011",
      memberId: MEMBER_ID,
      spiritualGiftId: TEACHING_ID,
      proficiencyLevel: "CONFIDENT",
      notes: "staff only gift assessment",
      isPrimary: true,
    },
    {
      id: "00000000-0000-4000-8000-00000000a012",
      memberId: MEMBER_ID,
      spiritualGiftId: MERCY_ID,
      proficiencyLevel: "DEVELOPING",
      notes: "keep private",
      isPrimary: false,
    },
    {
      id: "00000000-0000-4000-8000-00000000a013",
      memberId: MEMBER_ID,
      spiritualGiftId: INACTIVE_ID,
      proficiencyLevel: "STRONG",
      notes: "retired gift note",
      isPrimary: false,
    },
    {
      id: "00000000-0000-4000-8000-00000000a014",
      memberId: OTHER_MEMBER,
      spiritualGiftId: TEACHING_ID,
      proficiencyLevel: "MENTOR",
      notes: "other member gift note",
      isPrimary: true,
    },
    {
      id: "00000000-0000-4000-8000-00000000a015",
      memberId: MEMBER_ID,
      spiritualGiftId: OTHER_ORG_GIFT,
      proficiencyLevel: "STRONG",
      notes: "wrong org",
      isPrimary: false,
    },
  ];
  store.skills = [
    {
      id: "00000000-0000-4000-8000-00000000s001",
      memberId: MEMBER_ID,
      skillName: "Sound Board",
      proficiencyLevel: "ADVANCED",
      notes: "staff only skill memo",
      isAvailableToServe: true,
    },
    {
      id: "00000000-0000-4000-8000-00000000s002",
      memberId: MEMBER_ID,
      skillName: "Childcare",
      proficiencyLevel: "INTERMEDIATE",
      notes: null,
      isAvailableToServe: false,
    },
    {
      id: "00000000-0000-4000-8000-00000000s003",
      memberId: OTHER_MEMBER,
      skillName: "Other Person Piano",
      proficiencyLevel: "EXPERT",
      notes: "do not expose",
      isAvailableToServe: true,
    },
  ];
  store.interests = [
    {
      id: "00000000-0000-4000-8000-00000000i001",
      memberId: MEMBER_ID,
      interestName: "Hospitality Team",
      notes: "staff only interest memo",
    },
    {
      id: "00000000-0000-4000-8000-00000000i002",
      memberId: OTHER_MEMBER,
      interestName: "Other Person Outreach",
      notes: "hidden interest",
    },
  ];
  store.lastMemberWhere = null;
  store.lastGiftWhere = null;
  store.lastGiftSelect = null;
  store.lastSkillWhere = null;
  store.lastSkillSelect = null;
  store.lastInterestWhere = null;
  store.lastInterestSelect = null;
}

describe("member volunteer profile", () => {
  beforeEach(() => {
    seed();
    vi.clearAllMocks();
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: USER_ID,
      primaryEmail: OWN_EMAIL,
      displayName: "Ann Adams",
    });
    mocks.findPrimaryOrganization.mockResolvedValue({
      id: ORG_ID,
      name: "First United Pentecostal Church of Saco",
    });
  });

  it("returns signed out without querying volunteer records", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(getMemberVolunteerProfile()).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastMemberWhere).toBeNull();
    expect(store.lastGiftWhere).toBeNull();
  });

  it("returns no organization without querying volunteer records", async () => {
    mocks.findPrimaryOrganization.mockResolvedValue(null);
    await expect(getMemberVolunteerProfile()).resolves.toEqual({
      status: "NO_ORGANIZATION",
    });
    expect(store.lastMemberWhere).toBeNull();
  });

  it("returns pending when no safe member portal link exists", async () => {
    store.members[0] = { ...store.members[0], userAccountId: null };
    await expect(getMemberVolunteerProfile()).resolves.toEqual({
      status: "CONNECTION_PENDING",
      accountEmail: OWN_EMAIL,
    });
    expect(store.lastGiftWhere).toBeNull();
    expect(store.lastSkillWhere).toBeNull();
    expect(store.lastInterestWhere).toBeNull();
  });

  it("scopes to the current organization and linked member without name or email", async () => {
    await getMemberVolunteerProfile();
    expect(store.lastMemberWhere).toEqual({
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
    });
    expect(store.lastGiftWhere).toEqual({
      memberId: MEMBER_ID,
      spiritualGift: { organizationId: ORG_ID, isActive: true },
    });
    expect(store.lastSkillWhere).toEqual({ memberId: MEMBER_ID });
    expect(store.lastInterestWhere).toEqual({ memberId: MEMBER_ID });
    const memberWhere = JSON.stringify(store.lastMemberWhere);
    expect(memberWhere).not.toContain("email");
    expect(memberWhere).not.toContain(OWN_EMAIL);
    expect(memberWhere).not.toContain("Ann");
  });

  it("returns only active own records and omits other members and inactive gifts", async () => {
    const result = await getMemberVolunteerProfile();
    expect(result).toEqual({
      status: "READY",
      gifts: [
        { name: "Mercy", levelLabel: "Developing" },
        { name: "Teaching", levelLabel: "Confident" },
      ],
      skills: [
        { name: "Childcare", levelLabel: "Intermediate" },
        { name: "Sound Board", levelLabel: "Advanced" },
      ],
      interests: [{ name: "Hospitality Team" }],
    });
    const text = JSON.stringify(result);
    expect(text).not.toContain("Hidden Gift");
    expect(text).not.toContain("Other Church Gift");
    expect(text).not.toContain("Other Person Piano");
    expect(text).not.toContain("Other Person Outreach");
    expect(text).not.toContain(OTHER_MEMBER);
  });

  it("returns only the safe field allow-list and omits private notes", async () => {
    const result = await getMemberVolunteerProfile();
    expect(store.lastGiftSelect).toEqual({
      proficiencyLevel: true,
      spiritualGift: { select: { name: true } },
    });
    expect(store.lastSkillSelect).toEqual({
      skillName: true,
      proficiencyLevel: true,
    });
    expect(store.lastInterestSelect).toEqual({
      interestName: true,
    });
    const text = JSON.stringify(result);
    expect(text).not.toContain("staff only gift assessment");
    expect(text).not.toContain("staff only skill memo");
    expect(text).not.toContain("staff only interest memo");
    expect(text).not.toContain("isAvailableToServe");
    expect(text).not.toContain("isPrimary");
    expect(text).not.toMatch(/notes/);
    expect(text).not.toContain(MEMBER_ID);
    expect(text).not.toContain(USER_ID);
  });

  it("returns empty ready sections when the linked member has no records", async () => {
    store.memberGifts = [];
    store.skills = [];
    store.interests = [];
    await expect(getMemberVolunteerProfile()).resolves.toEqual({
      status: "READY",
      gifts: [],
      skills: [],
      interests: [],
    });
  });
});
