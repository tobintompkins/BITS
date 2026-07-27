import { describe, expect, it } from "vitest";

import { STAFF_PARTY_CHECK_IN_MAX_ATTENDEES } from "@/lib/constants/staff-party-check-in";
import {
  staffPartyCheckInApiBodySchema,
  staffPartyCheckInApiEventIdSchema,
  staffPartyCheckInApiRegistrationIdSchema,
  staffPartyCheckInIdempotencyKeySchema,
} from "@/lib/validation/staff-party-check-in-api";

const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000b2";

describe("staff party check-in API validation", () => {
  it("accepts a bounded attendeeIds body", () => {
    const result = staffPartyCheckInApiBodySchema.safeParse({
      attendeeIds: [A, B],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.attendeeIds).toEqual([A, B]);
    }
  });

  it("dedupes duplicate IDs like 7.3F (first-seen order)", () => {
    const result = staffPartyCheckInApiBodySchema.safeParse({
      attendeeIds: [A, A, B, A],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.attendeeIds).toEqual([A, B]);
    }
  });

  it("rejects empty, non-array, and over-limit lists", () => {
    expect(
      staffPartyCheckInApiBodySchema.safeParse({ attendeeIds: [] }).success,
    ).toBe(false);
    expect(
      staffPartyCheckInApiBodySchema.safeParse({ attendeeIds: "nope" }).success,
    ).toBe(false);

    const tooMany = Array.from(
      { length: STAFF_PARTY_CHECK_IN_MAX_ATTENDEES + 1 },
      (_, i) => {
        const n = (i + 1).toString(16).padStart(12, "0");
        return `55555555-5555-4555-8555-${n}`;
      },
    );
    expect(
      staffPartyCheckInApiBodySchema.safeParse({ attendeeIds: tooMany })
        .success,
    ).toBe(false);
  });

  it("rejects unknown/server-owned fields and select-all flags", () => {
    expect(
      staffPartyCheckInApiBodySchema.safeParse({
        attendeeIds: [A],
        source: "STAFF_SEARCH",
        all: true,
        organizationId: "00000000-0000-4000-8000-000000000099",
      }).success,
    ).toBe(false);
  });

  it("accepts optional stationId and rejects blank/malformed values", () => {
    const withStation = staffPartyCheckInApiBodySchema.safeParse({
      attendeeIds: [A],
      stationId: B,
    });
    expect(withStation.success).toBe(true);
    if (withStation.success) {
      expect(withStation.data.stationId).toBe(B);
    }

    expect(
      staffPartyCheckInApiBodySchema.safeParse({
        attendeeIds: [A],
        stationId: "",
      }).success,
    ).toBe(false);

    expect(
      staffPartyCheckInApiBodySchema.safeParse({
        attendeeIds: [A],
        stationId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  it("validates opaque path ids and idempotency keys", () => {
    expect(staffPartyCheckInApiEventIdSchema.safeParse(A).success).toBe(true);
    expect(
      staffPartyCheckInApiRegistrationIdSchema.safeParse("bad").success,
    ).toBe(false);
    expect(staffPartyCheckInIdempotencyKeySchema.safeParse("k").success).toBe(
      true,
    );
    expect(
      staffPartyCheckInIdempotencyKeySchema.safeParse("x".repeat(121)).success,
    ).toBe(false);
  });
});
