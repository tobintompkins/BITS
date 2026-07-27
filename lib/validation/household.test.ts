import { describe, expect, it } from "vitest";

import {
  buildHouseholdAuditChanges,
  householdSchema,
  linkMemberToHouseholdSchema,
} from "@/lib/validation/household";

describe("householdSchema", () => {
  it("requires household name", () => {
    const result = householdSchema.safeParse({ householdName: "" });

    expect(result.success).toBe(false);
  });

  it("validates ZIP codes", () => {
    const invalid = householdSchema.safeParse({
      householdName: "Smith Family",
      postalCode: "invalid",
    });

    expect(invalid.success).toBe(false);

    const valid = householdSchema.safeParse({
      householdName: "Smith Family",
      primaryContactId: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      postalCode: "37203",
      country: "US",
    });

    expect(valid.success).toBe(true);
  });
});

describe("linkMemberToHouseholdSchema", () => {
  it("requires relationship when linking", () => {
    const result = linkMemberToHouseholdSchema.safeParse({
      memberId: "00000000-0000-4000-8000-000000000201",
      householdId: "00000000-0000-4000-8000-000000000101",
      relationshipToHousehold: "SPOUSE",
    });

    expect(result.success).toBe(true);
  });

  it("rejects missing relationship", () => {
    const result = linkMemberToHouseholdSchema.safeParse({
      memberId: "00000000-0000-4000-8000-000000000201",
      householdId: "00000000-0000-4000-8000-000000000101",
    });

    expect(result.success).toBe(false);
  });
});

describe("buildHouseholdAuditChanges", () => {
  it("records changed fields", () => {
    const changes = buildHouseholdAuditChanges(
      { householdName: "Old Name", city: "Nashville" },
      { householdName: "New Name", city: "Nashville" },
    );

    expect(changes).toEqual([
      {
        field: "householdName",
        oldValue: "Old Name",
        newValue: "New Name",
      },
    ]);
  });
});
