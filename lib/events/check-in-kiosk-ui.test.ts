import { describe, expect, it } from "vitest";

import {
  KIOSK_CHECK_IN_RESULT_KEYS,
  KIOSK_FORBIDDEN_FIELDS,
  canUseCheckInKiosk,
  kioskCheckInWindowLabel,
  kioskCheckInWindowState,
  kioskQueryIsReady,
  kioskResultPayloadKeys,
  kioskSafeDisplayName,
  kioskShowsCheckInButton,
  toKioskCheckInResult,
} from "./check-in-kiosk-ui";

const opens = new Date("2030-01-15T15:00:00.000Z");
const closes = new Date("2030-01-15T17:00:00.000Z");

describe("kiosk safe display labels", () => {
  it("uses first name and last initial only", () => {
    expect(kioskSafeDisplayName("Jane", "Doe")).toBe("Jane D.");
    expect(kioskSafeDisplayName("  mary  ", "  smith ")).toBe("mary S.");
    expect(kioskSafeDisplayName("Chris", "")).toBe("Chris");
    expect(kioskSafeDisplayName("", "")).toBe("Registered guest");
  });
});

describe("kiosk eligibility and buttons", () => {
  it("offers Check in only for eligible registered attendees", () => {
    const eligible = toKioskCheckInResult({
      id: "00000000-0000-4000-8000-00000000a001",
      firstName: "Jane",
      lastName: "Doe",
      status: "CONFIRMED",
      registration: { status: "CONFIRMED" },
      attendanceRecords: [],
    });
    expect(eligible.status).toBe("eligible");
    expect(eligible.canCheckIn).toBe(true);
    expect(kioskShowsCheckInButton(eligible)).toBe(true);
    expect(eligible.statusLabel).toBe("Ready to check in");
  });

  it("does not offer Check in for already-checked-in or checked-out people", () => {
    const present = toKioskCheckInResult({
      id: "00000000-0000-4000-8000-00000000a002",
      firstName: "Sam",
      lastName: "Lee",
      status: "CHECKED_IN",
      registration: { status: "CHECKED_IN" },
      attendanceRecords: [{ status: "PRESENT" }],
    });
    expect(present.status).toBe("already_checked_in");
    expect(kioskShowsCheckInButton(present)).toBe(false);
    expect(present.statusLabel).toBe("Already checked in");

    const checkedOut = toKioskCheckInResult({
      id: "00000000-0000-4000-8000-00000000a003",
      firstName: "Pat",
      lastName: "Ng",
      status: "CHECKED_IN",
      registration: { status: "CHECKED_IN" },
      attendanceRecords: [{ status: "CHECKED_OUT" }],
    });
    expect(checkedOut.status).toBe("checked_out");
    expect(kioskShowsCheckInButton(checkedOut)).toBe(false);
  });
});

describe("kiosk window labels", () => {
  it("maps open, unavailable, not-open, and closed states", () => {
    expect(
      kioskCheckInWindowLabel(
        kioskCheckInWindowState(
          { checkInEnabled: true, checkInOpensAt: opens, checkInClosesAt: closes },
          opens,
        ),
      ),
    ).toBe("Check-in open");
    expect(
      kioskCheckInWindowLabel(
        kioskCheckInWindowState(
          {
            checkInEnabled: false,
            checkInOpensAt: opens,
            checkInClosesAt: closes,
          },
          opens,
        ),
      ),
    ).toBe("Check-in unavailable");
    expect(
      kioskCheckInWindowLabel(
        kioskCheckInWindowState(
          { checkInEnabled: true, checkInOpensAt: opens, checkInClosesAt: closes },
          new Date(opens.getTime() - 1),
        ),
      ),
    ).toBe("Not open yet");
    expect(
      kioskCheckInWindowLabel(
        kioskCheckInWindowState(
          { checkInEnabled: true, checkInOpensAt: opens, checkInClosesAt: closes },
          new Date(closes.getTime() + 1),
        ),
      ),
    ).toBe("Check-in closed");
  });
});

describe("kiosk DTO privacy", () => {
  it("does not represent sensitive attendee fields", () => {
    const result = toKioskCheckInResult({
      id: "00000000-0000-4000-8000-00000000a004",
      firstName: "Jordan",
      lastName: "Brooks",
      status: "CONFIRMED",
      email: "jordan@example.test",
      phone: "207-555-0100",
      dateOfBirth: "2018-04-12",
      guardianName: "Alex Brooks",
      guardianPhone: "207-555-0199",
      emergencyContactName: "Casey Brooks",
      emergencyContactPhone: "207-555-0111",
      dietaryNotes: "Peanut allergy",
      internalNotes: "Staff only",
      memberId: "mem_secret",
      checkInToken: "tok_secret",
      registration: {
        status: "CONFIRMED",
        confirmationCode: "ABC123",
        primaryContactName: "Alex Brooks",
      },
      attendanceRecords: [],
    } as never);

    expect(kioskResultPayloadKeys(result)).toEqual(
      [...KIOSK_CHECK_IN_RESULT_KEYS].sort(),
    );
    const payload = JSON.stringify(result);
    for (const field of KIOSK_FORBIDDEN_FIELDS) {
      expect(payload).not.toContain(field);
    }
    expect(payload).not.toContain("jordan@example.test");
    expect(payload).not.toContain("207-555-0100");
    expect(payload).not.toContain("Peanut allergy");
    expect(payload).not.toContain("ABC123");
    expect(payload).not.toContain("Brooks");
    expect(result.displayName).toBe("Jordan B.");
  });

  it("requires operate permission and a minimum search query", () => {
    expect(canUseCheckInKiosk({ canOperateCheckIn: true })).toBe(true);
    expect(canUseCheckInKiosk({ canOperateCheckIn: false })).toBe(false);
    expect(canUseCheckInKiosk({})).toBe(false);
    expect(kioskQueryIsReady("J")).toBe(false);
    expect(kioskQueryIsReady("Jo")).toBe(true);
  });
});
