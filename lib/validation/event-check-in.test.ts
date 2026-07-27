import { describe, expect, it } from "vitest";

import { CheckInError } from "@/lib/errors/check-in-errors";
import {
  buildQrPassPayload,
  generateQrFallbackCode,
  generateQrPassToken,
  hashQrPassToken,
  parseQrPassPayload,
  qrPassTokensMatch,
} from "@/lib/events/qr-pass-token";
import {
  assertCheckInSettingsInvariants,
  buildCheckInSettingsAuditChanges,
  checkInSettingsSchema,
  walkInSchema,
} from "@/lib/validation/event-check-in";
import { ELIGIBLE_REGISTRATION_STATUSES_FOR_CHECK_IN } from "@/lib/constants/event-check-in";

describe("check-in settings validation", () => {
  it("defaults keep check-in disabled", () => {
    const result = checkInSettingsSchema.safeParse({
      eventId: "00000000-0000-4000-8000-000000000001",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.checkInEnabled).toBe(false);
      expect(result.data.allowSelfCheckIn).toBe(false);
      expect(result.data.allowWalkIns).toBe(false);
      expect(result.data.allowCheckOut).toBe(false);
      expect(result.data.allowReentry).toBe(false);
      expect(result.data.requireRegistration).toBe(true);
    }
  });

  it("rejects close before open", () => {
    const result = checkInSettingsSchema.safeParse({
      eventId: "00000000-0000-4000-8000-000000000001",
      checkInEnabled: true,
      checkInOpensAt: "2026-08-10T10:00",
      checkInClosesAt: "2026-08-09T10:00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects self check-in when check-in disabled", () => {
    const result = checkInSettingsSchema.safeParse({
      eventId: "00000000-0000-4000-8000-000000000001",
      checkInEnabled: false,
      allowSelfCheckIn: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects walk-ins / checkout / re-entry when check-in disabled", () => {
    for (const flags of [
      { allowWalkIns: true },
      { allowCheckOut: true },
      { allowReentry: true, allowCheckOut: true },
    ]) {
      const result = checkInSettingsSchema.safeParse({
        eventId: "00000000-0000-4000-8000-000000000001",
        checkInEnabled: false,
        ...flags,
      });
      expect(result.success).toBe(false);
    }
  });

  it("rejects re-entry without check-out", () => {
    const result = checkInSettingsSchema.safeParse({
      eventId: "00000000-0000-4000-8000-000000000001",
      checkInEnabled: true,
      allowCheckOut: false,
      allowReentry: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects walk-ins when registration is required", () => {
    const result = checkInSettingsSchema.safeParse({
      eventId: "00000000-0000-4000-8000-000000000001",
      checkInEnabled: true,
      allowWalkIns: true,
      requireRegistration: true,
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid check-in settings", () => {
    const result = checkInSettingsSchema.safeParse({
      eventId: "00000000-0000-4000-8000-000000000001",
      checkInEnabled: true,
      allowWalkIns: true,
      requireRegistration: false,
      allowCheckOut: true,
      allowReentry: true,
      qrPassEnabled: true,
    });
    expect(result.success).toBe(true);
  });

  it("assertCheckInSettingsInvariants mirrors schema rules", () => {
    expect(() =>
      assertCheckInSettingsInvariants({
        checkInEnabled: true,
        checkInOpensAt: new Date("2026-08-10T12:00:00.000Z"),
        checkInClosesAt: new Date("2026-08-10T09:00:00.000Z"),
        allowSelfCheckIn: false,
        allowWalkIns: false,
        allowCheckOut: false,
        allowReentry: false,
        requireRegistration: true,
      }),
    ).toThrow("Check-in close must be later than open.");
  });

  it("buildCheckInSettingsAuditChanges only includes material diffs", () => {
    const changes = buildCheckInSettingsAuditChanges(
      {
        checkInEnabled: false,
        allowSelfCheckIn: false,
        requireRegistration: true,
      },
      {
        checkInEnabled: true,
        allowSelfCheckIn: false,
        requireRegistration: true,
      },
    );
    expect(changes).toEqual([
      {
        field: "checkInEnabled",
        oldValue: "false",
        newValue: "true",
      },
    ]);
  });
});

describe("QR pass tokens", () => {
  it("hashes bearer tokens and never embeds PII in payload", () => {
    const raw = generateQrPassToken();
    const hash = hashQrPassToken(raw);
    const payload = buildQrPassPayload(raw);
    expect(hash).toHaveLength(64);
    expect(qrPassTokensMatch(raw, hash)).toBe(true);
    expect(payload).toBe(`BITS-CI:${raw}`);
    expect(payload.toLowerCase()).not.toContain("email");
    expect(payload.toLowerCase()).not.toContain("@");
    expect(parseQrPassPayload(payload)).toBe(raw);
  });

  it("generates non-id fallback codes", () => {
    const code = generateQrFallbackCode();
    expect(code).toHaveLength(10);
    expect(code).not.toMatch(/-/);
  });
});

describe("check-in eligibility constants", () => {
  it("allows confirmed/pending and rejects waitlisted conceptually", () => {
    expect(ELIGIBLE_REGISTRATION_STATUSES_FOR_CHECK_IN).toContain("CONFIRMED");
    expect(ELIGIBLE_REGISTRATION_STATUSES_FOR_CHECK_IN).not.toContain("WAITLISTED");
  });

  it("exposes stable check-in error codes", () => {
    const error = new CheckInError("ALREADY_CHECKED_IN", "Already checked in.");
    expect(error.code).toBe("ALREADY_CHECKED_IN");
  });
});

describe("walk-in validation", () => {
  it("requires first and last name", () => {
    const result = walkInSchema.safeParse({
      eventId: "00000000-0000-4000-8000-000000000001",
      firstName: "",
      lastName: "Guest",
    });
    expect(result.success).toBe(false);
  });
});
