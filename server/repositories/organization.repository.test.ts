import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    organization: {
      findFirst: mocks.findFirst,
    },
  },
}));

import { findPrimaryOrganization } from "./organization.repository";

describe("findPrimaryOrganization", () => {
  beforeEach(() => {
    mocks.findFirst.mockReset();
  });

  it("returns the first organization when the database is reachable", async () => {
    const organization = { id: "00000000-0000-4000-8000-00000000a001" };
    mocks.findFirst.mockResolvedValue(organization);
    await expect(findPrimaryOrganization()).resolves.toEqual(organization);
    expect(mocks.findFirst).toHaveBeenCalledWith({
      orderBy: { createdAt: "asc" },
    });
  });

  it("returns null when Postgres refuses the connection", async () => {
    mocks.findFirst.mockRejectedValue(
      Object.assign(new Error("connect ECONNREFUSED"), {
        code: "ECONNREFUSED",
      }),
    );
    await expect(findPrimaryOrganization()).resolves.toBeNull();
  });

  it("rethrows unexpected Prisma errors", async () => {
    mocks.findFirst.mockRejectedValue(
      Object.assign(new Error("Unknown argument"), { code: "P2009" }),
    );
    await expect(findPrimaryOrganization()).rejects.toThrow("Unknown argument");
  });
});
