import { describe, expect, it } from "vitest";

import {
  qrCheckInApiBodySchema,
  qrCheckInResolveApiBodySchema,
} from "@/lib/validation/qr-check-in-api";

describe("Blueprint 7.3U QR check-in API validation", () => {
  it("accepts resolve token bodies and rejects unknown fields", () => {
    expect(
      qrCheckInResolveApiBodySchema.safeParse({ token: "abc" }).success,
    ).toBe(true);
    expect(
      qrCheckInResolveApiBodySchema.safeParse({
        token: "abc",
        purpose: "EVENT_CHECK_IN",
      }).success,
    ).toBe(false);
  });

  it("normalizes party attendeeIds and keeps optional stationId", () => {
    const parsed = qrCheckInApiBodySchema.safeParse({
      token: "opaque-token",
      attendeeIds: [
        "00000000-0000-4000-8000-00000000e004",
        "00000000-0000-4000-8000-00000000e004",
      ],
      stationId: "00000000-0000-4000-8000-00000000e006",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.attendeeIds).toEqual([
        "00000000-0000-4000-8000-00000000e004",
      ]);
      expect(parsed.data.stationId).toBe(
        "00000000-0000-4000-8000-00000000e006",
      );
    }
  });
});
