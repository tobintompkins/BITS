import { afterEach, describe, expect, it, vi } from "vitest";

import {
  mapQrCheckInFailureMessage,
  resolveQrCheckInToken,
  submitQrCheckIn,
} from "@/lib/api/qr-check-in-client";

describe("qr-check-in-client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("maps failures to safe messages without echoing tokens", () => {
    const message = mapQrCheckInFailureMessage({
      status: 404,
      error: "missing secret-token-value",
      code: "INVALID_QR_PASS",
    });
    expect(message).toMatch(/cannot be used/i);
    expect(message).not.toContain("secret-token-value");
    expect(mapQrCheckInFailureMessage({ status: 429, error: "slow" })).toMatch(
      /too many/i,
    );
  });

  it("posts resolve with token in JSON body only and no-store cache", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          passId: "p1",
          eventId: "e1",
          registrationId: "r1",
          bindingType: "ATTENDEE",
          attendeeId: "a1",
          eligibleAttendeeIds: ["a1"],
          expiresAt: "2030-01-01T00:00:00.000Z",
          eligibility: "USABLE",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const token = "raw-secret-token";
    const result = await resolveQrCheckInToken({ eventId: "e1", token });
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("/api/events/e1/qr-check-in/resolve");
    expect(String(url)).not.toContain(token);
    expect(init.cache).toBe("no-store");
    expect(init.credentials).toBe("same-origin");
    expect(JSON.parse(init.body as string)).toEqual({ token });
  });

  it("submits check-in with optional station and attendee selection", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          kind: "PARTY",
          eventId: "e1",
          registrationId: "r1",
          requestedCount: 1,
          newlyCheckedInCount: 1,
          alreadyPresentCount: 0,
          attendees: [],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await submitQrCheckIn({
      eventId: "e1",
      token: "raw-secret-token",
      attendeeIds: ["a1"],
      stationId: "s1",
      idempotencyKey: "idem-1",
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("/api/events/e1/qr-check-in");
    expect(String(url)).not.toContain("raw-secret-token");
    expect(init.headers["Idempotency-Key"]).toBe("idem-1");
    expect(JSON.parse(init.body as string)).toEqual({
      token: "raw-secret-token",
      attendeeIds: ["a1"],
      stationId: "s1",
    });
  });
});
