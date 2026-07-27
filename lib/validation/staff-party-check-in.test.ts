import { describe, expect, it } from "vitest";

import { STAFF_PARTY_CHECK_IN_MAX_ATTENDEES } from "@/lib/constants/staff-party-check-in";
import {
  normalizeStaffPartyAttendeeIds,
  staffPartyCheckInInputSchema,
} from "@/lib/validation/staff-party-check-in";

describe("normalizeStaffPartyAttendeeIds", () => {
  it("trims, drops empties, and dedupes preserving first-seen order", () => {
    expect(
      normalizeStaffPartyAttendeeIds([
        "  a  ",
        "b",
        "a",
        "",
        "  ",
        "c",
        "b",
      ]),
    ).toEqual(["a", "b", "c"]);
  });
});

describe("staffPartyCheckInInputSchema", () => {
  const eventId = "11111111-1111-4111-8111-111111111111";
  const registrationId = "22222222-2222-4222-8222-222222222222";
  const a = "33333333-3333-4333-8333-333333333333";
  const b = "44444444-4444-4444-8444-444444444444";

  it("accepts a bounded non-empty attendee list", () => {
    const parsed = staffPartyCheckInInputSchema.safeParse({
      eventId,
      registrationId,
      attendeeIds: [a, b],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an empty list", () => {
    const parsed = staffPartyCheckInInputSchema.safeParse({
      eventId,
      registrationId,
      attendeeIds: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects over-limit lists", () => {
    const ids = Array.from({ length: STAFF_PARTY_CHECK_IN_MAX_ATTENDEES + 1 }, (_, i) => {
      const n = (i + 1).toString(16).padStart(12, "0");
      return `55555555-5555-4555-8555-${n}`;
    });
    const parsed = staffPartyCheckInInputSchema.safeParse({
      eventId,
      registrationId,
      attendeeIds: ids,
    });
    expect(parsed.success).toBe(false);
  });
});
