import { describe, expect, it } from "vitest";

import { canShowCheckInStationsNav } from "@/lib/auth/check-in-station-nav";

/**
 * Mirrors `app/(staff)/events/[id]/check-in-stations/page.tsx` server guard.
 * Direct URL access without manage permission must not render the page.
 */
function canAccessCheckInStationsPage(access: { canManageCheckIn?: boolean }) {
  return canShowCheckInStationsNav(access);
}

describe("check-in stations page access", () => {
  it("allows managers", () => {
    expect(canAccessCheckInStationsPage({ canManageCheckIn: true })).toBe(true);
  });

  it("denies operate-only and unauthorized (notFound behavior)", () => {
    expect(canAccessCheckInStationsPage({ canManageCheckIn: false })).toBe(
      false,
    );
    expect(canAccessCheckInStationsPage({})).toBe(false);
  });
});
