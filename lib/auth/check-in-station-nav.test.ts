import { describe, expect, it } from "vitest";

import { canShowCheckInStationsNav } from "@/lib/auth/check-in-station-nav";

describe("check-in stations navigation visibility", () => {
  it("shows only for canManageCheckIn", () => {
    expect(canShowCheckInStationsNav({ canManageCheckIn: true })).toBe(true);
  });

  it("hides for operate-only and unauthorized users", () => {
    expect(canShowCheckInStationsNav({ canManageCheckIn: false })).toBe(false);
    expect(canShowCheckInStationsNav({})).toBe(false);
  });

  it("does not treat operate/check-in aliases as sufficient", () => {
    // Simulate a treasurer-like access object without manage.
    const operateOnly = {
      canOperateCheckIn: true,
      canCheckIn: true,
      canManageCheckIn: false,
    };
    expect(
      canShowCheckInStationsNav(
        operateOnly as { canManageCheckIn?: boolean },
      ),
    ).toBe(false);
  });
});
