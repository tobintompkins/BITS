import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  getOrCreateUserAccount: vi.fn(),
  resolveQrTokenForStaffApi: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/services/qr-staff-check-in.service", () => ({
  resolveQrTokenForStaffApi: mocks.resolveQrTokenForStaffApi,
}));

import { POST } from "@/app/api/events/[id]/qr-check-in/resolve/route";
import { CheckInError } from "@/lib/errors/check-in-errors";

const EVENT_ID = "00000000-0000-4000-8000-00000000e001";
const RAW = "opaque-raw-token-value-abcdefghijklmnopqrstuv";

function ctx() {
  return { params: Promise.resolve({ id: EVENT_ID }) };
}

function makePost(body: unknown, headers?: Record<string, string>) {
  return new Request(
    `http://localhost/api/events/${EVENT_ID}/qr-check-in/resolve`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "localhost",
        origin: "http://localhost",
        ...(headers ?? {}),
      },
      body: JSON.stringify(body),
    },
  );
}

describe("POST .../qr-check-in/resolve (7.3U)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "clerk_1" });
    mocks.currentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: "op@example.com" },
    });
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: "user-1",
      primaryEmail: "op@example.com",
    });
    mocks.resolveQrTokenForStaffApi.mockResolvedValue({
      passId: "00000000-0000-4000-8000-00000000e003",
      eventId: EVENT_ID,
      registrationId: "00000000-0000-4000-8000-00000000e002",
      bindingType: "PARTY",
      attendeeId: null,
      eligibleAttendeeIds: ["00000000-0000-4000-8000-00000000e004"],
      expiresAt: new Date("2030-01-16T16:00:00.000Z"),
      eligibility: "USABLE",
    });
  });

  it("requires auth and returns safe resolve payload with no-store", async () => {
    mocks.auth.mockResolvedValueOnce({ userId: null });
    expect((await POST(makePost({ token: RAW }), ctx())).status).toBe(401);

    const response = await POST(makePost({ token: RAW }), ctx());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toMatch(/no-store/i);
    const json = await response.json();
    expect(json.data.bindingType).toBe("PARTY");
    expect(json.data).not.toHaveProperty("rawToken");
    expect(json.data).not.toHaveProperty("tokenHash");
    expect(JSON.stringify(json)).not.toContain(RAW);
    expect(mocks.resolveQrTokenForStaffApi).toHaveBeenCalledTimes(1);
  });

  it("masks invalid tokens and CSRF failures without echoing secrets", async () => {
    const csrf = await POST(
      makePost({ token: RAW }, { origin: "http://evil.example" }),
      ctx(),
    );
    expect(csrf.status).toBe(403);

    const malformed = await POST(makePost({ token: "" }), ctx());
    expect(malformed.status).toBe(409);
    expect(JSON.stringify(await malformed.json())).not.toContain(RAW);

    mocks.resolveQrTokenForStaffApi.mockRejectedValueOnce(
      new CheckInError("INVALID_QR_PASS", "QR pass is invalid."),
    );
    const invalid = await POST(makePost({ token: RAW }), ctx());
    expect(invalid.status).toBe(409);
    const body = await invalid.json();
    expect(body.code).toBe("INVALID_QR_PASS");
    expect(JSON.stringify(body)).not.toContain(RAW);
  });
});
