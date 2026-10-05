import { describe, expect, it } from "vitest";

import { parseDateOnly } from "@/lib/validation/giving-household";

import { attributeGiftToHousehold } from "./household-attribution";

const start = parseDateOnly("2026-01-01")!;
const mid = parseDateOnly("2026-06-15")!;
const before = parseDateOnly("2026-06-14")!;

describe("household gift attribution", () => {
  it("attributes D-1 to the old household and D to the new household", () => {
    const memberships = [
      { householdId: "old", startDate: start, endDate: before },
      { householdId: "new", startDate: mid, endDate: null },
    ];
    expect(
      attributeGiftToHousehold(
        { donorId: "d1", anonymous: false, offeringDate: before },
        memberships,
      ),
    ).toEqual({ bucket: "household", householdId: "old" });
    expect(
      attributeGiftToHousehold(
        { donorId: "d1", anonymous: false, offeringDate: mid },
        memberships,
      ),
    ).toEqual({ bucket: "household", householdId: "new" });
  });

  it("deduplicates same-household rows and marks distinct overlaps", () => {
    const same = [
      { householdId: "hh", startDate: start, endDate: null },
      { householdId: "hh", startDate: start, endDate: before },
    ];
    expect(
      attributeGiftToHousehold(
        { donorId: "d1", anonymous: false, offeringDate: mid },
        same,
      ),
    ).toEqual({ bucket: "household", householdId: "hh" });
    expect(
      attributeGiftToHousehold(
        { donorId: "d1", anonymous: false, offeringDate: mid },
        [
          { householdId: "a", startDate: start, endDate: null },
          { householdId: "b", startDate: start, endDate: null },
        ],
      ),
    ).toEqual({ bucket: "ambiguous", householdIds: ["a", "b"] });
  });

  it("keeps anonymous, unmatched and gap gifts out of household totals", () => {
    expect(
      attributeGiftToHousehold(
        { donorId: "d1", anonymous: true, offeringDate: mid },
        [{ householdId: "hh", startDate: start, endDate: null }],
      ),
    ).toEqual({ bucket: "anonymous" });
    expect(
      attributeGiftToHousehold(
        { donorId: null, anonymous: false, offeringDate: mid },
        [],
      ),
    ).toEqual({ bucket: "unmatched" });
    expect(
      attributeGiftToHousehold(
        { donorId: "d1", anonymous: false, offeringDate: mid },
        [{ householdId: "hh", startDate: start, endDate: before }],
      ),
    ).toEqual({ bucket: "unassigned" });
  });
});
