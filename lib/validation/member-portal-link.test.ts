import { describe, expect, it } from "vitest";

import {
  connectPersonRecordsSchema,
  createLinkedDonorSchema,
} from "./member-portal-link";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";

describe("member portal account linking validation", () => {
  it("accepts an account id and the records an administrator selected", () => {
    const result = connectPersonRecordsSchema.parse({
      userAccountId: ACCOUNT,
      donorId: "22222222-2222-4222-8222-222222222222",
      memberId: "",
      profileId: "",
      confirmed: "on",
    });
    expect(result.userAccountId).toBe(ACCOUNT);
    expect(result.donorId).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("refuses a connection that is not confirmed or is identified by email", () => {
    expect(
      connectPersonRecordsSchema.safeParse({
        userAccountId: ACCOUNT,
        donorId: "22222222-2222-4222-8222-222222222222",
        confirmed: "",
      }).success,
    ).toBe(false);
    expect(
      connectPersonRecordsSchema.safeParse({
        userAccountId: "member@example.com",
        confirmed: "on",
      }).success,
    ).toBe(false);
  });

  it("requires an account id when creating a donor", () => {
    expect(
      createLinkedDonorSchema.safeParse({
        userAccountId: ACCOUNT,
        firstName: "Ada",
        lastName: "Adams",
      }).success,
    ).toBe(true);
    expect(
      createLinkedDonorSchema.safeParse({
        userAccountId: "member@example.com",
        firstName: "Ada",
        lastName: "Adams",
      }).success,
    ).toBe(false);
  });
});
