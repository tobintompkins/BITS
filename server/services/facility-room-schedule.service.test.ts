import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  FACILITY_ROOM_SCHEDULE_ACTIVE_EVENT_STATUSES,
  FACILITY_ROOM_SCHEDULE_COUNT_FIELDS,
  FACILITY_ROOM_SCHEDULE_EVENT_FIELDS,
  FACILITY_ROOM_SCHEDULE_LOCATION_FIELDS,
  FACILITY_ROOM_SCHEDULE_WINDOW_DAYS,
  facilityRoomScheduleEventWhere,
} from "@/lib/validation/facility-room-schedule";

type LocationRow = {
  id: string;
  organizationId: string;
  name: string;
  roomName: string | null;
  capacity: number | null;
  isOnline: boolean;
  isActive: boolean;
  description: string | null;
  onlineMeetingUrl: string | null;
};

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
  cancelledAt: Date | null;
  archivedAt: Date | null;
  contactEmail: string | null;
};

const store = vi.hoisted(() => ({
  locations: [] as LocationRow[],
  events: [] as EventRow[],
  lastLocationWhere: null as unknown,
  lastEventWhere: null as unknown,
  locationQueries: 0,
  eventQueries: 0,
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
    eventLocation: {
      findMany: async ({
        where,
      }: {
        where: { organizationId: string; isActive: boolean };
      }) => {
        store.locationQueries += 1;
        store.lastLocationWhere = where;
        return store.locations
          .filter(
            (row) =>
              row.organizationId === where.organizationId &&
              row.isActive === where.isActive,
          )
          .sort((left, right) => left.name.localeCompare(right.name))
          .map((row) => ({
            id: row.id,
            name: row.name,
            roomName: row.roomName,
            capacity: row.capacity,
            isOnline: row.isOnline,
          }));
      },
    },
    event: {
      findMany: async ({
        where,
      }: {
        where: {
          organizationId: string;
          locationId: { in: string[] };
          eventStatus: { in: string[] };
          cancelledAt: null;
          archivedAt: null;
          startDateTime: { gte: Date; lt: Date };
        };
      }) => {
        store.eventQueries += 1;
        store.lastEventWhere = where;
        const allowed = new Set(where.eventStatus.in);
        const locationIds = new Set(where.locationId.in);
        return store.events
          .filter((row) => {
            if (row.organizationId !== where.organizationId) return false;
            if (!row.locationId || !locationIds.has(row.locationId)) {
              return false;
            }
            if (!allowed.has(row.eventStatus)) return false;
            if (row.cancelledAt !== where.cancelledAt) return false;
            if (row.archivedAt !== where.archivedAt) return false;
            if (row.startDateTime < where.startDateTime.gte) return false;
            if (row.startDateTime >= where.startDateTime.lt) return false;
            return true;
          })
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
            eventStatus: row.eventStatus,
            locationId: row.locationId,
          }));
      },
    },
  },
}));

import { getFacilityRoomSchedule } from "./facility-room-schedule.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const FELLOWSHIP = "00000000-0000-4000-8000-00000000b001";
const KITCHEN = "00000000-0000-4000-8000-00000000b002";
const SANCTUARY = "00000000-0000-4000-8000-00000000b003";
const INACTIVE = "00000000-0000-4000-8000-00000000b004";
const OTHER_ROOM = "00000000-0000-4000-8000-00000000b005";
const PRAYER_ID = "00000000-0000-4000-8000-00000000e001";
const CHOIR_ID = "00000000-0000-4000-8000-00000000e002";
const YOUTH_ID = "00000000-0000-4000-8000-00000000e003";
const CANCELLED_ID = "00000000-0000-4000-8000-00000000e004";
const ARCHIVED_ID = "00000000-0000-4000-8000-00000000e005";
const COMPLETED_ID = "00000000-0000-4000-8000-00000000e006";
const NO_LOCATION_ID = "00000000-0000-4000-8000-00000000e007";
const OUT_OF_WINDOW_ID = "00000000-0000-4000-8000-00000000e008";
const PAST_ID = "00000000-0000-4000-8000-00000000e009";
const OTHER_ORG_ID = "00000000-0000-4000-8000-00000000e00a";
const INACTIVE_EVENT_ID = "00000000-0000-4000-8000-00000000e00b";

