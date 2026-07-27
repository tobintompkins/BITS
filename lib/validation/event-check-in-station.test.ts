import { describe, expect, it } from "vitest";

import {
  assertStationTimestampInvariants,
  createActiveStationInputSchema,
  toStationNameNormalized,
} from "@/lib/validation/event-check-in-station";

const org = "00000000-0000-4000-8000-000000000001";
const eventId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000003";

describe("event check-in station validation", () => {
  it("accepts trimmed names and nullable device labels", () => {
    const parsed = createActiveStationInputSchema.safeParse({
      organizationId: org,
      eventId,
      name: "  Main Lobby  ",
      deviceLabel: "  ",
      openedByUserId: userId,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe("Main Lobby");
      expect(parsed.data.deviceLabel).toBeNull();
    }
  });

  it("rejects blank and overlong names", () => {
    expect(
      createActiveStationInputSchema.safeParse({
        organizationId: org,
        eventId,
        name: "   ",
        openedByUserId: userId,
      }).success,
    ).toBe(false);

    expect(
      createActiveStationInputSchema.safeParse({
        organizationId: org,
        eventId,
        name: "x".repeat(81),
        openedByUserId: userId,
      }).success,
    ).toBe(false);
  });

  it("rejects overlong device labels", () => {
    expect(
      createActiveStationInputSchema.safeParse({
        organizationId: org,
        eventId,
        name: "Door A",
        deviceLabel: "d".repeat(81),
        openedByUserId: userId,
      }).success,
    ).toBe(false);
  });

  it("normalizes names case-insensitively", () => {
    expect(toStationNameNormalized("  Main Door ")).toBe("main door");
  });

  it("rejects closed/activity timestamps before openedAt", () => {
    const openedAt = new Date("2030-01-15T15:00:00.000Z");
    expect(() =>
      assertStationTimestampInvariants({
        openedAt,
        closedAt: new Date("2030-01-15T14:59:59.000Z"),
      }),
    ).toThrow(/closedAt/i);

    expect(() =>
      assertStationTimestampInvariants({
        openedAt,
        lastActivityAt: new Date("2030-01-15T14:59:59.000Z"),
      }),
    ).toThrow(/lastActivityAt/i);
  });
});
