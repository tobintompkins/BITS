import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
  donorFindFirst: vi.fn(),
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    donor: {
      findFirst: (...args: unknown[]) => mocks.donorFindFirst(...args),
    },
  },
}));

import { getMemberPortalHelp } from "./member-portal-help.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const CLERK_ORG = "org_secret_clerk_id";
const EIN = "12-3456789";
const LOGO_KEY = "org-logos/secret-logo.png";
const FOOTER = "Internal statement footer for staff only";

function fatOrganization(overrides: Record<string, unknown> = {}) {
  return {
    id: ORG_ID,
    clerkOrganizationId: CLERK_ORG,
    name: "First United Pentecostal Church of Saco",
    displayName: "First UPC of Saco",
    slug: "first-upc-saco",
    ein: EIN,
    mailingAddressLine1: "100 Church Street",
    mailingAddressLine2: "Suite 2",
    city: "Saco",
    state: "ME",
    postalCode: "04072",
    country: "US",
    contactEmail: "office@church.test",
    contactPhone: "(207) 555-0100",
    websiteUrl: "https://church.test",
    logoStorageKey: LOGO_KEY,
    statementFooterText: FOOTER,
    timeZone: "America/New_York",
    locale: "en-US",
    active: true,
    createdAt: new Date("2020-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("member portal help", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: USER_ID,
      primaryEmail: "ann@church.test",
      displayName: "Ann Adams",
    });
    mocks.findPrimaryOrganization.mockResolvedValue(fatOrganization());
    mocks.donorFindFirst.mockResolvedValue({ id: "donor-should-not-load" });
  });

  it("returns signed out without loading organization details", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(getMemberPortalHelp()).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(mocks.findPrimaryOrganization).not.toHaveBeenCalled();
    expect(mocks.donorFindFirst).not.toHaveBeenCalled();
  });

  it("returns a safe no-organization state", async () => {
    mocks.findPrimaryOrganization.mockResolvedValue(null);
    await expect(getMemberPortalHelp()).resolves.toEqual({
      status: "NO_ORGANIZATION",
    });
    expect(mocks.donorFindFirst).not.toHaveBeenCalled();
  });

  it("returns only the public contact allow-list and does not require a donor", async () => {
    const result = await getMemberPortalHelp();
    expect(result).toEqual({
      status: "READY",
      organization: {
        name: "First United Pentecostal Church of Saco",
        displayName: "First UPC of Saco",
        contactEmail: "office@church.test",
        contactPhone: "(207) 555-0100",
        websiteUrl: "https://church.test",
        timeZone: "America/New_York",
        mailingAddress: {
          mailingAddressLine1: "100 Church Street",
          mailingAddressLine2: "Suite 2",
          city: "Saco",
          state: "ME",
          postalCode: "04072",
          country: "US",
        },
      },
    });
    expect(mocks.donorFindFirst).not.toHaveBeenCalled();
    const text = JSON.stringify(result);
    expect(text).not.toContain(ORG_ID);
    expect(text).not.toContain(CLERK_ORG);
    expect(text).not.toContain(EIN);
    expect(text).not.toContain(LOGO_KEY);
    expect(text).not.toContain(FOOTER);
    expect(text).not.toContain("first-upc-saco");
    expect(text).not.toMatch(/clerkOrganizationId/);
    expect(text).not.toMatch(/logoStorageKey/);
    expect(text).not.toMatch(/statementFooterText/);
    expect(text).not.toMatch(/ein/i);
    expect(Object.keys(result.status === "READY" ? result.organization : {})).toEqual(
      [
        "name",
        "displayName",
        "contactEmail",
        "contactPhone",
        "websiteUrl",
        "timeZone",
        "mailingAddress",
      ],
    );
  });

  it("falls back when contact details are empty or invalid", async () => {
    mocks.findPrimaryOrganization.mockResolvedValue(
      fatOrganization({
        displayName: "  ",
        contactEmail: "not-an-email",
        contactPhone: "abc",
        websiteUrl: "javascript:alert(1)",
        mailingAddressLine1: "   ",
        mailingAddressLine2: null,
        city: "",
        state: "",
        postalCode: "",
        country: "US",
        timeZone: "  ",
      }),
    );
    await expect(getMemberPortalHelp()).resolves.toEqual({
      status: "READY",
      organization: {
        name: "First United Pentecostal Church of Saco",
        displayName: "First United Pentecostal Church of Saco",
        contactEmail: null,
        contactPhone: null,
        websiteUrl: null,
        timeZone: null,
        mailingAddress: null,
      },
    });
  });

  it("does not leak sensitive organization fields from a fat record", async () => {
    const result = await getMemberPortalHelp();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result).not.toHaveProperty("ein");
    expect(result.organization).not.toHaveProperty("id");
    expect(result.organization).not.toHaveProperty("slug");
    expect(result.organization).not.toHaveProperty("clerkOrganizationId");
    expect(result.organization).not.toHaveProperty("logoStorageKey");
    expect(result.organization).not.toHaveProperty("statementFooterText");
    expect(result.organization).not.toHaveProperty("locale");
    expect(result.organization).not.toHaveProperty("active");
  });
});
