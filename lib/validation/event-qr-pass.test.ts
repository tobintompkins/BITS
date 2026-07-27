import { describe, expect, it } from "vitest";

import {
  assertQrPassExpiryAfterCreated,
  persistHashOnlyQrPassInputSchema,
} from "@/lib/validation/event-qr-pass";

const validHash = "a".repeat(64);

const orgId = "550e8400-e29b-41d4-a716-446655440000";
const eventId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const registrationId = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";

describe("Blueprint 7.3P QR pass validation", () => {
  it("accepts a valid hash-only party pass input", () => {
    const createdAt = new Date("2030-01-01T00:00:00.000Z");
    const parsed = persistHashOnlyQrPassInputSchema.safeParse({
      organizationId: orgId,
      eventId,
      registrationId,
      attendeeId: null,
      tokenHash: validHash,
      fallbackCodeHash: "b".repeat(64),
      expiresAt: new Date("2030-01-02T00:00:00.000Z"),
      createdAt,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects raw-looking non-hex hashes and expiry before createdAt", () => {
    expect(
      persistHashOnlyQrPassInputSchema.safeParse({
        organizationId: orgId,
        eventId,
        registrationId,
        tokenHash: "not-a-hash",
        fallbackCodeHash: validHash,
        expiresAt: new Date("2030-01-02T00:00:00.000Z"),
      }).success,
    ).toBe(false);

    expect(() =>
      assertQrPassExpiryAfterCreated({
        createdAt: new Date("2030-01-02T00:00:00.000Z"),
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      }),
    ).toThrow(/expiresAt/);
  });

  it("rejects ACTIVE rows carrying revocation fields", () => {
    const parsed = persistHashOnlyQrPassInputSchema.safeParse({
      organizationId: orgId,
      eventId,
      registrationId,
      tokenHash: validHash,
      fallbackCodeHash: "c".repeat(64),
      status: "ACTIVE",
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(parsed.success).toBe(false);
  });
});
