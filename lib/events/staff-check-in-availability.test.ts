import { describe, expect, it } from "vitest";

import {
  getStaffCheckInAvailabilityState,
  staffCheckInAvailabilityLabel,
} from "@/lib/events/staff-check-in-availability";

describe("getStaffCheckInAvailabilityState", () => {
  const opens = new Date("2030-01-15T15:00:00.000Z");
  const closes = new Date("2030-01-15T17:00:00.000Z");

  it("reports disabled / not_open / open / closed", () => {
    expect(
      getStaffCheckInAvailabilityState(
        { checkInEnabled: false, checkInOpensAt: opens, checkInClosesAt: closes },
        opens,
      ),
    ).toBe("disabled");

    expect(
      getStaffCheckInAvailabilityState(
        { checkInEnabled: true, checkInOpensAt: opens, checkInClosesAt: closes },
        new Date(opens.getTime() - 1),
      ),
    ).toBe("not_open");

    expect(
      getStaffCheckInAvailabilityState(
        { checkInEnabled: true, checkInOpensAt: opens, checkInClosesAt: closes },
        opens,
      ),
    ).toBe("open");

    expect(
      getStaffCheckInAvailabilityState(
        { checkInEnabled: true, checkInOpensAt: opens, checkInClosesAt: closes },
        closes,
      ),
    ).toBe("open");

    expect(
      getStaffCheckInAvailabilityState(
        { checkInEnabled: true, checkInOpensAt: opens, checkInClosesAt: closes },
        new Date(closes.getTime() + 1),
      ),
    ).toBe("closed");
  });

  it("exposes human labels for each state", () => {
    expect(staffCheckInAvailabilityLabel("open")).toMatch(/open/i);
    expect(staffCheckInAvailabilityLabel("disabled")).toMatch(/disabled/i);
  });
});
