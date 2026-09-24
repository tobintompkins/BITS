import { beforeEach, describe, expect, it, vi } from "vitest";

import { escapeIcsText, foldIcsLine } from "@/lib/calendar/ics";

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
  shortDescription: string | null;
  description?: string | null;
  startDateTime: Date;
  endDateTime: Date;
  timezone: string;
  isAllDay: boolean;
  contactEmail?: string;
  contactPhone?: string;
  registrationFee?: string;
  registrationInstructions?: string;
  location: LocationRow | null;
};

type RegistrationRow = {
  id: string;
  organizationId: string;
  eventId: string;
  registeredByUserId: string | null;
  status: string;
  confirmationCode: string;
  primaryContactName: string;
  primaryContactEmail: string;
  notes: string | null;
  memberId: string | null;
  cancellationReason: string | null;
  waitlistPosition: number | null;
};

const store = vi.hoisted(() => ({
  events: [] as EventRow[],
  registrations: [] as RegistrationRow[],
  lastFindWhere: null as unknown,
  lastFindSelect: null as unknown,
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
    eventRegistration: {
      findFirst: async ({
        where,
        select,
      }: {
        where: {
          id: string;
          organizationId: string;
          registeredByUserId: string;
          event?: { organizationId: string };
        };
        select: unknown;
      }) => {
        store.lastFindWhere = where;
        store.lastFindSelect = select;
        const row = store.registrations.find(
          (item) =>
            item.id === where.id &&
            item.organizationId === where.organizationId &&
            item.registeredByUserId === where.registeredByUserId,
        );
        if (!row) return null;
        const event = store.events.find((item) => item.id === row.eventId);
        if (!event) return null;
        if (
          where.event?.organizationId &&
          event.organizationId !== where.event.organizationId
        ) {
          return null;
        }
        return {
          id: row.id,
          status: row.status,
          confirmationCode: row.confirmationCode,
          event: {
            title: event.title,
            shortDescription: event.shortDescription,
            startDateTime: event.startDateTime,
            endDateTime: event.endDateTime,
            timezone: event.timezone,
            isAllDay: event.isAllDay,
            location: event.location
              ? {
                  name: event.location.name,
                  roomName: event.location.roomName,
                  isOnline: event.location.isOnline,
                  city: event.location.city,
                  state: event.location.state,
                }
              : null,
          },
        };
      },
    },
  },
}));

import { getMemberEventCalendar } from "./member-event-calendar.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const OTHER_USER = "00000000-0000-4000-8000-00000000c002";
const EVENT_ID = "00000000-0000-4000-8000-00000000e001";
const OTHER_ORG_EVENT = "00000000-0000-4000-8000-00000000e002";
const OWN_REG = "00000000-0000-4000-8000-00000000d001";
const OTHER_USER_REG = "00000000-0000-4000-8000-00000000d002";
const OTHER_ORG_REG = "00000000-0000-4000-8000-00000000d003";
const CANCELLED_REG = "00000000-0000-4000-8000-00000000d004";
const WAITLIST_REG = "00000000-0000-4000-8000-00000000d005";
const MEMBER_ID = "00000000-0000-4000-8000-00000000m001";
const NOW = new Date("2026-09-24T16:30:00.000Z");
const OWN_EMAIL = "ann@church.test";
const CONFIRMATION_CODE = "SUN-7K2P";

