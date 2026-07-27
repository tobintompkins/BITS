import { describe, expect, it } from "vitest";

import {
  canViewPrayerPrivacy,
  sanitizePastoralNoteForAccess,
  type CarePrivacyAccess,
} from "@/lib/auth/care-privacy";

function access(overrides: Partial<CarePrivacyAccess> = {}): CarePrivacyAccess {
  return {
    isSuperAdmin: false,
    canViewPrayerRequests: true,
    canViewPastoralStaffPrayer: false,
    canViewPrivatePrayer: false,
    canViewConfidentialPastoralCare: false,
    userAccountId: "user-1",
    ...overrides,
  };
}

describe("canViewPrayerPrivacy", () => {
  it("allows public and prayer-team for viewers", () => {
    const viewer = access();
    expect(canViewPrayerPrivacy(viewer, "PUBLIC")).toBe(true);
    expect(canViewPrayerPrivacy(viewer, "PRAYER_TEAM")).toBe(true);
  });

  it("restricts pastoral-staff and private levels", () => {
    const viewer = access();
    expect(canViewPrayerPrivacy(viewer, "PASTORAL_STAFF")).toBe(false);
    expect(canViewPrayerPrivacy(viewer, "PRIVATE")).toBe(false);
  });

  it("allows private prayer for creator or elevated access", () => {
    const creator = access({ userAccountId: "user-1" });
    expect(canViewPrayerPrivacy(creator, "PRIVATE", "user-1")).toBe(true);

    const elevated = access({ canViewPrivatePrayer: true });
    expect(canViewPrayerPrivacy(elevated, "PRIVATE", "other")).toBe(true);
  });
});

describe("sanitizePastoralNoteForAccess", () => {
  it("redacts confidential notes without access", () => {
    const result = sanitizePastoralNoteForAccess(
      {
        isConfidential: true,
        title: "Hospital visit",
        note: "Sensitive details",
      },
      access(),
    );

    expect(result.restricted).toBe(true);
    expect(result.note).toBe("[Confidential — restricted]");
    expect(result.title).toBe("Hospital visit");
  });

  it("passes through when confidential access is granted", () => {
    const result = sanitizePastoralNoteForAccess(
      {
        isConfidential: true,
        title: "Hospital visit",
        note: "Sensitive details",
      },
      access({ canViewConfidentialPastoralCare: true }),
    );

    expect(result.restricted).toBe(false);
    expect(result.note).toBe("Sensitive details");
  });
});
