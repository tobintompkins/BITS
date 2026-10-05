import { describe, expect, it } from "vitest";

import {
  exclusiveZonedDayEndUtc,
  zonedDayStartUtc,
} from "./church-timezone-range";

describe("church timezone day boundaries", () => {
  it("converts America/New_York calendar days across the 2026 spring-forward DST change", () => {
    expect(zonedDayStartUtc("2026-03-08", "America/New_York").toISOString()).toBe(
      "2026-03-08T05:00:00.000Z",
    );
    expect(
      exclusiveZonedDayEndUtc("2026-03-08", "America/New_York").toISOString(),
    ).toBe("2026-03-09T04:00:00.000Z");
  });

  it("converts America/New_York calendar days across the 2026 fall-back DST change", () => {
    expect(zonedDayStartUtc("2026-11-01", "America/New_York").toISOString()).toBe(
      "2026-11-01T04:00:00.000Z",
    );
    expect(
      exclusiveZonedDayEndUtc("2026-11-01", "America/New_York").toISOString(),
    ).toBe("2026-11-02T05:00:00.000Z");
  });
});
