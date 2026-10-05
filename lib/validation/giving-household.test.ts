import { describe, expect, it } from "vitest";

import {
  addUtcDays,
  calendarDateInTimeZone,
  compareUtcDates,
  formatDateOnly,
  membershipIntervalsOverlap,
  parseDateOnly,
} from "./giving-household";
import { householdMembershipCoversOfferingDate } from "@/lib/statements/household-membership";

describe("giving household date helpers", () => {
  it("parses date-only values in UTC and rejects impossible days", () => {
    expect(formatDateOnly(parseDateOnly("2024-02-29")!)).toBe("2024-02-29");
    expect(parseDateOnly("2023-02-29")).toBeNull();
    expect(parseDateOnly("2026-13-01")).toBeNull();
  });

  it("subtracts one calendar day across month and year boundaries", () => {
    expect(formatDateOnly(addUtcDays(parseDateOnly("2026-03-01")!, -1))).toBe(
      "2026-02-28",
    );
    expect(formatDateOnly(addUtcDays(parseDateOnly("2024-03-01")!, -1))).toBe(
      "2024-02-29",
    );
    expect(formatDateOnly(addUtcDays(parseDateOnly("2027-01-01")!, -1))).toBe(
      "2026-12-31",
    );
  });

  it("treats inclusive adjacent intervals as non-overlapping", () => {
    const previous = {
      startDate: parseDateOnly("2026-01-01")!,
      endDate: parseDateOnly("2026-06-14")!,
    };
    const next = {
      startDate: parseDateOnly("2026-06-15")!,
      endDate: null,
    };
    expect(membershipIntervalsOverlap(previous, next)).toBe(false);
    expect(
      membershipIntervalsOverlap(previous, {
        startDate: parseDateOnly("2026-06-14")!,
        endDate: null,
      }),
    ).toBe(true);
  });

  it("attributes a gift on D-1 to the old household and a gift on D to the new one", () => {
    const oldMembership = {
      startDate: parseDateOnly("2026-01-01")!,
      endDate: parseDateOnly("2026-06-14")!,
    };
    const newMembership = {
      startDate: parseDateOnly("2026-06-15")!,
      endDate: null,
    };
    expect(
      householdMembershipCoversOfferingDate(
        oldMembership,
        parseDateOnly("2026-06-14")!,
      ),
    ).toBe(true);
    expect(
      householdMembershipCoversOfferingDate(
        newMembership,
        parseDateOnly("2026-06-14")!,
      ),
    ).toBe(false);
    expect(
      householdMembershipCoversOfferingDate(
        oldMembership,
        parseDateOnly("2026-06-15")!,
      ),
    ).toBe(false);
    expect(
      householdMembershipCoversOfferingDate(
        newMembership,
        parseDateOnly("2026-06-15")!,
      ),
    ).toBe(true);
  });

  it("derives the church calendar date from a timezone, not local subtraction", () => {
    const now = new Date("2026-10-04T02:30:00.000Z");
    expect(calendarDateInTimeZone(now, "America/New_York")).toBe("2026-10-03");
    expect(calendarDateInTimeZone(now, "UTC")).toBe("2026-10-04");
    expect(compareUtcDates(parseDateOnly("2026-10-03")!, parseDateOnly("2026-10-04")!)).toBeLessThan(0);
  });
});
