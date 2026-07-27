import { describe, expect, it } from "vitest";

import {
  assertQrPayloadHasNoPii,
  clearEphemeralSecret,
  pickActivePartyPass,
  shouldOfferRotation,
  toQrDisplayPayload,
} from "@/lib/events/qr-pass-ui";
import { generateQrPassToken } from "@/lib/events/qr-pass-token";

describe("Blueprint 7.3S QR pass UI helpers", () => {
  it("builds a payload with only the opaque token (no PII)", () => {
    const raw = generateQrPassToken();
    const payload = toQrDisplayPayload(raw);
    expect(payload).toBe(`BITS-CI:${raw}`);
    expect(assertQrPayloadHasNoPii(payload)).toBe(true);
    expect(payload).not.toMatch(/@/);
  });

  it("clears ephemeral secrets and offers rotation for active metadata", () => {
    expect(clearEphemeralSecret()).toBeNull();

    const active = pickActivePartyPass([
      {
        id: "p1",
        eventId: "e1",
        registrationId: "r1",
        attendeeId: null,
        bindingType: "PARTY",
        purpose: "EVENT_CHECK_IN",
        status: "ACTIVE",
        expiresAt: "2030-01-16T16:00:00.000Z",
        createdAt: "2030-01-15T15:00:00.000Z",
        revokedAt: null,
        rotatedAt: null,
      },
    ]);
    expect(shouldOfferRotation(active)).toBe(true);
  });
});
