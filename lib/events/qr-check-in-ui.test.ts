import { describe, expect, it } from "vitest";

import {
  clearEphemeralQrCheckInToken,
  feedbackLeaksQrToken,
  FORBIDDEN_QR_TOKEN_STORAGE_KEYS,
} from "@/lib/events/qr-check-in-ui";

describe("qr-check-in-ui privacy helpers", () => {
  it("clears ephemeral token slots", () => {
    const slot = { current: "raw-secret" as string | null };
    clearEphemeralQrCheckInToken(slot);
    expect(slot.current).toBeNull();
  });

  it("detects feedback that echoes a raw token", () => {
    expect(
      feedbackLeaksQrToken("This pass cannot be used.", "raw-secret"),
    ).toBe(false);
    expect(
      feedbackLeaksQrToken("Error near raw-secret", "raw-secret"),
    ).toBe(true);
  });

  it("lists forbidden persistence surfaces for tokens", () => {
    expect(FORBIDDEN_QR_TOKEN_STORAGE_KEYS).toEqual(
      expect.arrayContaining([
        "localStorage",
        "sessionStorage",
        "cookie",
        "url",
      ]),
    );
  });
});
