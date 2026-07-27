import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {},
}));

import {
  buildRRule,
  previewOccurrences,
  slugifyEventTitle,
  validateRecurrenceRule,
} from "@/lib/events/recurrence";
import { combineDateTime, eventSchema } from "@/lib/validation/events";
import { canViewEventVisibility } from "@/lib/auth/event-permissions";
import type { EventAccess } from "@/lib/auth/event-permissions";

describe("event slug generation", () => {
  it("slugifies titles", () => {
    expect(slugifyEventTitle("Sunday Morning Worship")).toBe(
      "sunday-morning-worship",
    );
  });
});

describe("event validation", () => {
  it("requires end after start", () => {
    const result = eventSchema.safeParse({
      title: "Test",
      startDate: "2026-08-01",
      startTime: "10:00",
      endDate: "2026-08-01",
      endTime: "09:00",
      timezone: "America/Chicago",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid draft event", () => {
    const result = eventSchema.safeParse({
      title: "Bible Study",
      startDate: "2026-08-01",
      startTime: "18:00",
      endDate: "2026-08-01",
      endTime: "19:30",
      timezone: "America/Chicago",
      visibility: "PUBLIC",
    });
    expect(result.success).toBe(true);
  });

  it("combines date and time", () => {
    const value = combineDateTime("2026-08-01", "18:30");
    expect(value?.toISOString()).toContain("2026-08-01T18:30");
  });
});

describe("recurrence", () => {
  it("builds weekly RRULE", () => {
    expect(
      buildRRule({ preset: "WEEKLY", byDay: "SU", interval: 1 }),
    ).toContain("FREQ=WEEKLY");
  });

  it("rejects invalid custom rules", () => {
    expect(validateRecurrenceRule("INTERVAL=1").ok).toBe(false);
  });

  it("previews bounded weekly occurrences", () => {
    const start = new Date("2026-08-02T10:00:00.000Z");
    const end = new Date("2026-08-02T11:00:00.000Z");
    const items = previewOccurrences(start, end, "FREQ=WEEKLY;INTERVAL=1;BYDAY=SU", {
      windowMonths: 3,
      maxOccurrences: 10,
    });
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(10);
  });
});

describe("event visibility", () => {
  const base: EventAccess = {
    canView: true,
    canCreate: false,
    canEdit: false,
    canPublish: false,
    canCancel: false,
    canArchive: false,
    canDeleteDraft: false,
    canManageRegistration: false,
    canReadSensitiveAttendee: false,
    canCheckIn: false,
    canReadCheckIn: false,
    canOperateCheckIn: false,
    canManageCheckIn: false,
    canCreateWalkIn: false,
    canCorrectAttendance: false,
    canExportAttendance: false,
    canExportRegistrations: false,
    canManageCategories: false,
    canManageLocations: false,
    canManageOrganizers: false,
    canManageMinistries: false,
    canViewPrivate: false,
    canViewStaffOnly: true,
    canViewDrafts: true,
    roleCode: null,
    isSuperAdmin: false,
    userAccountId: "u1",
  };

  it("hides private events without permission", () => {
    expect(canViewEventVisibility(base, "PRIVATE", "PUBLISHED")).toBe(false);
  });

  it("allows staff-only for staff viewers", () => {
    expect(canViewEventVisibility(base, "STAFF_ONLY", "PUBLISHED")).toBe(true);
  });

  it("hides drafts without draft permission", () => {
    expect(
      canViewEventVisibility({ ...base, canViewDrafts: false }, "PUBLIC", "DRAFT"),
    ).toBe(false);
  });

  it("allows private when canViewPrivate", () => {
    expect(
      canViewEventVisibility(
        { ...base, canViewPrivate: true },
        "PRIVATE",
        "PUBLISHED",
      ),
    ).toBe(true);
  });
});

describe("registration date validation", () => {
  it("rejects close before open", () => {
    const result = eventSchema.safeParse({
      title: "Registration Event",
      startDate: "2026-09-01",
      startTime: "10:00",
      endDate: "2026-09-01",
      endTime: "12:00",
      timezone: "America/Chicago",
      registrationOpenDate: "2026-08-20T00:00",
      registrationCloseDate: "2026-08-10T00:00",
    });
    expect(result.success).toBe(false);
  });
});

describe("duplicate occurrence prevention", () => {
  it("deduplicates identical start times in preview", () => {
    const start = new Date("2026-08-02T10:00:00.000Z");
    const end = new Date("2026-08-02T11:00:00.000Z");
    const items = previewOccurrences(start, end, "FREQ=WEEKLY;INTERVAL=1", {
      windowMonths: 1,
      maxOccurrences: 5,
    });
    const keys = items.map((i) => i.start.toISOString());
    expect(new Set(keys).size).toBe(keys.length);
  });
});