const NOW = new Date("2026-09-30T15:00:00.000Z");
const TIMEZONE = "America/New_York";

function seed() {
  store.locations = [
    {
      id: SANCTUARY,
      organizationId: ORG_ID,
      name: "Sanctuary",
      roomName: "Main Worship Room",
      capacity: 250,
      isOnline: false,
      isActive: true,
      description: "do not show this location note",
      onlineMeetingUrl: "https://secret.example/meet",
    },
    {
      id: KITCHEN,
      organizationId: ORG_ID,
      name: "Kitchen",
      roomName: null,
      capacity: 12,
      isOnline: false,
      isActive: true,
      description: null,
      onlineMeetingUrl: null,
    },
    {
      id: FELLOWSHIP,
      organizationId: ORG_ID,
      name: "Fellowship Hall",
      roomName: "Hall A",
      capacity: 80,
      isOnline: false,
      isActive: true,
      description: null,
      onlineMeetingUrl: null,
    },
    {
      id: INACTIVE,
      organizationId: ORG_ID,
      name: "Old Chapel",
      roomName: "Chapel",
      capacity: 40,
      isOnline: false,
      isActive: false,
      description: null,
      onlineMeetingUrl: null,
    },
    {
      id: OTHER_ROOM,
      organizationId: OTHER_ORG,
      name: "Other Church Sanctuary",
      roomName: "Sanctuary",
      capacity: 100,
      isOnline: false,
      isActive: true,
      description: null,
      onlineMeetingUrl: null,
    },
  ];
  store.events = [
    {
      id: CHOIR_ID,
      organizationId: ORG_ID,
      locationId: SANCTUARY,
      title: "Choir Rehearsal",
      description: "private choir remark",
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-10-02T23:00:00.000Z"),
      endDateTime: new Date("2026-10-03T00:00:00.000Z"),
      timezone: TIMEZONE,
      isAllDay: false,
      cancelledAt: null,
      archivedAt: null,
      contactEmail: "choir@church.test",
    },
    {
      id: PRAYER_ID,
      organizationId: ORG_ID,
      locationId: SANCTUARY,
      title: "Morning Prayer",
      description: "staff-only sanctuary note",
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-10-01T14:00:00.000Z"),
      endDateTime: new Date("2026-10-01T15:00:00.000Z"),
      timezone: TIMEZONE,
      isAllDay: false,
      cancelledAt: null,
      archivedAt: null,
      contactEmail: null,
    },
    {
      id: YOUTH_ID,
      organizationId: ORG_ID,
      locationId: FELLOWSHIP,
      title: "Youth Night",
      description: null,
      eventStatus: "DRAFT",
      startDateTime: new Date("2026-10-05T23:00:00.000Z"),
      endDateTime: new Date("2026-10-06T01:00:00.000Z"),
      timezone: TIMEZONE,
      isAllDay: false,
      cancelledAt: null,
      archivedAt: null,
      contactEmail: null,
    },
    {
      id: CANCELLED_ID,
      organizationId: ORG_ID,
      locationId: SANCTUARY,
      title: "Cancelled Concert",
      description: null,
      eventStatus: "CANCELLED",
      startDateTime: new Date("2026-10-03T18:00:00.000Z"),
      endDateTime: new Date("2026-10-03T20:00:00.000Z"),
      timezone: TIMEZONE,
      isAllDay: false,
      cancelledAt: new Date("2026-09-20T12:00:00.000Z"),
      archivedAt: null,
      contactEmail: null,
    },
    {
      id: ARCHIVED_ID,
      organizationId: ORG_ID,
      locationId: FELLOWSHIP,
      title: "Archived Banquet",
      description: null,
      eventStatus: "ARCHIVED",
      startDateTime: new Date("2026-10-06T18:00:00.000Z"),
      endDateTime: new Date("2026-10-06T20:00:00.000Z"),
      timezone: TIMEZONE,
      isAllDay: false,
      cancelledAt: null,
      archivedAt: new Date("2026-09-01T12:00:00.000Z"),
      contactEmail: null,
    },
    {
      id: COMPLETED_ID,
      organizationId: ORG_ID,
      locationId: KITCHEN,
      title: "Completed Class",
      description: null,
      eventStatus: "COMPLETED",
      startDateTime: new Date("2026-10-04T16:00:00.000Z"),
      endDateTime: new Date("2026-10-04T17:00:00.000Z"),
      timezone: TIMEZONE,
      isAllDay: false,
      cancelledAt: null,
      archivedAt: null,
      contactEmail: null,
    },
    {
      id: NO_LOCATION_ID,
      organizationId: ORG_ID,
      locationId: null,
      title: "Unplaced Meeting",
      description: null,
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-10-07T16:00:00.000Z"),
      endDateTime: new Date("2026-10-07T17:00:00.000Z"),
      timezone: TIMEZONE,
      isAllDay: false,
      cancelledAt: null,
      archivedAt: null,
      contactEmail: null,
    },
    {
      id: PAST_ID,
      organizationId: ORG_ID,
      locationId: SANCTUARY,
      title: "Yesterday Service",
      description: null,
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-09-29T14:00:00.000Z"),
      endDateTime: new Date("2026-09-29T15:00:00.000Z"),
      timezone: TIMEZONE,
      isAllDay: false,
      cancelledAt: null,
      archivedAt: null,
      contactEmail: null,
    },
    {
      id: OUT_OF_WINDOW_ID,
      organizationId: ORG_ID,
      locationId: SANCTUARY,
      title: "Far Future Retreat",
      description: null,
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-11-15T14:00:00.000Z"),
      endDateTime: new Date("2026-11-15T20:00:00.000Z"),
      timezone: TIMEZONE,
      isAllDay: false,
      cancelledAt: null,
      archivedAt: null,
      contactEmail: null,
    },
    {
      id: OTHER_ORG_ID,
      organizationId: OTHER_ORG,
      locationId: OTHER_ROOM,
      title: "Other Church Worship",
      description: "foreign description",
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-10-02T14:00:00.000Z"),
      endDateTime: new Date("2026-10-02T15:00:00.000Z"),
      timezone: TIMEZONE,
      isAllDay: false,
      cancelledAt: null,
      archivedAt: null,
      contactEmail: "other@church.test",
    },
    {
      id: INACTIVE_EVENT_ID,
      organizationId: ORG_ID,
      locationId: INACTIVE,
      title: "Old Chapel Service",
      description: null,
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-10-08T14:00:00.000Z"),
      endDateTime: new Date("2026-10-08T15:00:00.000Z"),
      timezone: TIMEZONE,
      isAllDay: false,
      cancelledAt: null,
      archivedAt: null,
      contactEmail: null,
    },
  ];
}

