import { describe, expect, it } from "vitest";

/** Mirrors event-detail visibility for the 7.3E staff check-in entry. */
export function canShowStaffCheckInNav(access: {
  canCheckIn?: boolean;
  canOperateCheckIn?: boolean;
}) {
  return Boolean(access.canOperateCheckIn ?? access.canCheckIn);
}

describe("staff check-in navigation visibility", () => {
  it("shows for operate/check-in permission", () => {
    expect(canShowStaffCheckInNav({ canCheckIn: true })).toBe(true);
    expect(canShowStaffCheckInNav({ canOperateCheckIn: true })).toBe(true);
  });

  it("hides without check-in permission", () => {
    expect(canShowStaffCheckInNav({ canCheckIn: false })).toBe(false);
    expect(canShowStaffCheckInNav({})).toBe(false);
  });
});
