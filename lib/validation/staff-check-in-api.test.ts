import { describe, expect, it } from "vitest";

import {
  staffCheckInApiBodySchema,
  staffCheckInApiEventIdSchema,
  staffCheckInIdempotencyKeySchema,
} from "@/lib/validation/staff-check-in-api";

describe("staff check-in API validation", () => {
  it("accepts a valid attendeeId body", () => {
    const result = staffCheckInApiBodySchema.safeParse({
      attendeeId: "00000000-0000-4000-8000-000000000001",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing attendeeId", () => {
    expect(staffCheckInApiBodySchema.safeParse({}).success).toBe(false);
  });

  it("rejects unknown/server-owned fields", () => {
    const result = staffCheckInApiBodySchema.safeParse({
      attendeeId: "00000000-0000-4000-8000-000000000001",
      source: "STAFF_SEARCH",
      organizationId: "00000000-0000-4000-8000-000000000099",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional stationId and rejects blank/malformed values", () => {
    const withStation = staffCheckInApiBodySchema.safeParse({
      attendeeId: "00000000-0000-4000-8000-000000000001",
      stationId: "00000000-0000-4000-8000-0000000000aa",
    });
    expect(withStation.success).toBe(true);

    expect(
      staffCheckInApiBodySchema.safeParse({
        attendeeId: "00000000-0000-4000-8000-000000000001",
        stationId: "",
      }).success,
    ).toBe(false);

    expect(
      staffCheckInApiBodySchema.safeParse({
        attendeeId: "00000000-0000-4000-8000-000000000001",
        stationId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  it("rejects malformed event ids", () => {
    expect(staffCheckInApiEventIdSchema.safeParse("not-a-uuid").success).toBe(
      false,
    );
  });

  it("bounds idempotency keys", () => {
    expect(staffCheckInIdempotencyKeySchema.safeParse("abc").success).toBe(
      true,
    );
    expect(
      staffCheckInIdempotencyKeySchema.safeParse("x".repeat(121)).success,
    ).toBe(false);
  });
});
