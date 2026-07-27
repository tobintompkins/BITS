import { describe, expect, it } from "vitest";

import {
  staffCheckOutApiBodySchema,
  staffCheckOutApiEventIdSchema,
  staffCheckOutIdempotencyKeySchema,
} from "@/lib/validation/staff-check-out-api";

const ATTENDEE_ID = "00000000-0000-4000-8000-00000000a001";
const STATION_ID = "00000000-0000-4000-8000-00000000b001";

describe("staff-check-out-api validation", () => {
  it("accepts attendeeId and optional stationId", () => {
    expect(
      staffCheckOutApiBodySchema.parse({ attendeeId: ATTENDEE_ID }),
    ).toEqual({ attendeeId: ATTENDEE_ID });
    expect(
      staffCheckOutApiBodySchema.parse({
        attendeeId: ATTENDEE_ID,
        stationId: STATION_ID,
      }),
    ).toEqual({ attendeeId: ATTENDEE_ID, stationId: STATION_ID });
  });

  it("rejects unknown fields and client-owned server fields", () => {
    expect(
      staffCheckOutApiBodySchema.safeParse({
        attendeeId: ATTENDEE_ID,
        organizationId: "org",
      }).success,
    ).toBe(false);
    expect(
      staffCheckOutApiBodySchema.safeParse({
        attendeeId: ATTENDEE_ID,
        status: "CHECKED_OUT",
      }).success,
    ).toBe(false);
    expect(
      staffCheckOutApiBodySchema.safeParse({
        attendeeId: ATTENDEE_ID,
        source: "STAFF_SEARCH",
      }).success,
    ).toBe(false);
    expect(
      staffCheckOutApiBodySchema.safeParse({
        attendeeId: ATTENDEE_ID,
        checkInCount: 2,
      }).success,
    ).toBe(false);
  });

  it("rejects empty-string stationId (not coerced to omit)", () => {
    expect(
      staffCheckOutApiBodySchema.safeParse({
        attendeeId: ATTENDEE_ID,
        stationId: "",
      }).success,
    ).toBe(false);
  });

  it("validates event id and idempotency key shape", () => {
    expect(
      staffCheckOutApiEventIdSchema.safeParse(
        "00000000-0000-4000-8000-00000000e001",
      ).success,
    ).toBe(true);
    expect(staffCheckOutApiEventIdSchema.safeParse("not-a-uuid").success).toBe(
      false,
    );
    expect(staffCheckOutIdempotencyKeySchema.safeParse("key-1").success).toBe(
      true,
    );
    expect(
      staffCheckOutIdempotencyKeySchema.safeParse("x".repeat(121)).success,
    ).toBe(false);
  });
});
