import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  EVENT_LOCATION_CONFLICT_ACTIVE_STATUSES,
  EVENT_LOCATION_CONFLICT_EVENT_FIELDS,
  EVENT_LOCATION_CONFLICT_PAIR_FIELDS,
  EVENT_LOCATION_CONFLICT_REVIEW_WINDOW_DAYS,
  eventLocationConflictReviewWhere,
  eventTimesOverlap,
} from "@/lib/validation/event-location-conflicts";

type EventRow = {
  id: string;
  organizationId: string;
  locationId: string | null;
  title: string;
  description: string | null;
  eventStatus: string;
  startDateTime: Date;
  endDateTime: Date;
  timezone: string;
  isAllDay: boolean;
  locationName: string | null;
  locationOrganizationId: string | null;
  registrationNote: string | null;
};

const store = vi.hoisted(() => ({
  events: [] as EventRow[],
  lastEventWhere: null as unknown,
  lastEventSelect: null as unknown,
  lastEventOrderBy: null as unknown,
}));

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
  getEventAccess: vi.fn(),
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/auth/event-permissions", () => ({
  getEventAccess: mocks.getEventAccess,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    event: {
      findMany: async ({
        where,
        select,
        orderBy,
      }: {
        where: {
          organizationId: string;
          locationId: { not: null };
          eventStatus: { in: string[] };
          startDateTime: { lt: Date };
          endDateTime: { gt: Date };
        };
        select: unknown;
        orderBy: unknown;
      }) => {
        store.lastEventWhere = where;
        store.lastEventSelect = select;
        store.lastEventOrderBy = orderBy;
        const allowed = new Set(where.eventStatus.in);
        return store.events
          .filter(
            (row) =>
              row.organizationId === where.organizationId &&
              row.locationId != null &&
              allowed.has(row.eventStatus) &&
              row.startDateTime.getTime() < where.startDateTime.lt.getTime() &&
              row.endDateTime.getTime() > where.endDateTime.gt.getTime(),
          )
          .sort(
            (left, right) =>
              left.startDateTime.getTime() - right.startDateTime.getTime(),
          )
          .map((row) => ({
            id: row.id,
            title: row.title,
            startDateTime: row.startDateTime,
            endDateTime: row.endDateTime,
            timezone: row.timezone,
            isAllDay: row.isAllDay,
            locationId: row.locationId,
            location:
              row.locationId && row.locationName && row.locationOrganizationId
                ? {
                    id: row.locationId,
                    name: row.locationName,
                    organizationId: row.locationOrganizationId,
                  }
                : null,
          }));
      },
    },
  },
}));

import { getEventLocationConflicts } from "./event-location-conflicts.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const SANCTUARY = "00000000-0000-4000-8000-00000000b001";
const FELLOWSHIP = "00000000-0000-4000-8000-00000000b002";
const YOUTH_ROOM = "00000000-0000-4000-8000-00000000b003";
const OTHER_ORG_ROOM = "00000000-0000-4000-8000-00000000b004";

const EARLY_ID = "00000000-0000-4000-8000-00000000e001";
const MID_ID = "00000000-0000-4000-8000-00000000e002";
const TOUCH_ID = "00000000-0000-4000-8000-00000000e003";
const HALL_ID = "00000000-0000-4000-8000-00000000e004";
const YOUTH_A_ID = "00000000-0000-4000-8000-00000000e005";
const YOUTH_B_ID = "00000000-0000-4000-8000-00000000e006";
const LATER_A_ID = "00000000-0000-4000-8000-00000000e007";
const LATER_B_ID = "00000000-0000-4000-8000-00000000e008";
const CANCELLED_ID = "00000000-0000-4000-8000-00000000e009";
const ARCHIVED_ID = "00000000-0000-4000-8000-00000000e00a";
const COMPLETED_ID = "00000000-0000-4000-8000-00000000e00b";
const NO_LOCATION_ID = "00000000-0000-4000-8000-00000000e00c";
const OUT_OF_WINDOW_ID = "00000000-0000-4000-8000-00000000e00d";
const OTHER_ORG_ID = "00000000-0000-4000-8000-00000000e00e";

const NOW = new Date("2026-09-29T15:00:00.000Z");
const TIMEZONE = "America/New_York";

function event(partial: EventRow): EventRow {
  return partial;
}

