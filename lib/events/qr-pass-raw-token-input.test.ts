import { inspect } from "node:util";

import { describe, expect, it } from "vitest";

import { EVENT_QR_PASS_RAW_TOKEN_MAX_LENGTH } from "@/lib/constants/event-qr-pass";
import { QrPassRawTokenInput } from "@/lib/events/qr-pass-raw-token-input";
import {
  generateQrPassToken,
  hashQrPassToken,
} from "@/lib/events/qr-pass-token";

describe("Blueprint 7.3T QrPassRawTokenInput", () => {
  it("hashes immediately and redacts serialization", () => {
    const raw = generateQrPassToken();
    const input = QrPassRawTokenInput.fromUnknown(`BITS-CI:${raw}`);
    expect(input).not.toBeNull();
    const hash = input!.consumeTokenHash();
    expect(hash).toBe(hashQrPassToken(raw));
    expect(input!.consumeTokenHash()).toBeNull();
    expect(JSON.stringify(input)).toContain("[REDACTED]");
    expect(JSON.stringify(input)).not.toContain(raw);
    expect(String(input)).not.toContain(raw);
    expect(inspect(input!)).not.toContain(raw);
  });

  it("rejects empty, whitespace-only, and overlong input", () => {
    expect(QrPassRawTokenInput.fromUnknown("")).toBeNull();
    expect(QrPassRawTokenInput.fromUnknown("   ")).toBeNull();
    expect(
      QrPassRawTokenInput.fromUnknown("x".repeat(EVENT_QR_PASS_RAW_TOKEN_MAX_LENGTH + 1)),
    ).toBeNull();
  });
});
