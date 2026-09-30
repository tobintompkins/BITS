import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_STAFF_IDLE_TIMEOUT_MINUTES,
  DEFAULT_STAFF_IDLE_WARNING_MINUTES,
  STAFF_IDLE_TIMEOUT_ENV,
  STAFF_IDLE_WARNING_ENV,
  getStaffIdleTimeoutConfig,
  resolveStaffIdleTimeoutConfig,
  staffIdleMinutesToMs,
} from "@/lib/security/staff-idle-timeout";

const originalTimeout = process.env[STAFF_IDLE_TIMEOUT_ENV];
const originalWarning = process.env[STAFF_IDLE_WARNING_ENV];

afterEach(() => {
  if (originalTimeout === undefined) {
    delete process.env[STAFF_IDLE_TIMEOUT_ENV];
  } else {
    process.env[STAFF_IDLE_TIMEOUT_ENV] = originalTimeout;
  }
  if (originalWarning === undefined) {
    delete process.env[STAFF_IDLE_WARNING_ENV];
  } else {
    process.env[STAFF_IDLE_WARNING_ENV] = originalWarning;
  }
});

describe("staff idle timeout configuration", () => {
  it("uses 20-minute timeout and 2-minute warning by default", () => {
    const config = resolveStaffIdleTimeoutConfig();
    expect(config).toEqual({
      timeoutMinutes: DEFAULT_STAFF_IDLE_TIMEOUT_MINUTES,
      warningMinutes: DEFAULT_STAFF_IDLE_WARNING_MINUTES,
      warningStartsAfterMinutes: 18,
    });
  });

  it("accepts valid whole-number environment values", () => {
    expect(
      resolveStaffIdleTimeoutConfig({
        timeoutMinutes: "45",
        warningMinutes: "5",
      }),
    ).toEqual({
      timeoutMinutes: 45,
      warningMinutes: 5,
      warningStartsAfterMinutes: 40,
    });
  });

  it("reads BITS_STAFF_IDLE_TIMEOUT_MINUTES and BITS_STAFF_IDLE_WARNING_MINUTES", () => {
    process.env[STAFF_IDLE_TIMEOUT_ENV] = "30";
    process.env[STAFF_IDLE_WARNING_ENV] = "3";
    expect(getStaffIdleTimeoutConfig()).toEqual({
      timeoutMinutes: 30,
      warningMinutes: 3,
      warningStartsAfterMinutes: 27,
    });
  });

  it("falls back when values are missing or blank", () => {
    expect(
      resolveStaffIdleTimeoutConfig({
        timeoutMinutes: undefined,
        warningMinutes: null,
      }),
    ).toEqual({
      timeoutMinutes: 20,
      warningMinutes: 2,
      warningStartsAfterMinutes: 18,
    });
    expect(
      resolveStaffIdleTimeoutConfig({
        timeoutMinutes: "   ",
        warningMinutes: "",
      }),
    ).toEqual({
      timeoutMinutes: 20,
      warningMinutes: 2,
      warningStartsAfterMinutes: 18,
    });
  });

  it("falls back when values are nonnumeric", () => {
    expect(
      resolveStaffIdleTimeoutConfig({
        timeoutMinutes: "twenty",
        warningMinutes: "two",
      }),
    ).toEqual({
      timeoutMinutes: 20,
      warningMinutes: 2,
      warningStartsAfterMinutes: 18,
    });
  });

  it("rejects decimals instead of rounding them", () => {
    expect(
      resolveStaffIdleTimeoutConfig({
        timeoutMinutes: "20.5",
        warningMinutes: "2.0",
      }),
    ).toEqual({
      timeoutMinutes: 20,
      warningMinutes: 2,
      warningStartsAfterMinutes: 18,
    });
  });

  it("falls back for out-of-range timeout values", () => {
    expect(
      resolveStaffIdleTimeoutConfig({
        timeoutMinutes: "4",
        warningMinutes: "1",
      }).timeoutMinutes,
    ).toBe(20);
    expect(
      resolveStaffIdleTimeoutConfig({
        timeoutMinutes: "121",
        warningMinutes: "2",
      }).timeoutMinutes,
    ).toBe(20);
  });

  it("keeps a valid timeout when only the warning is invalid", () => {
    expect(
      resolveStaffIdleTimeoutConfig({
        timeoutMinutes: "40",
        warningMinutes: "not-a-number",
      }),
    ).toEqual({
      timeoutMinutes: 40,
      warningMinutes: 2,
      warningStartsAfterMinutes: 38,
    });
  });

  it("falls back when the warning is not smaller than the timeout", () => {
    expect(
      resolveStaffIdleTimeoutConfig({
        timeoutMinutes: "20",
        warningMinutes: "20",
      }),
    ).toEqual({
      timeoutMinutes: 20,
      warningMinutes: 2,
      warningStartsAfterMinutes: 18,
    });
    expect(
      resolveStaffIdleTimeoutConfig({
        timeoutMinutes: "15",
        warningMinutes: "30",
      }),
    ).toEqual({
      timeoutMinutes: 15,
      warningMinutes: 2,
      warningStartsAfterMinutes: 13,
    });
  });

  it("calculates when the warning starts from timeout minus warning", () => {
    expect(
      resolveStaffIdleTimeoutConfig({
        timeoutMinutes: "20",
        warningMinutes: "2",
      }).warningStartsAfterMinutes,
    ).toBe(18);
    expect(
      resolveStaffIdleTimeoutConfig({
        timeoutMinutes: "60",
        warningMinutes: "10",
      }).warningStartsAfterMinutes,
    ).toBe(50);
    expect(staffIdleMinutesToMs(20)).toBe(20 * 60 * 1000);
    expect(staffIdleMinutesToMs(2)).toBe(2 * 60 * 1000);
  });

  it("treats zero and negative values as invalid", () => {
    expect(
      resolveStaffIdleTimeoutConfig({
        timeoutMinutes: "0",
        warningMinutes: "0",
      }),
    ).toEqual({
      timeoutMinutes: 20,
      warningMinutes: 2,
      warningStartsAfterMinutes: 18,
    });
    expect(
      resolveStaffIdleTimeoutConfig({
        timeoutMinutes: "-15",
        warningMinutes: "-2",
      }),
    ).toEqual({
      timeoutMinutes: 20,
      warningMinutes: 2,
      warningStartsAfterMinutes: 18,
    });
  });
});