beforeEach(() => {
  store.locations = [];
  store.events = [];
  store.lastLocationWhere = null;
  store.lastEventWhere = null;
  store.locationQueries = 0;
  store.eventQueries = 0;
  mocks.getOrCreateUserAccount.mockReset();
  mocks.findPrimaryOrganization.mockReset();
  mocks.getEventAccess.mockReset();
  mocks.getOrCreateUserAccount.mockResolvedValue({
    id: USER_ID,
    primaryEmail: "leader@church.test",
  });
  mocks.findPrimaryOrganization.mockResolvedValue({ id: ORG_ID });
  mocks.getEventAccess.mockResolvedValue({ canView: true });
  seed();
});

describe("facility room schedule access", () => {
  it("returns signed-out, missing organization, and unauthorized states", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    await expect(getFacilityRoomSchedule(NOW)).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.locationQueries).toBe(0);

    mocks.findPrimaryOrganization.mockResolvedValueOnce(null);
    await expect(getFacilityRoomSchedule(NOW)).resolves.toEqual({
      status: "NO_ORGANIZATION",
    });

    mocks.getEventAccess.mockResolvedValueOnce({ canView: false });
    await expect(getFacilityRoomSchedule(NOW)).resolves.toEqual({
      status: "UNAUTHORIZED",
    });
  });
});

