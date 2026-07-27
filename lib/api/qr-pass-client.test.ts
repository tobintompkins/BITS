import { describe, expect, it, vi } from "vitest";

import {
  issueQrPass,
  listQrPasses,
  mapQrPassFailureMessage,
} from "@/lib/api/qr-pass-client";

describe("qr-pass-client", () => {
  it("maps common failure statuses to safe UI messages", () => {
    expect(
      mapQrPassFailureMessage({ status: 401, error: "Unauthorized" }),
    ).toMatch(/sign in/i);
    expect(
      mapQrPassFailureMessage({ status: 403, error: "Forbidden" }),
    ).toMatch(/permission/i);
    expect(
      mapQrPassFailureMessage({
        status: 409,
        error: "disabled",
        code: "CHECK_IN_DISABLED",
      }),
    ).toMatch(/not enabled/i);
  });

  it("issues with no-store fetch and does not put token in the URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        data: {
          id: "00000000-0000-4000-8000-00000000p001",
          eventId: "00000000-0000-4000-8000-00000000e001",
          registrationId: "00000000-0000-4000-8000-00000000r001",
          attendeeId: null,
          purpose: "EVENT_CHECK_IN",
          expiresAt: "2030-01-16T16:00:00.000Z",
          reused: false,
          rawToken: "secret-token",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await issueQrPass(
      "00000000-0000-4000-8000-00000000e001",
      "00000000-0000-4000-8000-00000000r001",
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.rawToken).toBe("secret-token");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).not.toContain("secret-token");
    expect(init.cache).toBe("no-store");
    vi.unstubAllGlobals();
  });

  it("lists metadata without inventing secrets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            items: [
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
            ],
          },
        }),
      }),
    );
    const result = await listQrPasses("e1", "r1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items[0]).not.toHaveProperty("rawToken");
    }
    vi.unstubAllGlobals();
  });
});
