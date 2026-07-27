import { describe, expect, it } from "vitest";

import { MembershipStatus } from "@/app/generated/prisma/client";
import {
  buildMemberAuditChanges,
  emptyMemberFormValues,
  getMemberDisplayName,
  memberSchema,
} from "@/lib/validation/member";

describe("memberSchema", () => {
  it("requires first name, last name, and membership status", () => {
    const result = memberSchema.safeParse({
      firstName: "",
      lastName: "",
      membershipStatus: MembershipStatus.VISITOR,
    });

    expect(result.success).toBe(false);
  });

  it("validates email, phone, and zip formats", () => {
    const result = memberSchema.safeParse({
      firstName: "Alex",
      lastName: "Rivera",
      membershipStatus: MembershipStatus.MEMBER,
      email: "not-an-email",
      phone: "123",
      postalCode: "ABCDE",
    });

    expect(result.success).toBe(false);
  });

  it("accepts valid member input", () => {
    const result = memberSchema.safeParse({
      ...emptyMemberFormValues,
      firstName: "Alex",
      lastName: "Rivera",
      membershipStatus: MembershipStatus.MEMBER,
      email: "Alex@Example.ORG",
      phone: "6155551001",
      postalCode: "37203",
      memberSince: "2024-01-15",
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.phone).toBe("(615) 555-1001");
      expect(result.data.email).toBe("alex@example.org");
    }
  });

  it("normalizes phone with formatting and country code", () => {
    const result = memberSchema.safeParse({
      ...emptyMemberFormValues,
      firstName: "Alex",
      lastName: "Rivera",
      membershipStatus: MembershipStatus.MEMBER,
      phone: "+1 615-555-1001",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBe("+1 (615) 555-1001");
    }
  });
});

describe("member helpers", () => {
  it("builds a display name from preferred name", () => {
    expect(
      getMemberDisplayName({
        preferredName: "Alex",
        firstName: "Alexander",
        lastName: "Rivera",
      }),
    ).toBe("Alex Rivera");
  });

  it("records audit field changes", () => {
    const changes = buildMemberAuditChanges(
      { firstName: "Alex", lastName: "Rivera" },
      { firstName: "Alexander", lastName: "Rivera" },
    );

    expect(changes).toEqual([
      {
        field: "firstName",
        oldValue: "Alex",
        newValue: "Alexander",
      },
    ]);
  });
});