describe("facility room schedule scoping", () => {
  it("lists current-org active locations and upcoming events only", async () => {
    const result = await getFacilityRoomSchedule(NOW);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;

    expect(store.lastLocationWhere).toEqual({
      organizationId: ORG_ID,
      isActive: true,
    });
    expect(store.lastEventWhere).toMatchObject(
      facilityRoomScheduleEventWhere(ORG_ID, [FELLOWSHIP, KITCHEN, SANCTUARY], NOW),
    );
    expect(store.lastEventWhere).toMatchObject({
      eventStatus: { in: [...FACILITY_ROOM_SCHEDULE_ACTIVE_EVENT_STATUSES] },
      cancelledAt: null,
      archivedAt: null,
    });
    expect(store.locationQueries).toBe(1);
    expect(store.eventQueries).toBe(1);
    expect(result.windowDays).toBe(FACILITY_ROOM_SCHEDULE_WINDOW_DAYS);
    expect(result.locations.map((location) => location.name)).toEqual([
      "Fellowship Hall",
      "Kitchen",
      "Sanctuary",
    ]);
    expect(result.locations.some((location) => location.id === INACTIVE)).toBe(
      false,
    );
    expect(
      result.locations.some((location) => location.id === OTHER_ROOM),
    ).toBe(false);
    expect(result.counts).toEqual({
      activeLocations: 3,
      locationsWithUpcomingEvents: 2,
      eventsInWindow: 3,
    });
    expect(Object.keys(result.counts).sort()).toEqual(
      [...FACILITY_ROOM_SCHEDULE_COUNT_FIELDS].sort(),
    );
  });

  it("excludes cancelled, archived, completed, past, far-future, and unlocated events", async () => {
    const result = await getFacilityRoomSchedule(NOW);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    const payload = JSON.stringify(result);
    expect(payload).not.toContain("Cancelled Concert");
    expect(payload).not.toContain("Archived Banquet");
    expect(payload).not.toContain("Completed Class");
    expect(payload).not.toContain("Unplaced Meeting");
    expect(payload).not.toContain("Yesterday Service");
    expect(payload).not.toContain("Far Future Retreat");
    expect(payload).not.toContain("Other Church Worship");
    expect(payload).not.toContain("Old Chapel Service");
  });
});

describe("facility room schedule display", () => {
  it("sorts events by start time and returns only safe fields", async () => {
    const result = await getFacilityRoomSchedule(NOW);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;

    const sanctuary = result.locations.find((location) => location.id === SANCTUARY);
    const kitchen = result.locations.find((location) => location.id === KITCHEN);
    const fellowship = result.locations.find(
      (location) => location.id === FELLOWSHIP,
    );
    expect(sanctuary?.events.map((event) => event.id)).toEqual([
      PRAYER_ID,
      CHOIR_ID,
    ]);
    expect(fellowship?.events.map((event) => event.id)).toEqual([YOUTH_ID]);
    expect(kitchen?.events).toEqual([]);

    expect(Object.keys(sanctuary!).sort()).toEqual(
      [...FACILITY_ROOM_SCHEDULE_LOCATION_FIELDS].sort(),
    );
    expect(Object.keys(sanctuary!.events[0]!).sort()).toEqual(
      [...FACILITY_ROOM_SCHEDULE_EVENT_FIELDS].sort(),
    );
    expect(sanctuary!.events[0]!.href).toBe(`/events/${PRAYER_ID}`);
    expect(sanctuary!.placeLabel).toBe("On-site");

    const payload = JSON.stringify(result);
    expect(payload).not.toContain("private choir remark");
    expect(payload).not.toContain("staff-only sanctuary note");
    expect(payload).not.toContain("choir@church.test");
    expect(payload).not.toContain("leader@church.test");
    expect(payload).not.toContain("https://secret.example/meet");
    expect(payload).not.toContain("do not show this location note");
  });
});
