import { describe, expect, it } from "vitest";

import { STAFF_PARTY_CHECK_IN_MAX_ATTENDEES } from "@/lib/constants/staff-party-check-in";
import {
  isStaffPartyAttendeeSelectable,
  mapStaffPartyOutcomeLabel,
  staffPartyAttendanceLabel,
  toggleStaffPartyAttendeeSelection,
  validateStaffPartySelection,
} from "@/lib/events/staff-party-check-in-selection";

describe("staff party check-in selection helpers", () => {
  it("starts validation requiring an explicit registration and selection", () => {
    expect(
      validateStaffPartySelection({
        registrationId: null,
        selectedIds: ["a"],
      }),
    ).toMatchObject({ ok: false });

    expect(
      validateStaffPartySelection({
        registrationId: "reg",
        selectedIds: [],
      }),
    ).toMatchObject({ ok: false });
  });

  it("accepts one or several explicit selections under the 7.3F/G limit", () => {
    expect(
      validateStaffPartySelection({
        registrationId: "reg",
        selectedIds: ["a", "b"],
      }),
    ).toEqual({ ok: true, attendeeIds: ["a", "b"] });
  });

  it("rejects over-limit selections accessibly", () => {
    const ids = Array.from(
      { length: STAFF_PARTY_CHECK_IN_MAX_ATTENDEES + 1 },
      (_, i) => `id-${i}`,
    );
    const result = validateStaffPartySelection({
      registrationId: "reg",
      selectedIds: ids,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/at most/i);
    }
  });

  it("toggles selection without select-all semantics", () => {
    expect(toggleStaffPartyAttendeeSelection([], "a", true)).toEqual(["a"]);
    expect(toggleStaffPartyAttendeeSelection(["a", "b"], "a", false)).toEqual([
      "b",
    ]);
    expect(toggleStaffPartyAttendeeSelection(["a"], "a", true)).toEqual(["a"]);
  });

  it("labels attendance and outcomes without relying on color alone", () => {
    expect(staffPartyAttendanceLabel("PRESENT")).toBe("Present");
    expect(staffPartyAttendanceLabel("EXPECTED")).toBe("Not checked in");
    expect(mapStaffPartyOutcomeLabel("CHECKED_IN")).toBe("Checked in");
    expect(mapStaffPartyOutcomeLabel("ALREADY_PRESENT")).toBe(
      "Already present",
    );
  });

  it("marks cancelled/waitlisted attendees as not selectable", () => {
    expect(
      isStaffPartyAttendeeSelectable({
        attendeeStatus: "CANCELLED",
        attendanceStatus: "EXPECTED",
      }),
    ).toBe(false);
    expect(
      isStaffPartyAttendeeSelectable({
        attendeeStatus: "REGISTERED",
        attendanceStatus: "PRESENT",
      }),
    ).toBe(true);
  });
});
