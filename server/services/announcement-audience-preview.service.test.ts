import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoleCode } from "@/app/generated/prisma/client";
import {
  announcementAudiencePreviewNavItems,
  countAnnouncementAudience,
} from "@/lib/validation/announcement-audience-preview";
import * as audienceService from "./announcement-audience-preview.service";

type MemberRow = {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  recordStatus: "ACTIVE" | "INACTIVE" | "ARCHIVED" | "DECEASED" | "MERGED";
  allowEmail: boolean;
  allowSms: boolean;
  emailOptOutDate: Date | null;
};

type AnnouncementRow = {
  id: string;
  organizationId: string;
  title: string;
  body: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  publishedAt: Date | null;
  createdByUserAccountId: string;
};

type MinistryRow = {
  id: string;
  organizationId: string;
  name: string;
  isActive: boolean;
  description: string | null;
  leaderUserId: string | null;
};

type AssignmentRow = {
  memberId: string;
  ministryId: string;
  status: "ACTIVE" | "PAUSED" | "INACTIVE" | "INTERESTED" | "COMPLETED";
  endedDate: Date | null;
  notes: string | null;
};

const store = vi.hoisted(() => ({
  members: [] as MemberRow[],
  announcements: [] as AnnouncementRow[],
  ministries: [] as MinistryRow[],
  assignments: [] as AssignmentRow[],
  lastMemberWhere: null as unknown,
  lastMemberSelect: null as unknown,
  lastAnnouncementWhere: null as unknown,
  lastAnnouncementSelect: null as unknown,
  lastMinistryWhere: null as unknown,
  lastMinistrySelect: null as unknown,
  writeCalls: 0,
}));

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
  getAnnouncementAccess: vi.fn(),
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/auth/announcement-permissions", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/auth/announcement-permissions")
  >("@/lib/auth/announcement-permissions");
  return {
    ...actual,
    getAnnouncementAccess: mocks.getAnnouncementAccess,
  };
});

vi.mock("@/lib/db/prisma", () => {
  function bumpWrite() {
    store.writeCalls += 1;
    throw new Error("preview must not write");
  }

  return {
    prisma: {
      member: {
        findMany: async ({
          where,
          select,
        }: {
          where: {
            organizationId: string;
            recordStatus?: string;
            ministries?: {
              some: {
                ministryId?: string;
                status?: string;
                endedDate?: null;
              };
            };
          };
          select?: Record<string, boolean>;
        }) => {
          store.lastMemberWhere = where;
          store.lastMemberSelect = select;
          return store.members
            .filter((row) => {
              if (row.organizationId !== where.organizationId) return false;
              if (where.recordStatus && row.recordStatus !== where.recordStatus) {
                return false;
              }
              if (where.ministries?.some) {
                const some = where.ministries.some;
                const assigned = store.assignments.some((assignment) => {
                  if (assignment.memberId !== row.id) return false;
                  if (
                    some.ministryId &&
                    assignment.ministryId !== some.ministryId
                  ) {
                    return false;
                  }
                  if (some.status && assignment.status !== some.status) {
                    return false;
                  }
                  if (some.endedDate === null && assignment.endedDate != null) {
                    return false;
                  }
                  return true;
                });
                if (!assigned) return false;
              }
              return true;
            })
            .map((row) => {
              if (!select) return row;
              return Object.fromEntries(
                Object.entries(select)
                  .filter(([, included]) => included)
                  .map(([key]) => [key, row[key as keyof MemberRow]]),
              );
            });
        },
        create: bumpWrite,
        update: bumpWrite,
        delete: bumpWrite,
        deleteMany: bumpWrite,
      },
      churchAnnouncement: {
        findMany: async ({
          where,
          select,
        }: {
          where: {
            organizationId: string;
            status?: string;
            publishedAt?: { not: null };
          };
          select?: Record<string, boolean>;
        }) => {
          store.lastAnnouncementWhere = where;
          store.lastAnnouncementSelect = select;
          return store.announcements
            .filter((row) => {
              if (row.organizationId !== where.organizationId) return false;
              if (where.status && row.status !== where.status) return false;
              if (where.publishedAt?.not === null && !row.publishedAt) {
                return false;
              }
              return true;
            })
            .map((row) => {
              if (!select) return row;
              return Object.fromEntries(
                Object.entries(select)
                  .filter(([, included]) => included)
                  .map(([key]) => [key, row[key as keyof AnnouncementRow]]),
              );
            });
        },
        create: bumpWrite,
        update: bumpWrite,
        delete: bumpWrite,
      },
      memberCommunication: {
        create: bumpWrite,
      },
      ministry: {
        findMany: async ({
          where,
          select,
        }: {
          where: { organizationId: string; isActive?: boolean };
          select?: Record<string, boolean>;
        }) => {
          store.lastMinistryWhere = where;
          store.lastMinistrySelect = select;
          return store.ministries
            .filter((row) => {
              if (row.organizationId !== where.organizationId) return false;
              if (where.isActive != null && row.isActive !== where.isActive) {
                return false;
              }
              return true;
            })
            .sort((left, right) => left.name.localeCompare(right.name))
            .map((row) => {
              if (!select) return row;
              return Object.fromEntries(
                Object.entries(select)
                  .filter(([, included]) => included)
                  .map(([key]) => [key, row[key as keyof MinistryRow]]),
              );
            });
        },
        create: bumpWrite,
        update: bumpWrite,
        delete: bumpWrite,
      },
      memberMinistry: {
        create: bumpWrite,
        update: bumpWrite,
        delete: bumpWrite,
      },
    },
  };
});