function seed() {
  store.events = [
    {
      id: EVENT_ID,
      organizationId: ORG_ID,
      title: "Sunday Worship; Fellowship, and Prayer",
      shortDescription: "Join us this Sunday.\nBring a friend.",
      description: "Internal long description with donor notes.",
      startDateTime: new Date("2026-10-04T14:30:00.000Z"),
      endDateTime: new Date("2026-10-04T16:00:00.000Z"),
      timezone: "America/New_York",
      isAllDay: false,
      contactEmail: "staff-only@church.test",
      contactPhone: "207-555-0199",
      registrationFee: "25.00",
      registrationInstructions: "Pay at the door. Staff only memo.",
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
      id: OTHER_ORG_EVENT,
      organizationId: OTHER_ORG,
      title: "Other Church Revival",
      shortDescription: "Not your church.",
      startDateTime: new Date("2026-10-10T18:00:00.000Z"),
      endDateTime: new Date("2026-10-10T20:00:00.000Z"),
      timezone: "America/Chicago",
      isAllDay: false,
      location: null,
    },
  ];
  store.registrations = [
    {
      id: OWN_REG,
      organizationId: ORG_ID,
      eventId: EVENT_ID,
      registeredByUserId: USER_ID,
      status: "CONFIRMED",
      confirmationCode: CONFIRMATION_CODE,
      primaryContactName: "Ann Adams",
      primaryContactEmail: OWN_EMAIL,
      notes: "staff only registration memo",
      memberId: MEMBER_ID,
      cancellationReason: null,
      waitlistPosition: null,
    },
    {
      id: OTHER_USER_REG,
      organizationId: ORG_ID,
      eventId: EVENT_ID,
      registeredByUserId: OTHER_USER,
      status: "CONFIRMED",
      confirmationCode: "SUN-OTHER",
      primaryContactName: "Other Person",
      primaryContactEmail: "other@church.test",
      notes: "other member note",
      memberId: "00000000-0000-4000-8000-00000000m002",
      cancellationReason: null,
      waitlistPosition: null,
    },
    {
      id: OTHER_ORG_REG,
      organizationId: OTHER_ORG,
      eventId: OTHER_ORG_EVENT,
      registeredByUserId: USER_ID,
      status: "CONFIRMED",
      confirmationCode: "ORG-OTHER",
      primaryContactName: "Ann Adams",
      primaryContactEmail: OWN_EMAIL,
      notes: null,
      memberId: MEMBER_ID,
      cancellationReason: null,
      waitlistPosition: null,
    },
    {
      id: CANCELLED_REG,
      organizationId: ORG_ID,
      eventId: EVENT_ID,
      registeredByUserId: USER_ID,
      status: "CANCELLED",
      confirmationCode: "SUN-CXL1",
      primaryContactName: "Ann Adams",
      primaryContactEmail: OWN_EMAIL,
      notes: "changed plans",
      memberId: MEMBER_ID,
      cancellationReason: "changed plans",
      waitlistPosition: null,
    },
    {
      id: WAITLIST_REG,
      organizationId: ORG_ID,
      eventId: EVENT_ID,
      registeredByUserId: USER_ID,
      status: "WAITLISTED",
      confirmationCode: "SUN-WAIT",
      primaryContactName: "Ann Adams",
      primaryContactEmail: OWN_EMAIL,
      notes: null,
      memberId: MEMBER_ID,
      cancellationReason: null,
      waitlistPosition: 4,
    },
  ];
  store.lastFindWhere = null;
  store.lastFindSelect = null;
}