function seed() {
  store.events = [
    event({
      id: EARLY_ID,
      organizationId: ORG_ID,
      locationId: SANCTUARY,
      title: "Morning Prayer",
      description: "staff-only sanctuary note",
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-09-30T14:00:00.000Z"),
      endDateTime: new Date("2026-09-30T15:00:00.000Z"),
      timezone: TIMEZONE,
      isAllDay: false,
      locationName: "Sanctuary",
      locationOrganizationId: ORG_ID,
      registrationNote: "do not show attendee names",
    }),
    event({
      id: MID_ID,
      organizationId: ORG_ID,
      locationId: SANCTUARY,
      title: "Choir Rehearsal",
      description: "choir private remark",
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-09-30T14:30:00.000Z"),
      endDateTime: new Date("2026-09-30T15:00:00.000Z"),
      timezone: TIMEZONE,
      isAllDay: false,
      locationName: "Sanctuary",
      locationOrganizationId: ORG_ID,
      registrationNote: "member Jane Doe registered",
    }),
    event({
      id: TOUCH_ID,
      organizationId: ORG_ID,
      locationId: SANCTUARY,
      title: "Lunch Fellowship",
      description: null,
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-09-30T15:00:00.000Z"),
      endDateTime: new Date("2026-09-30T16:00:00.000Z"),
      timezone: TIMEZONE,
      isAllDay: false,
      locationName: "Sanctuary",
      locationOrganizationId: ORG_ID,
      registrationNote: null,
    }),
    event({
      id: HALL_ID,
      organizationId: ORG_ID,
      locationId: FELLOWSHIP,
      title: "Hall Bible Study",
      description: null,
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-09-30T14:00:00.000Z"),
      endDateTime: new Date("2026-09-30T15:00:00.000Z"),
      timezone: TIMEZONE,
      isAllDay: false,
      locationName: "Fellowship Hall",
      locationOrganizationId: ORG_ID,
      registrationNote: null,
    }),
    event({
      id: YOUTH_A_ID,
      organizationId: ORG_ID,
      locationId: YOUTH_ROOM,
      title: "Youth Group A",
      description: null,
      eventStatus: "DRAFT",
      startDateTime: new Date("2026-09-30T14:00:00.000Z"),
      endDateTime: new Date("2026-09-30T15:00:00.000Z"),
      timezone: TIMEZONE,
      isAllDay: false,
      locationName: "Youth Room",
      locationOrganizationId: ORG_ID,
      registrationNote: null,
    }),
    event({
      id: YOUTH_B_ID,
      organizationId: ORG_ID,
      locationId: YOUTH_ROOM,
      title: "Youth Group B",
      description: null,
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-09-30T14:15:00.000Z"),
      endDateTime: new Date("2026-09-30T15:00:00.000Z"),
      timezone: TIMEZONE,
      isAllDay: false,
      locationName: "Youth Room",
      locationOrganizationId: ORG_ID,
      registrationNote: null,
    }),
    event({
      id: LATER_A_ID,
      organizationId: ORG_ID,
      locationId: FELLOWSHIP,
      title: "Later Hall A",
      description: null,
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-10-05T13:00:00.000Z"),
      endDateTime: new Date("2026-10-05T14:00:00.000Z"),
      timezone: TIMEZONE,
      isAllDay: false,
      locationName: "Fellowship Hall",
      locationOrganizationId: ORG_ID,
      registrationNote: null,
    }),
    event({
      id: LATER_B_ID,
      organizationId: ORG_ID,
      locationId: FELLOWSHIP,
      title: "Later Hall B",
      description: null,
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-10-05T13:30:00.000Z"),
      endDateTime: new Date("2026-10-05T14:30:00.000Z"),
      timezone: TIMEZONE,
      isAllDay: false,
      locationName: "Fellowship Hall",
      locationOrganizationId: ORG_ID,
      registrationNote: null,
    }),
    event({
      id: CANCELLED_ID,
      organizationId: ORG_ID,
      locationId: SANCTUARY,
      title: "Cancelled Sanctuary Event",
      description: "cancelled internal note",
      eventStatus: "CANCELLED",
      startDateTime: new Date("2026-09-30T14:00:00.000Z"),
      endDateTime: new Date("2026-09-30T16:00:00.000Z"),
      timezone: TIMEZONE,
      isAllDay: false,
      locationName: "Sanctuary",
      locationOrganizationId: ORG_ID,
      registrationNote: null,
    }),
    event({
      id: ARCHIVED_ID,
      organizationId: ORG_ID,
      locationId: SANCTUARY,
      title: "Archived Sanctuary Event",
      description: null,
      eventStatus: "ARCHIVED",
      startDateTime: new Date("2026-09-30T14:00:00.000Z"),
      endDateTime: new Date("2026-09-30T16:00:00.000Z"),
      timezone: TIMEZONE,
      isAllDay: false,
      locationName: "Sanctuary",
      locationOrganizationId: ORG_ID,
      registrationNote: null,
    }),
    event({
      id: COMPLETED_ID,
      organizationId: ORG_ID,
      locationId: SANCTUARY,
      title: "Completed Sanctuary Event",
      description: null,
      eventStatus: "COMPLETED",
      startDateTime: new Date("2026-09-30T14:00:00.000Z"),
      endDateTime: new Date("2026-09-30T16:00:00.000Z"),
      timezone: TIMEZONE,
      isAllDay: false,
      locationName: "Sanctuary",
      locationOrganizationId: ORG_ID,
      registrationNote: null,
    }),
    event({
      id: NO_LOCATION_ID,
      organizationId: ORG_ID,
      locationId: null,
      title: "Online Only Gathering",
      description: null,
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-09-30T14:00:00.000Z"),
      endDateTime: new Date("2026-09-30T15:00:00.000Z"),
      timezone: TIMEZONE,
      isAllDay: false,
      locationName: null,
      locationOrganizationId: null,
      registrationNote: null,
    }),
    event({
      id: OUT_OF_WINDOW_ID,
      organizationId: ORG_ID,
      locationId: SANCTUARY,
      title: "Far Future Sanctuary",
      description: null,
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2027-02-01T14:00:00.000Z"),
      endDateTime: new Date("2027-02-01T16:00:00.000Z"),
      timezone: TIMEZONE,
      isAllDay: false,
      locationName: "Sanctuary",
      locationOrganizationId: ORG_ID,
      registrationNote: null,
    }),
    event({
      id: OTHER_ORG_ID,
      organizationId: OTHER_ORG,
      locationId: OTHER_ORG_ROOM,
      title: "Other Church Sanctuary",
      description: "other church note",
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-09-30T14:00:00.000Z"),
      endDateTime: new Date("2026-09-30T16:00:00.000Z"),
      timezone: TIMEZONE,
      isAllDay: false,
      locationName: "Other Sanctuary",
      locationOrganizationId: OTHER_ORG,
      registrationNote: "other church attendee",
    }),
  ];
}

