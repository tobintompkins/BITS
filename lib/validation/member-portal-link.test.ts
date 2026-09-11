import { describe, expect, it } from "vitest";

import {
  createLinkedDonorSchema,
  linkExistingDonorSchema,
} from "./member-portal-link";

describe("member portal account linking validation", () => {
  it("normalizes account email", () => {
    const result = linkExistingDonorSchema.parse({
      donorId: "11111111-1111-4111-8111-111111111111",
      accountEmail: " Member@Example.COM ",
    });
    expect(result.accountEmail).toBe("member@example.com");
  });

  it("requires a valid account email", () => {
    expect(
      createLinkedDonorSchema.safeParse({
        accountEmail: "not-an-email",
        firstName: "Toby",
        lastName: "Tompkins",
      }).success,
    ).toBe(false);
  });

  it("requires donor names when creating a linked record", () => {
    expect(
      createLinkedDonorSchema.safeParse({
        accountEmail: "member@example.com",
        firstName: "",
        lastName: "",
      }).success,
    ).toBe(false);
  });
});