describe("member event calendar", () => {
  beforeEach(() => {
    seed();
    vi.clearAllMocks();
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: USER_ID,
      primaryEmail: OWN_EMAIL,
    });
    mocks.findPrimaryOrganization.mockResolvedValue({
      id: ORG_ID,
      name: "First United Pentecostal Church of Saco",
    });
  });

  it("denies signed-out members without looking up a registration", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(getMemberEventCalendar(OWN_REG, NOW)).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastFindWhere).toBeNull();
  });

  it("scopes the lookup to the current organization and signed-in account", async () => {
    await getMemberEventCalendar(
      {
        registrationId: OWN_REG,
        userId: OTHER_USER,
        userAccountId: OTHER_USER,
        organizationId: OTHER_ORG,
        memberId: MEMBER_ID,
        donorId: MEMBER_ID,
      },
      NOW,
    );
    expect(store.lastFindWhere).toEqual({
      id: OWN_REG,
      organizationId: ORG_ID,
      registeredByUserId: USER_ID,
      event: { organizationId: ORG_ID },
    });
    expect(JSON.stringify(store.lastFindWhere)).not.toContain(OTHER_USER);
    expect(JSON.stringify(store.lastFindWhere)).not.toContain(OTHER_ORG);
    expect(JSON.stringify(store.lastFindWhere)).not.toContain(MEMBER_ID);
  });

  it("does not return another member's or another organization's registration", async () => {
    await expect(getMemberEventCalendar(OTHER_USER_REG, NOW)).resolves.toEqual({
      status: "NOT_FOUND",
    });
    await expect(getMemberEventCalendar(OTHER_ORG_REG, NOW)).resolves.toEqual({
      status: "NOT_FOUND",
    });
  });

  it("denies cancelled and waitlisted registrations", async () => {
    await expect(getMemberEventCalendar(CANCELLED_REG, NOW)).resolves.toEqual({
      status: "NOT_FOUND",
    });
    await expect(getMemberEventCalendar(WAITLIST_REG, NOW)).resolves.toEqual({
      status: "NOT_FOUND",
    });
  });

  it("returns a safe ICS file and download headers for an eligible registration", async () => {
    const result = await getMemberEventCalendar(OWN_REG, NOW);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;

    expect(result.fileName).toBe("sunday-worship-fellowship-and-prayer.ics");
    expect(result.headers).toEqual({
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="sunday-worship-fellowship-and-prayer.ics"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    expect(result.ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(result.ics).toContain("BEGIN:VEVENT");
    expect(result.ics).toContain("END:VEVENT");
    expect(result.ics).toContain("END:VCALENDAR");
    expect(result.ics).toContain("UID:bits-SUN-7K2P@member-event");
    expect(result.ics).toContain("DTSTAMP:20260924T163000Z");
    expect(result.ics).toContain("DTSTART;TZID=America/New_York:20261004T103000");
    expect(result.ics).toContain("DTEND;TZID=America/New_York:20261004T120000");
    expect(result.ics).toContain(
      "SUMMARY:Sunday Worship\\; Fellowship\\, and Prayer",
    );
    expect(result.ics).toContain("DESCRIPTION:Join us this Sunday.\\nBring a friend.");
    expect(result.ics).toContain("LOCATION:Main Sanctuary\\, Sanctuary\\, Saco\\, ME");
    expect(store.lastFindSelect).toEqual({
      id: true,
      status: true,
      confirmationCode: true,
      event: {
        select: {
          title: true,
          shortDescription: true,
          startDateTime: true,
          endDateTime: true,
          timezone: true,
          isAllDay: true,
          location: {
            select: {
              name: true,
              roomName: true,
              isOnline: true,
              city: true,
              state: true,
            },
          },
        },
      },
    });
  });

  it("escapes and folds iCalendar text fields", () => {
    expect(escapeIcsText("A;B,C\nD\\E")).toBe("A\\;B\\,C\\nD\\\\E");
    const long = `DESCRIPTION:${"Church gathering. ".repeat(20)}`;
    const folded = foldIcsLine(long);
    expect(folded).toContain("\r\n ");
    expect(
      folded.split("\r\n").every((line) => Buffer.byteLength(line, "utf8") <= 75),
    ).toBe(true);
  });

  it("excludes private and internal fields from the ICS payload", async () => {
    const result = await getMemberEventCalendar(OWN_REG, NOW);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    const text = result.ics;
    expect(text).not.toContain(OWN_EMAIL);
    expect(text).not.toContain("staff-only@church.test");
    expect(text).not.toContain("207-555-0199");
    expect(text).not.toContain("staff only registration memo");
    expect(text).not.toContain("Internal long description");
    expect(text).not.toContain("Pay at the door");
    expect(text).not.toContain("25.00");
    expect(text).not.toContain("100 Secret Staff Street");
    expect(text).not.toContain("https://zoom.example/secret");
    expect(text).not.toContain(USER_ID);
    expect(text).not.toContain(MEMBER_ID);
    expect(text).not.toContain(OWN_REG);
    expect(text).not.toContain(EVENT_ID);
    expect(text).not.toMatch(/ATTENDEE/);
    expect(text).not.toMatch(/ORGANIZER/);
    expect(text).not.toMatch(/donorId/);
    expect(text).not.toMatch(/memberId/);
    expect(text).not.toMatch(/waitlistPosition/);
  });

  it("builds an all-day event with exclusive DATE values", async () => {
    store.events[0] = {
      ...store.events[0],
      isAllDay: true,
      startDateTime: new Date("2026-10-04T00:00:00.000Z"),
      endDateTime: new Date("2026-10-04T23:59:00.000Z"),
      timezone: "UTC",
    };
    const result = await getMemberEventCalendar(OWN_REG, NOW);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.ics).toContain("DTSTART;VALUE=DATE:20261004");
    expect(result.ics).toContain("DTEND;VALUE=DATE:20261005");
  });
});