beforeEach(() => {
  store.events = [];
  store.lastEventWhere = null;
  store.lastEventSelect = null;
  store.lastEventOrderBy = null;
  mocks.getOrCreateUserAccount.mockReset();
  mocks.findPrimaryOrganization.mockReset();
  mocks.getEventAccess.mockReset();
  mocks.getOrCreateUserAccount.mockResolvedValue({
    id: USER_ID,
    primaryEmail: "leader@church.test",
    displayName: "Leader",
  });
  mocks.findPrimaryOrganization.mockResolvedValue({ id: ORG_ID });
  mocks.getEventAccess.mockResolvedValue({ canView: true });
  seed();
});

describe("event location conflict helpers", () => {
  it("treats true overlap as a conflict and touching ranges as none", () => {
    const early = {
      startDateTime: new Date("2026-09-30T14:00:00.000Z"),
      endDateTime: new Date("2026-09-30T15:00:00.000Z"),
    };
    const overlap = {
      startDateTime: new Date("2026-09-30T14:30:00.000Z"),
      endDateTime: new Date("2026-09-30T15:30:00.000Z"),
    };
    const touching = {
      startDateTime: new Date("2026-09-30T15:00:00.000Z"),
      endDateTime: new Date("2026-09-30T16:00:00.000Z"),
    };
    expect(eventTimesOverlap(early, overlap)).toBe(true);
    expect(eventTimesOverlap(overlap, early)).toBe(true);
    expect(eventTimesOverlap(early, touching)).toBe(false);
    expect(eventTimesOverlap(touching, early)).toBe(false);
    expect(eventTimesOverlap(early, early)).toBe(true);
  });
});