import { getAnnouncementAudiencePreview } from "./announcement-audience-preview.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const WORSHIP_ID = "00000000-0000-4000-8000-00000000f001";
const YOUTH_ID = "00000000-0000-4000-8000-00000000f002";
const INACTIVE_MINISTRY_ID = "00000000-0000-4000-8000-00000000f003";
const OTHER_MINISTRY_ID = "00000000-0000-4000-8000-00000000f099";

function announcementAccess(overrides?: {
  canManageAnnouncements?: boolean;
  roleCode?: RoleCode | null;
  isSuperAdmin?: boolean;
}) {
  return {
    canManageAnnouncements: overrides?.canManageAnnouncements ?? true,
    roleCode: overrides?.roleCode ?? RoleCode.ORG_ADMIN,
    isSuperAdmin: overrides?.isSuperAdmin ?? false,
    userAccountId: USER_ID,
  };
}

function member(overrides: Partial<MemberRow> = {}): MemberRow {
  return {
    id: "00000000-0000-4000-8000-00000000m001",
    organizationId: ORG_ID,
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    phone: "555-0100",
    notes: "Private pastoral note",
    recordStatus: "ACTIVE",
    allowEmail: true,
    allowSms: true,
    emailOptOutDate: null,
    ...overrides,
  };
}

function ministry(overrides: Partial<MinistryRow> = {}): MinistryRow {
  return {
    id: WORSHIP_ID,
    organizationId: ORG_ID,
    name: "Worship Team",
    isActive: true,
    description: "Internal worship notes",
    leaderUserId: USER_ID,
    ...overrides,
  };
}

function assignment(overrides: Partial<AssignmentRow> = {}): AssignmentRow {
  return {
    memberId: "00000000-0000-4000-8000-00000000m001",
    ministryId: WORSHIP_ID,
    status: "ACTIVE",
    endedDate: null,
    notes: "Secret assignment note",
    ...overrides,
  };
}

function announcement(overrides: Partial<AnnouncementRow> = {}): AnnouncementRow {
  return {
    id: "00000000-0000-4000-8000-00000000e001",
    organizationId: ORG_ID,
    title: "Easter service times",
    body: "Join us on Sunday morning.",
    status: "PUBLISHED",
    publishedAt: new Date("2026-09-20T12:00:00.000Z"),
    createdByUserAccountId: USER_ID,
    ...overrides,
  };
}

