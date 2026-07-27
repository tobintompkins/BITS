import { inspect } from "node:util";

import { describe, expect, it } from "vitest";

import { QrPassSecretResult } from "@/lib/events/qr-pass-secret-result";
import { generateQrPassToken } from "@/lib/events/qr-pass-token";

describe("Blueprint 7.3Q QrPassSecretResult redaction", () => {
  it("redacts raw token from JSON, string, and inspect output", () => {
    const rawToken = generateQrPassToken();
    const result = new QrPassSecretResult({
      passId: "550e8400-e29b-41d4-a716-446655440000",
      eventId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      registrationId: "6ba7b811-9dad-11d1-80b4-00c04fd430c8",
      attendeeId: null,
      purpose: "EVENT_CHECK_IN",
      expiresAt: new Date("2030-01-16T00:00:00.000Z"),
      reused: false,
      rawToken,
    });

    expect(result.rawToken).toBe(rawToken);
    expect(JSON.stringify(result)).not.toContain(rawToken);
    expect(JSON.stringify(result)).toContain("[REDACTED]");
    expect(String(result)).not.toContain(rawToken);
    expect(inspect(result)).not.toContain(rawToken);
    expect(result.toSafeMetadata()).not.toHaveProperty("tokenHash");
    expect(JSON.stringify(result.toSafeMetadata())).not.toContain(rawToken);
  });

  it("generates high-entropy opaque tokens via established helper", () => {
    const a = generateQrPassToken();
    const b = generateQrPassToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