describe("event location conflict access", () => {
  it("returns signed-out, missing-organization, and unauthorized states", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    await expect(getEventLocationConflicts(NOW)).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastEventWhere).toBeNull();

    mocks.findPrimaryOrganization.mockResolvedValueOnce(null);
    await expect(getEventLocationConflicts(NOW)).resolves.toEqual({
      status: "NO_ORGANIZATION",
    });
    expect(store.lastEventWhere).toBeNull();

    mocks.getEventAccess.mockResolvedValueOnce({ canView: false });
    await expect(getEventLocationConflicts(NOW)).resolves.toEqual({
      status: "UNAUTHORIZED",
    });
    expect(store.lastEventWhere).toBeNull();
  });

  it("queries only the current organization in the 90-day window", async () => {
    await getEventLocationConflicts(NOW);
    expect(store.lastEventWhere).toEqual(
      eventLocationConflictReviewWhere(ORG_ID, NOW),
    );
    expect(store.lastEventWhere).toMatchObject({
      organizationId: ORG_ID,
      locationId: { not: null },
      eventStatus: { in: [...EVENT_LOCATION_CONFLICT_ACTIVE_STATUSES] },
    });
    expect(JSON.stringify(store.lastEventWhere)).not.toContain(OTHER_ORG);
    expect(store.lastEventOrderBy).toEqual([
      { startDateTime: "asc" },
      { title: "asc" },
    ]);
  });
});

describe("event location conflict rows", () => {
  it("detects overlaps, skips touching times, and ignores different rooms", async () => {
    const result = await getEventLocationConflicts(NOW);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.windowDays).toBe(EVENT_LOCATION_CONFLICT_REVIEW_WINDOW_DAYS);
    const titles = result.pairs.map(
      (pair) => `${pair.locationName}:${pair.first.title}/${pair.second.title}`,
    );
    expect(titles).toEqual([
      "Sanctuary:Morning Prayer/Choir Rehearsal",
      "Youth Room:Youth Group A/Youth Group B",
      "Fellowship Hall:Later Hall A/Later Hall B",
    ]);
    expect(titles.join(" ")).not.toContain("Lunch Fellowship");
    expect(titles.join(" ")).not.toContain("Hall Bible Study");
  });

  it("does not emit self-conflicts or duplicate A/B pairs", async () => {
    const result = await getEventLocationConflicts(NOW);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    const keys = result.pairs.map((pair) =>
      [pair.first.id, pair.second.id].sort().join(":"),
    );
    expect(new Set(keys).size).toBe(keys.length);
    for (const pair of result.pairs) {
      expect(pair.first.id).not.toBe(pair.second.id);
    }
  });

  it("excludes cancelled, archived, completed, no-location, out-of-window, and other-organization events", async () => {
    const result = await getEventLocationConflicts(NOW);
    expect(result.status).toBe("READY");
    const payload = JSON.stringify(result);
    expect(payload).not.toContain("Cancelled Sanctuary Event");
    expect(payload).not.toContain("Archived Sanctuary Event");
    expect(payload).not.toContain("Completed Sanctuary Event");
    expect(payload).not.toContain("Online Only Gathering");
    expect(payload).not.toContain("Far Future Sanctuary");
    expect(payload).not.toContain("Other Church Sanctuary");
    expect(payload).not.toContain(CANCELLED_ID);
    expect(payload).not.toContain(OTHER_ORG_ID);
    expect(payload).not.toContain(OUT_OF_WINDOW_ID);
  });

  it("returns only safe display fields and the existing event detail href", async () => {
    const result = await getEventLocationConflicts(NOW);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(Object.keys(result.pairs[0]!).sort()).toEqual(
      [...EVENT_LOCATION_CONFLICT_PAIR_FIELDS].sort(),
    );
    expect(Object.keys(result.pairs[0]!.first).sort()).toEqual(
      [...EVENT_LOCATION_CONFLICT_EVENT_FIELDS].sort(),
    );
    expect(result.pairs[0]).toMatchObject({
      locationId: SANCTUARY,
      locationName: "Sanctuary",
      first: {
        id: EARLY_ID,
        title: "Morning Prayer",
        href: `/events/${EARLY_ID}`,
      },
      second: {
        id: MID_ID,
        title: "Choir Rehearsal",
        href: `/events/${MID_ID}`,
      },
    });
    expect(store.lastEventSelect).toEqual({
      id: true,
      title: true,
      startDateTime: true,
      endDateTime: true,
      timezone: true,
      isAllDay: true,
      locationId: true,
      location: {
        select: {
          id: true,
          name: true,
          organizationId: true,
        },
      },
    });
    const payload = JSON.stringify(result);
    expect(payload).not.toContain("staff-only sanctuary note");
    expect(payload).not.toContain("choir private remark");
    expect(payload).not.toContain("Jane Doe");
    expect(payload).not.toContain("registrationNote");
    expect(payload).not.toContain("description");
    expect(JSON.stringify(store.lastEventSelect)).not.toContain("description");
    expect(JSON.stringify(store.lastEventSelect)).not.toContain("registration");
  });
});