beforeEach(() => {
  store.members = [];
  store.announcements = [];
  store.ministries = [];
  store.assignments = [];
  store.lastMemberWhere = null;
  store.lastMemberSelect = null;
  store.lastAnnouncementWhere = null;
  store.lastAnnouncementSelect = null;
  store.lastMinistryWhere = null;
  store.lastMinistrySelect = null;
  store.writeCalls = 0;
  mocks.getOrCreateUserAccount.mockReset();
  mocks.findPrimaryOrganization.mockReset();
  mocks.getAnnouncementAccess.mockReset();
  mocks.getOrCreateUserAccount.mockResolvedValue({
    id: USER_ID,
    displayName: "Pat Admin",
    primaryEmail: "pat@example.com",
  });
  mocks.findPrimaryOrganization.mockResolvedValue({
    id: ORG_ID,
    name: "Grace Church",
  });
  mocks.getAnnouncementAccess.mockResolvedValue(announcementAccess());
});

describe("announcement audience navigation", () => {
  it("is available only to announcement managers", () => {
    expect(announcementAudiencePreviewNavItems(false)).toEqual([]);
    expect(announcementAudiencePreviewNavItems(true)).toEqual([
      {
        href: "/announcements/audience",
        label: "Announcement Audience Preview",
      },
    ]);
  });
});

describe("countAnnouncementAudience", () => {
  it("counts eligibility and exclusions without overlapping buckets", () => {
    expect(
      countAnnouncementAudience([
        {
          email: "a@example.com",
          phone: "555-0101",
          allowEmail: true,
          allowSms: true,
        },
        {
          email: "b@example.com",
          phone: "555-0102",
          allowEmail: false,
          allowSms: true,
        },
        {
          email: null,
          phone: "555-0103",
          allowEmail: true,
          allowSms: false,
        },
        {
          email: "   ",
          phone: null,
          allowEmail: false,
          allowSms: true,
        },
      ]),
    ).toEqual({
      activeMembers: 4,
      emailEligible: 1,
      emailExcludedOptOut: 1,
      emailExcludedMissingAddress: 2,
      textEligible: 2,
      textExcludedOptOut: 1,
      textExcludedMissingPhone: 1,
    });
  });
});

