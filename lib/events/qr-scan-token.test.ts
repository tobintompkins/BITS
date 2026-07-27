import { describe, expect, it } from "vitest";

import { EVENT_QR_PASS_RAW_TOKEN_MAX_LENGTH } from "@/lib/constants/event-qr-pass";
import { normalizeScannedQrToken } from "@/lib/events/qr-scan-token";

describe("normalizeScannedQrToken", () => {
  it("accepts BITS-CI payload and opaque tokens within the max length", () => {
    expect(normalizeScannedQrToken("BITS-CI:abc123_-XYZ")).toBe("abc123_-XYZ");
    expect(normalizeScannedQrToken("  abc123_-XYZ  ")).toBe("abc123_-XYZ");
  });

  it("rejects empty and oversized input", () => {
    expect(normalizeScannedQrToken("")).toBeNull();
    expect(
      normalizeScannedQrToken("x".repeat(EVENT_QR_PASS_RAW_TOKEN_MAX_LENGTH + 1)),
    ).toBeNull();
  });

  it("strips only the established payload prefix and keeps the opaque token", () => {
    const opaque = normalizeScannedQrToken(
      "BITS-CI:opaque-check-in-secret",
    );
    expect(opaque).toBe("opaque-check-in-secret");
    expect(normalizeScannedQrToken("BITS-CI:")).toBeNull();
  });
});
