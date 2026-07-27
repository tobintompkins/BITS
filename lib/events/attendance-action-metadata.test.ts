import { describe, expect, it } from "vitest";

import { sanitizeAttendanceActionMetadata } from "@/lib/events/attendance-action-metadata";

describe("sanitizeAttendanceActionMetadata", () => {
  it("allows allowlisted string keys", () => {
    expect(
      sanitizeAttendanceActionMetadata({
        note: "desk 1",
        from: "EXPECTED",
        to: "PRESENT",
      }),
    ).toEqual({
      note: "desk 1",
      from: "EXPECTED",
      to: "PRESENT",
    });
  });

  it("returns null for empty or missing metadata", () => {
    expect(sanitizeAttendanceActionMetadata(null)).toBeNull();
    expect(sanitizeAttendanceActionMetadata(undefined)).toBeNull();
    expect(sanitizeAttendanceActionMetadata({})).toBeNull();
  });

  it("rejects unknown keys", () => {
    expect(() =>
      sanitizeAttendanceActionMetadata({ email: "a@example.com" }),
    ).toThrow(/not allowed/);
  });

  it("rejects secret-like keys and values", () => {
    expect(() =>
      sanitizeAttendanceActionMetadata({ token: "abc" }),
    ).toThrow(/not allowed/);
    expect(() =>
      sanitizeAttendanceActionMetadata({ note: "bearer abc.def.ghi" }),
    ).toThrow(/sensitive/);
  });

  it("rejects non-objects and non-string values", () => {
    expect(() => sanitizeAttendanceActionMetadata(["note"])).toThrow(
      /plain object/,
    );
    expect(() =>
      sanitizeAttendanceActionMetadata({ note: 1 }),
    ).toThrow(/must be a string/);
  });
});