describe("getAnnouncementAudiencePreview", () => {
  it("requires existing announcement-management access", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    expect(await getAnnouncementAudiencePreview()).toEqual({
      status: "SIGNED_OUT",
    });

    mocks.findPrimaryOrganization.mockResolvedValueOnce(null);
    expect(await getAnnouncementAudiencePreview()).toEqual({
      status: "NO_ORGANIZATION",
    });

    mocks.getAnnouncementAccess.mockResolvedValueOnce(
      announcementAccess({
        canManageAnnouncements: false,
        roleCode: RoleCode.DATA_ENTRY,
      }),
    );
    expect(await getAnnouncementAudiencePreview()).toEqual({
      status: "UNAUTHORIZED",
    });
  });

  it("scopes members and announcements to the current organization", async () => {
    store.members = [
      member(),
      member({
        id: "00000000-0000-4000-8000-00000000m099",
        organizationId: OTHER_ORG,
        email: "other-church@example.com",
        firstName: "Other",
        lastName: "Parish",
      }),
    ];
    store.announcements = [
      announcement(),
      announcement({
        id: "00000000-0000-4000-8000-00000000e099",
        organizationId: OTHER_ORG,
        title: "Other church picnic",
      }),
    ];

    const view = await getAnnouncementAudiencePreview();
    expect(store.lastMemberWhere).toEqual({
      organizationId: ORG_ID,
      recordStatus: "ACTIVE",
    });
    expect(store.lastAnnouncementWhere).toMatchObject({
      organizationId: ORG_ID,
      status: "PUBLISHED",
    });
    expect(view.status).toBe("READY");
    if (view.status !== "READY") return;
    expect(view.counts.activeMembers).toBe(1);
    expect(view.publishedAnnouncements).toHaveLength(1);
    expect(view.publishedAnnouncements[0]?.title).toBe("Easter service times");
    const payload = JSON.stringify(view);
    expect(payload).not.toContain("other-church@example.com");
    expect(payload).not.toContain("Other church picnic");
  });

  it("excludes archived, inactive, and other non-active members from counts", async () => {
    store.members = [
      member({ email: "active@example.com", phone: "555-0100" }),
      member({
        id: "00000000-0000-4000-8000-00000000m002",
        recordStatus: "ARCHIVED",
        email: "archived@example.com",
        phone: "555-0101",
      }),
      member({
        id: "00000000-0000-4000-8000-00000000m003",
        recordStatus: "INACTIVE",
        email: "inactive@example.com",
        phone: "555-0102",
      }),
      member({
        id: "00000000-0000-4000-8000-00000000m004",
        recordStatus: "MERGED",
        email: "merged@example.com",
      }),
    ];

    const view = await getAnnouncementAudiencePreview();
    expect(view.status).toBe("READY");
    if (view.status !== "READY") return;
    expect(view.counts).toEqual({
      activeMembers: 1,
      emailEligible: 1,
      emailExcludedOptOut: 0,
      emailExcludedMissingAddress: 0,
      textEligible: 1,
      textExcludedOptOut: 0,
      textExcludedMissingPhone: 0,
    });
    const payload = JSON.stringify(view);
    expect(payload).not.toContain("archived@example.com");
    expect(payload).not.toContain("inactive@example.com");
    expect(payload).not.toContain("merged@example.com");
  });

  it("returns only aggregate counts and never names, emails, phones, notes, or opt-out dates", async () => {
    store.members = [
      member({
        allowEmail: false,
        emailOptOutDate: new Date("2026-08-01T00:00:00.000Z"),
      }),
      member({
        id: "00000000-0000-4000-8000-00000000m005",
        firstName: "Grace",
        lastName: "Hopper",
        email: null,
        phone: "555-0199",
        allowSms: false,
        notes: "Do not mention this note",
      }),
    ];
    store.announcements = [announcement()];

    const view = await getAnnouncementAudiencePreview();
    expect(view.status).toBe("READY");
    if (view.status !== "READY") return;
    expect(view.counts.activeMembers).toBe(2);
    expect(view.counts.emailEligible).toBe(0);
    expect(view.counts.emailExcludedOptOut).toBe(1);
    expect(view.counts.emailExcludedMissingAddress).toBe(1);
    expect(view.counts.textEligible).toBe(1);
    expect(view.counts.textExcludedOptOut).toBe(1);
    expect(store.lastMemberSelect).toEqual({
      email: true,
      phone: true,
      allowEmail: true,
      allowSms: true,
    });
    const payload = JSON.stringify(view);
    expect(payload).not.toContain("Ada");
    expect(payload).not.toContain("Lovelace");
    expect(payload).not.toContain("Grace");
    expect(payload).not.toContain("Hopper");
    expect(payload).not.toContain("ada@example.com");
    expect(payload).not.toContain("555-0100");
    expect(payload).not.toContain("555-0199");
    expect(payload).not.toContain("Private pastoral note");
    expect(payload).not.toContain("Do not mention this note");
    expect(payload).not.toContain("emailOptOutDate");
    expect(payload).not.toContain("2026-08-01");
    expect(payload).not.toContain("pat@example.com");
    expect(payload).not.toContain(USER_ID);
    expect(payload).not.toContain("createdByUserAccountId");
  });

  it("lists published announcements with safe fields only", async () => {
    store.announcements = [
      announcement(),
      announcement({
        id: "00000000-0000-4000-8000-00000000e002",
        title: "Draft only",
        status: "DRAFT",
        publishedAt: null,
        body: "Secret draft body",
      }),
      announcement({
        id: "00000000-0000-4000-8000-00000000e003",
        title: "Archived picnic",
        status: "ARCHIVED",
        publishedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ];

    const view = await getAnnouncementAudiencePreview();
    expect(view.status).toBe("READY");
    if (view.status !== "READY") return;
    expect(view.publishedAnnouncements).toEqual([
      {
        id: "00000000-0000-4000-8000-00000000e001",
        title: "Easter service times",
        publishedAtLabel: "Sep 20, 2026",
        href: "/announcements",
      },
    ]);
    expect(store.lastAnnouncementSelect).toEqual({
      id: true,
      title: true,
      publishedAt: true,
    });
    const payload = JSON.stringify(view);
    expect(payload).not.toContain("Draft only");
    expect(payload).not.toContain("Secret draft body");
    expect(payload).not.toContain("Archived picnic");
    expect(payload).not.toContain("Join us on Sunday morning.");
  });

  it("does not mutate members, announcements, or communication records", async () => {
    store.members = [member()];
    const view = await getAnnouncementAudiencePreview();
    expect(view.status).toBe("READY");
    expect(store.writeCalls).toBe(0);
    expect(audienceService).not.toHaveProperty("sendAnnouncement");
    expect(audienceService).not.toHaveProperty("createMailingList");
    expect(audienceService).not.toHaveProperty("markAnnouncementDelivered");
    expect(audienceService).not.toHaveProperty("updateCommunicationPreferences");
  });

  it("describes the general active-member audience when no ministry is selected", async () => {
    store.members = [member()];
    const view = await getAnnouncementAudiencePreview();
    expect(view.status).toBe("READY");
    if (view.status !== "READY") return;
    expect(view.selectedMinistry).toBeNull();
    expect(view.scopeLabel).toBe("Showing all active members.");
    expect(view.ministries).toEqual([]);
    expect(store.lastMemberWhere).toEqual({
      organizationId: ORG_ID,
      recordStatus: "ACTIVE",
    });
  });
});

describe("ministry audience preview", () => {
  const graceId = "00000000-0000-4000-8000-00000000m005";
  const inactiveMemberId = "00000000-0000-4000-8000-00000000m006";
  const youthOnlyId = "00000000-0000-4000-8000-00000000m007";
  const pausedId = "00000000-0000-4000-8000-00000000m008";
  const endedId = "00000000-0000-4000-8000-00000000m009";

  function seedMinistryRoster() {
    store.ministries = [
      ministry({ id: YOUTH_ID, name: "Youth" }),
      ministry({ name: "Worship Team" }),
      ministry({
        id: INACTIVE_MINISTRY_ID,
        name: "Old Choir",
        isActive: false,
      }),
      ministry({
        id: OTHER_MINISTRY_ID,
        organizationId: OTHER_ORG,
        name: "Other Outreach",
      }),
    ];
    store.members = [
      member(),
      member({
        id: graceId,
        firstName: "Grace",
        lastName: "Hopper",
        email: null,
        phone: "555-0199",
        allowSms: false,
        notes: "Do not mention this note",
      }),
      member({
        id: inactiveMemberId,
        firstName: "Inactive",
        lastName: "Volunteer",
        recordStatus: "INACTIVE",
        email: "inactive-volunteer@example.com",
      }),
      member({
        id: youthOnlyId,
        firstName: "Youth",
        lastName: "Helper",
        email: "youth-helper@example.com",
        phone: "555-0200",
      }),
      member({
        id: pausedId,
        firstName: "Paused",
        lastName: "Singer",
        email: "paused-singer@example.com",
      }),
      member({
        id: endedId,
        firstName: "Former",
        lastName: "Member",
        email: "former-member@example.com",
      }),
    ];
    store.assignments = [
      assignment(),
      assignment({ memberId: graceId, notes: "Nursery backup note" }),
      assignment({ memberId: inactiveMemberId }),
      assignment({ memberId: youthOnlyId, ministryId: YOUTH_ID }),
      assignment({ memberId: pausedId, status: "PAUSED" }),
      assignment({
        memberId: endedId,
        endedDate: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ];
  }

  it("lists current-organization active ministries only, alphabetically", async () => {
    seedMinistryRoster();
    const view = await getAnnouncementAudiencePreview();
    expect(view.status).toBe("READY");
    if (view.status !== "READY") return;
    expect(store.lastMinistryWhere).toEqual({
      organizationId: ORG_ID,
      isActive: true,
    });
    expect(store.lastMinistrySelect).toEqual({ id: true, name: true });
    expect(view.ministries).toEqual([
      { id: WORSHIP_ID, name: "Worship Team" },
      { id: YOUTH_ID, name: "Youth" },
    ]);
    const payload = JSON.stringify(view);
    expect(payload).not.toContain("Old Choir");
    expect(payload).not.toContain("Other Outreach");
    expect(payload).not.toContain("Internal worship notes");
    expect(payload).not.toContain(USER_ID);
  });

  it("rejects invalid, inactive, and other-organization ministry ids", async () => {
    seedMinistryRoster();
    expect(await getAnnouncementAudiencePreview({ ministryId: "not-a-uuid" })).toEqual({
      status: "INVALID_FILTER",
      ministries: [
        { id: WORSHIP_ID, name: "Worship Team" },
        { id: YOUTH_ID, name: "Youth" },
      ],
    });
    expect(store.lastMemberWhere).toBeNull();

    expect(
      await getAnnouncementAudiencePreview({ ministryId: INACTIVE_MINISTRY_ID }),
    ).toMatchObject({ status: "INVALID_FILTER" });
    expect(
      await getAnnouncementAudiencePreview({ ministryId: OTHER_MINISTRY_ID }),
    ).toMatchObject({ status: "INVALID_FILTER" });
    expect(store.lastMemberWhere).toBeNull();
  });

  it("counts only active members with an active current assignment", async () => {
    seedMinistryRoster();
    const view = await getAnnouncementAudiencePreview({
      ministryId: WORSHIP_ID,
    });
    expect(view.status).toBe("READY");
    if (view.status !== "READY") return;
    expect(store.lastMemberWhere).toEqual({
      organizationId: ORG_ID,
      recordStatus: "ACTIVE",
      ministries: {
        some: {
          ministryId: WORSHIP_ID,
          status: "ACTIVE",
          endedDate: null,
        },
      },
    });
    expect(view.selectedMinistry).toEqual({
      id: WORSHIP_ID,
      name: "Worship Team",
    });
    expect(view.scopeLabel).toBe(
      "Showing active members assigned to Worship Team.",
    );
    expect(view.counts).toEqual({
      activeMembers: 2,
      emailEligible: 1,
      emailExcludedOptOut: 0,
      emailExcludedMissingAddress: 1,
      textEligible: 1,
      textExcludedOptOut: 1,
      textExcludedMissingPhone: 0,
    });
  });

  it("keeps the global preview unchanged when a ministry is not selected", async () => {
    seedMinistryRoster();
    const view = await getAnnouncementAudiencePreview();
    expect(view.status).toBe("READY");
    if (view.status !== "READY") return;
    expect(view.counts.activeMembers).toBe(5);
    expect(view.selectedMinistry).toBeNull();
    expect(store.lastMemberWhere).toEqual({
      organizationId: ORG_ID,
      recordStatus: "ACTIVE",
    });
  });

  it("does not return member names, emails, phones, ids, or assignment notes", async () => {
    seedMinistryRoster();
    const view = await getAnnouncementAudiencePreview({
      ministryId: WORSHIP_ID,
    });
    expect(view.status).toBe("READY");
    if (view.status !== "READY") return;
    const payload = JSON.stringify(view);
    expect(payload).not.toContain("Ada");
    expect(payload).not.toContain("Lovelace");
    expect(payload).not.toContain("Grace");
    expect(payload).not.toContain("Hopper");
    expect(payload).not.toContain("ada@example.com");
    expect(payload).not.toContain("youth-helper@example.com");
    expect(payload).not.toContain("inactive-volunteer@example.com");
    expect(payload).not.toContain("555-0100");
    expect(payload).not.toContain("555-0199");
    expect(payload).not.toContain("Private pastoral note");
    expect(payload).not.toContain("Secret assignment note");
    expect(payload).not.toContain("Nursery backup note");
    expect(payload).not.toContain(graceId);
    expect(payload).not.toContain("00000000-0000-4000-8000-00000000m001");
    expect(payload).toContain("Worship Team");
  });

  it("does not mutate ministry assignments while previewing", async () => {
    seedMinistryRoster();
    const view = await getAnnouncementAudiencePreview({
      ministryId: WORSHIP_ID,
    });
    expect(view.status).toBe("READY");
    expect(store.writeCalls).toBe(0);
  });
});

