import { beforeEach, describe, expect, it, vi } from "vitest";

type LocationRow = {
  name: string;
  roomName: string | null;
  isOnline: boolean;
  city: string | null;
  state: string | null;
  address1?: string;
  onlineMeetingUrl?: string;
  capacity?: number;
};

type EventRow = {
  id: string;
  organizationId: string;
  title: string;
  startDateTime: Date;
  endDateTime: Date;
  timezone: string;
  isAllDay: boolean;
  eventStatus: string;
  location: LocationRow | null;
  registrationSettings?: {
    allowCancellation: boolean;
    cancellationDeadline: Date | null;
  } | null;
};

type RegistrationRow = {
  id: string;
  organizationId: string;
  eventId: string;
  registeredByUserId: string | null;
  status: string;
  confirmationCode: string;
  partySize: number;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone: string;
  notes: string | null;
  waitlistPosition: number | null;
  cancellationReason: string | null;
  memberId: string | null;
  checkedInAt: Date | null;
  attendees: Array<{
    firstName: string;
    lastName: string;
    email: string;
    checkInToken: string;
  }>;
  qrPasses: Array<{
    tokenHash: string;
    fallbackCodeHash: string;
    rawToken: string;
  }>;
};

const store = vi.hoisted(() => ({
  events: [] as EventRow[],
  registrations: [] as RegistrationRow[],
  lastCountWhere: null as unknown,
  lastFindWhere: null as unknown,
  lastFindSelect: null as unknown,
  lastFindSkip: null as number | null,
  lastFindTake: null as number | null,
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

vi.mock("@/lib/db/prisma", () => {
  function matchesWhere(
    row: RegistrationRow,
    where: {
      organizationId?: string;
      registeredByUserId?: string | null;
      status?: string;
      event?: {
        organizationId?: string;
        endDateTime?: { gte?: Date; lt?: Date };
      };
    },
  ) {
    if (where.organizationId && row.organizationId !== where.organizationId) {
      return false;
    }
    if (
      where.registeredByUserId !== undefined &&
      row.registeredByUserId !== where.registeredByUserId
    ) {
      return false;
    }
    if (where.status && row.status !== where.status) return false;
    const event = store.events.find((item) => item.id === row.eventId);
    if (!event) return false;
    if (
      where.event?.organizationId &&
      event.organizationId !== where.event.organizationId
    ) {
      return false;
    }
    if (
      where.event?.endDateTime?.gte &&
      event.endDateTime < where.event.endDateTime.gte
    ) {
      return false;
    }
    if (
      where.event?.endDateTime?.lt &&
      event.endDateTime >= where.event.endDateTime.lt
    ) {
      return false;
    }
    return true;
  }

  function toPrismaRow(row: RegistrationRow) {
    const event = store.events.find((item) => item.id === row.eventId)!;
    return {
      id: row.id,
      confirmationCode: row.confirmationCode,
      partySize: row.partySize,
      status: row.status,
      primaryContactName: row.primaryContactName,
      primaryContactEmail: row.primaryContactEmail,
      primaryContactPhone: row.primaryContactPhone,
      notes: row.notes,
      waitlistPosition: row.waitlistPosition,
      cancellationReason: row.cancellationReason,
      memberId: row.memberId,
      checkedInAt: row.checkedInAt,
      attendees: row.attendees,
      qrPasses: row.qrPasses,
      event: {
        id: event.id,
        title: event.title,
        startDateTime: event.startDateTime,
        endDateTime: event.endDateTime,
        timezone: event.timezone,
        isAllDay: event.isAllDay,
        eventStatus: event.eventStatus,
        location: event.location,
        registrationSettings: event.registrationSettings ?? {
          allowCancellation: true,
          cancellationDeadline: null,
        },
      },
    };
  }

  return {
    prisma: {
      eventRegistration: {
        count: async ({
          where,
        }: {
          where: Record<string, unknown>;
        }) => {
          store.lastCountWhere = where;
          return store.registrations.filter((row) =>
            matchesWhere(row, where),
          ).length;
        },
        findMany: async ({
          where,
          skip,
          take,
          select,
        }: {
          where: Record<string, unknown>;
          skip: number;
          take: number;
          select: unknown;
        }) => {
          store.lastFindWhere = where;
          store.lastFindSelect = select;
          store.lastFindSkip = skip;
          store.lastFindTake = take;
          const startSort =
            (where.event as { endDateTime?: { gte?: Date } } | undefined)
              ?.endDateTime?.gte
              ? 1
              : -1;
          return store.registrations
            .filter((row) => matchesWhere(row, where))
            .sort((left, right) => {
              const leftEvent = store.events.find((event) => event.id === left.eventId)!;
              const rightEvent = store.events.find(
                (event) => event.id === right.eventId,
              )!;
              const byStart =
                startSort *
                (leftEvent.startDateTime.getTime() -
                  rightEvent.startDateTime.getTime());
              if (byStart !== 0) return byStart;
              return left.confirmationCode.localeCompare(right.confirmationCode);
            })
            .slice(skip, skip + take)
            .map(toPrismaRow);
        },
      },
    },
  };
});

import { getMemberEventRegistrations } from "./member-event-registrations.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const OTHER_USER = "00000000-0000-4000-8000-00000000c002";
const UPCOMING_EVENT = "00000000-0000-4000-8000-00000000e001";
const PAST_EVENT = "00000000-0000-4000-8000-00000000e002";
const LATER_EVENT = "00000000-0000-4000-8000-00000000e003";
const OTHER_ORG_EVENT = "00000000-0000-4000-8000-00000000e004";
const OWN_REG = "00000000-0000-4000-8000-00000000r001";
const PAST_REG = "00000000-0000-4000-8000-00000000r002";
const WAITLIST_REG = "00000000-0000-4000-8000-00000000r003";
const OTHER_USER_REG = "00000000-0000-4000-8000-00000000r004";
const OTHER_ORG_REG = "00000000-0000-4000-8000-00000000r005";
const CANCELLED_REG = "00000000-0000-4000-8000-00000000r006";

const NOW = new Date("2026-09-18T19:00:00.000Z");
const OWN_EMAIL = "ann@church.test";
const SECRET_TOKEN = "qr_raw_secret_token_abc";
const SECRET_HASH = "deadbeefqrhash000000000000000000000000000000000000000000000001";
const SECRET_ATTENDEE = "Hidden Child";
const SECRET_NOTE = "staff only registration memo";
const CONFIRMATION_CODE = "SUN-7K2P";

function registration(
  overrides: Partial<RegistrationRow> &
    Pick<RegistrationRow, "id" | "eventId" | "confirmationCode">,
): RegistrationRow {
  return {
    organizationId: ORG_ID,
    registeredByUserId: USER_ID,
    status: "CONFIRMED",
    partySize: 2,
    primaryContactName: "Ann Adams",
    primaryContactEmail: OWN_EMAIL,
    primaryContactPhone: "207-555-0100",
    notes: SECRET_NOTE,
    waitlistPosition: 4,
    cancellationReason: "changed plans",
    memberId: "00000000-0000-4000-8000-00000000m001",
    checkedInAt: new Date("2026-09-01T00:00:00.000Z"),
    attendees: [
      {
        firstName: "Hidden",
        lastName: "Child",
        email: "child@church.test",
        checkInToken: "checkin-token-secret",
      },
    ],
    qrPasses: [
      {
        tokenHash: SECRET_HASH,
        fallbackCodeHash: "fallbackhashsecret",
        rawToken: SECRET_TOKEN,
      },
    ],
    ...overrides,
  };
}

function seed() {
  store.events = [
    {
      id: UPCOMING_EVENT,
      organizationId: ORG_ID,
      title: "Sunday Worship",
      startDateTime: new Date("2026-10-04T14:30:00.000Z"),
      endDateTime: new Date("2026-10-04T16:00:00.000Z"),
      timezone: "America/New_York",
      isAllDay: false,
      eventStatus: "PUBLISHED",
      location: {
        name: "Main Sanctuary",
        roomName: "Sanctuary",
        isOnline: false,
        city: "Saco",
        state: "ME",
        address1: "100 Secret Staff Street",
        onlineMeetingUrl: "https://zoom.example/secret",
        capacity: 400,
      },
    },
    {
      id: PAST_EVENT,
      organizationId: ORG_ID,
      title: "Summer Picnic",
      startDateTime: new Date("2026-08-01T16:00:00.000Z"),
      endDateTime: new Date("2026-08-01T20:00:00.000Z"),
      timezone: "America/New_York",
      isAllDay: false,
      eventStatus: "COMPLETED",
      location: {
        name: "Fellowship Hall",
        roomName: "Hall A",
        isOnline: false,
        city: "Saco",
        state: "ME",
      },
    },
    {
      id: LATER_EVENT,
      organizationId: ORG_ID,
      title: "Youth Night",
      startDateTime: new Date("2026-11-01T23:00:00.000Z"),
      endDateTime: new Date("2026-11-02T01:00:00.000Z"),
      timezone: "America/New_York",
      isAllDay: false,
      eventStatus: "PUBLISHED",
      location: null,
    },
    {
      id: OTHER_ORG_EVENT,
      organizationId: OTHER_ORG,
      title: "Other Church Revival",
      startDateTime: new Date("2026-10-10T18:00:00.000Z"),
      endDateTime: new Date("2026-10-10T20:00:00.000Z"),
      timezone: "America/Chicago",
      isAllDay: false,
      eventStatus: "PUBLISHED",
      location: { name: "Other Chapel", roomName: null, isOnline: false, city: null, state: null },
    },
  ];
  store.registrations = [
    registration({
      id: OWN_REG,
      eventId: UPCOMING_EVENT,
      confirmationCode: CONFIRMATION_CODE,
    }),
    registration({
      id: PAST_REG,
      eventId: PAST_EVENT,
      confirmationCode: "PIC-9Q1A",
      partySize: 4,
    }),
    registration({
      id: WAITLIST_REG,
      eventId: LATER_EVENT,
      confirmationCode: "YTH-WAIT",
      status: "WAITLISTED",
      partySize: 1,
    }),
    registration({
      id: CANCELLED_REG,
      eventId: UPCOMING_EVENT,
      confirmationCode: "SUN-CXL1",
      status: "CANCELLED",
      partySize: 2,
    }),
    registration({
      id: OTHER_USER_REG,
      eventId: UPCOMING_EVENT,
      confirmationCode: "SUN-OTHER",
      registeredByUserId: OTHER_USER,
      primaryContactName: "Other Person",
      primaryContactEmail: OWN_EMAIL,
    }),
    registration({
      id: OTHER_ORG_REG,
      organizationId: OTHER_ORG,
      eventId: OTHER_ORG_EVENT,
      confirmationCode: "ORG-OTHER",
    }),
  ];
  store.lastCountWhere = null;
  store.lastFindWhere = null;
  store.lastFindSelect = null;
  store.lastFindSkip = null;
  store.lastFindTake = null;
}

function payloadText(value: unknown) {
  return JSON.stringify(value);
}

describe("member event registrations", () => {
  beforeEach(() => {
    seed();
    vi.clearAllMocks();
    mocks.findPrimaryOrganization.mockResolvedValue({
      id: ORG_ID,
      name: "First United Pentecostal Church of Saco",
    });
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: USER_ID,
      primaryEmail: OWN_EMAIL,
      displayName: "Ann Adams",
    });
  });

  it("returns signed out without querying registrations", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(getMemberEventRegistrations({}, NOW)).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastCountWhere).toBeNull();
    expect(store.lastFindWhere).toBeNull();
  });

  it("returns a safe no-organization state without querying registrations", async () => {
    mocks.findPrimaryOrganization.mockResolvedValue(null);
    await expect(getMemberEventRegistrations({}, NOW)).resolves.toEqual({
      status: "NO_ORGANIZATION",
    });
    expect(store.lastCountWhere).toBeNull();
    expect(store.lastFindWhere).toBeNull();
  });

  it("scopes by current organization and signed-in user id, not email", async () => {
    const result = await getMemberEventRegistrations(
      { userId: OTHER_USER, email: OWN_EMAIL },
      NOW,
    );
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.registrations.map((row) => row.confirmationCode)).toEqual([
      CONFIRMATION_CODE,
      "SUN-CXL1",
      "YTH-WAIT",
    ]);
    expect(store.lastFindWhere).toEqual({
      organizationId: ORG_ID,
      registeredByUserId: USER_ID,
      event: {
        organizationId: ORG_ID,
        endDateTime: { gte: NOW },
      },
    });
    expect(JSON.stringify(store.lastFindWhere)).not.toContain("email");
    expect(JSON.stringify(store.lastFindWhere)).not.toContain(OWN_EMAIL);
    expect(JSON.stringify(store.lastFindWhere)).not.toContain(OTHER_USER);
    const text = payloadText(result);
    expect(text).not.toContain("SUN-OTHER");
    expect(text).not.toContain("ORG-OTHER");
    expect(text).not.toContain("Other Church Revival");
    expect(text).not.toContain("Other Person");
  });

  it("filters upcoming versus past by event end time", async () => {
    const upcoming = await getMemberEventRegistrations({ view: "upcoming" }, NOW);
    const past = await getMemberEventRegistrations({ view: "past" }, NOW);
    expect(upcoming.status).toBe("READY");
    expect(past.status).toBe("READY");
    if (upcoming.status !== "READY" || past.status !== "READY") return;
    expect(upcoming.view).toBe("upcoming");
    expect(upcoming.registrations.every((row) => row.isUpcoming)).toBe(true);
    expect(upcoming.registrations.map((row) => row.eventTitle)).toEqual([
      "Sunday Worship",
      "Sunday Worship",
      "Youth Night",
    ]);
    expect(past.view).toBe("past");
    expect(past.registrations).toEqual([
      expect.objectContaining({
        eventTitle: "Summer Picnic",
        confirmationCode: "PIC-9Q1A",
        isUpcoming: false,
        canCancel: false,
        canAddToCalendar: true,
        calendarUnavailableReason: null,
      }),
    ]);
    expect(past.registrations[0]).toMatchObject({ id: PAST_REG });
    expect(store.lastFindWhere).toMatchObject({
      event: { organizationId: ORG_ID, endDateTime: { lt: NOW } },
    });
  });

  it("maps status filters to actual registration enum values only", async () => {
    const confirmed = await getMemberEventRegistrations(
      { status: "confirmed" },
      NOW,
    );
    expect(confirmed.status).toBe("READY");
    if (confirmed.status !== "READY") return;
    expect(confirmed.statusFilter).toBe("confirmed");
    expect(confirmed.registrations.map((row) => row.confirmationCode)).toEqual([
      CONFIRMATION_CODE,
    ]);
    expect(store.lastFindWhere).toMatchObject({ status: "CONFIRMED" });

    const waitlisted = await getMemberEventRegistrations(
      { status: "waitlisted" },
      NOW,
    );
    expect(waitlisted.status).toBe("READY");
    if (waitlisted.status !== "READY") return;
    expect(waitlisted.registrations.map((row) => row.confirmationCode)).toEqual([
      "YTH-WAIT",
    ]);
    expect(store.lastFindWhere).toMatchObject({ status: "WAITLISTED" });

    const cancelled = await getMemberEventRegistrations(
      { status: "cancelled" },
      NOW,
    );
    expect(cancelled.status).toBe("READY");
    if (cancelled.status !== "READY") return;
    expect(cancelled.registrations.map((row) => row.confirmationCode)).toEqual([
      "SUN-CXL1",
    ]);
    expect(store.lastFindWhere).toMatchObject({ status: "CANCELLED" });
  });

  it("paginates at 25 rows and clamps the page", async () => {
    store.registrations = Array.from({ length: 26 }, (_, index) => {
      const n = String(index + 1).padStart(2, "0");
      const eventId = `00000000-0000-4000-8000-00000000b0${n}`;
      store.events.push({
        id: eventId,
        organizationId: ORG_ID,
        title: `Event ${n}`,
        startDateTime: new Date(`2026-10-${n}T14:00:00.000Z`),
        endDateTime: new Date(`2026-10-${n}T16:00:00.000Z`),
        timezone: "America/New_York",
        isAllDay: false,
        eventStatus: "PUBLISHED",
        location: null,
      });
      return registration({
        id: `00000000-0000-4000-8000-00000000c0${n}`,
        eventId,
        confirmationCode: `EVT-${n}`,
      });
    });

    const page1 = await getMemberEventRegistrations({ page: "1" }, NOW);
    const page2 = await getMemberEventRegistrations({ page: "2" }, NOW);
    const overflow = await getMemberEventRegistrations({ page: "99" }, NOW);
    expect(page1.status).toBe("READY");
    expect(page2.status).toBe("READY");
    expect(overflow.status).toBe("READY");
    if (
      page1.status !== "READY" ||
      page2.status !== "READY" ||
      overflow.status !== "READY"
    ) {
      return;
    }
    expect(page1.totalCount).toBe(26);
    expect(page1.pageCount).toBe(2);
    expect(page1.pageSize).toBe(25);
    expect(page1.registrations).toHaveLength(25);
    expect(page2.page).toBe(2);
    expect(page2.registrations).toHaveLength(1);
    expect(store.lastFindSkip).toBe(25);
    expect(store.lastFindTake).toBe(25);
    expect(overflow.page).toBe(2);
    expect(overflow.registrations).toHaveLength(1);
  });

  it("returns only the safe display allow-list and confirmation code, without QR/attendee leakage", async () => {
    const result = await getMemberEventRegistrations(
      { status: "confirmed" },
      NOW,
    );
    expect(result).toEqual({
      status: "READY",
      view: "upcoming",
      statusFilter: "confirmed",
      page: 1,
      pageSize: 25,
      pageCount: 1,
      totalCount: 1,
      registrations: [
        {
          id: OWN_REG,
          eventTitle: "Sunday Worship",
          startDateTime: new Date("2026-10-04T14:30:00.000Z"),
          endDateTime: new Date("2026-10-04T16:00:00.000Z"),
          timezone: "America/New_York",
          isAllDay: false,
          location: {
            name: "Main Sanctuary",
            roomName: "Sanctuary",
            isOnline: false,
            city: "Saco",
            state: "ME",
          },
          eventStatus: "Published",
          registrationStatus: "Confirmed",
          confirmationCode: CONFIRMATION_CODE,
          partySize: 2,
          isUpcoming: true,
          canCancel: true,
          canAddToCalendar: true,
          calendarUnavailableReason: null,
        },
      ],
    });
    const text = payloadText(result);
    expect(text).toContain(CONFIRMATION_CODE);
    expect(text).not.toContain(SECRET_TOKEN);
    expect(text).not.toContain(SECRET_HASH);
    expect(text).not.toContain(SECRET_ATTENDEE);
    expect(text).not.toContain("Hidden");
    expect(text).not.toContain("child@church.test");
    expect(text).not.toContain(SECRET_NOTE);
    expect(text).not.toContain("changed plans");
    expect(text).not.toContain("checkin-token-secret");
    expect(text).not.toContain("https://zoom.example/secret");
    expect(text).not.toContain("100 Secret Staff Street");
    expect(text).not.toContain(UPCOMING_EVENT);
    expect(text).not.toContain(USER_ID);
    expect(text).not.toMatch(/waitlistPosition/);
    expect(text).not.toMatch(/cancellationReason/);
    expect(text).not.toMatch(/qrPass/);
    expect(text).not.toMatch(/tokenHash/);
    expect(store.lastFindSelect).toEqual({
      id: true,
      confirmationCode: true,
      partySize: true,
      status: true,
      event: {
        select: {
          title: true,
          startDateTime: true,
          endDateTime: true,
          timezone: true,
          isAllDay: true,
          eventStatus: true,
          location: {
            select: {
              name: true,
              roomName: true,
              isOnline: true,
              city: true,
              state: true,
            },
          },
          registrationSettings: {
            select: {
              allowCancellation: true,
              cancellationDeadline: true,
            },
          },
        },
      },
    });
  });

  it("hides cancel eligibility for cancelled, past, and checked-in registrations", async () => {
    store.registrations.push(
      registration({
        id: "00000000-0000-4000-8000-00000000r007",
        eventId: UPCOMING_EVENT,
        confirmationCode: "SUN-CHK1",
        status: "CHECKED_IN",
      }),
    );
    const upcoming = await getMemberEventRegistrations({ view: "upcoming" }, NOW);
    expect(upcoming.status).toBe("READY");
    if (upcoming.status !== "READY") return;
    const byCode = Object.fromEntries(
      upcoming.registrations.map((row) => [row.confirmationCode, row]),
    );
    expect(byCode[CONFIRMATION_CODE]).toMatchObject({
      id: OWN_REG,
      canCancel: true,
      canAddToCalendar: true,
      calendarUnavailableReason: null,
    });
    expect(byCode["YTH-WAIT"]).toMatchObject({
      id: WAITLIST_REG,
      canCancel: true,
      canAddToCalendar: false,
      calendarUnavailableReason:
        "Waitlisted registrations cannot be added to a calendar until they are confirmed.",
    });
    expect(byCode["SUN-CXL1"]).toMatchObject({
      canCancel: false,
      canAddToCalendar: false,
      calendarUnavailableReason:
        "This cancelled registration cannot be added to a calendar.",
    });
    expect(byCode["SUN-CXL1"]).not.toHaveProperty("id");
    expect(byCode["SUN-CHK1"]).toMatchObject({
      id: "00000000-0000-4000-8000-00000000r007",
      canCancel: false,
      canAddToCalendar: true,
      calendarUnavailableReason: null,
    });
  });
});
