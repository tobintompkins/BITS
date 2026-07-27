import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  getOrCreateUserAccount: vi.fn(),
  issueQrPassLifecycle: vi.fn(),
  listQrPassesLifecycle: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/services/event-qr-pass-lifecycle.service", () => ({
  issueQrPassLifecycle: mocks.issueQrPassLifecycle,
  listQrPassesLifecycle: mocks.listQrPassesLifecycle,
}));

import { GET, POST } from "@/app/api/events/[id]/registrations/[registrationId]/qr-passes/route";
import { CheckInError } from "@/lib/errors/check-in-errors";
import { QrPassSecretResult } from "@/lib/events/qr-pass-secret-result";

const EVENT_ID = "00000000-0000-4000-8000-00000000e001";
const REG_ID = "00000000-0000-4000-8000-00000000e002";
const PASS_ID = "00000000-0000-4000-8000-00000000e003";
const RAW = "opaque-raw-token-value-for-test";

function ctx() {
  return {
    params: Promise.resolve({ id: EVENT_ID, registrationId: REG_ID }),
  };
}

function makePost(body: unknown, headers?: Record<string, string>) {
  return new Request(
    `http://localhost/api/events/${EVENT_ID}/registrations/${REG_ID}/qr-passes`,
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

describe("GET/POST .../qr-passes (7.3R)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "clerk_1" });
    mocks.currentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: "staff@example.com" },
    });
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: "user-1",
      primaryEmail: "staff@example.com",
    });
    mocks.issueQrPassLifecycle.mockResolvedValue(
      new QrPassSecretResult({
        passId: PASS_ID,
        eventId: EVENT_ID,
        registrationId: REG_ID,
        attendeeId: null,
        purpose: "EVENT_CHECK_IN",
        expiresAt: new Date("2030-01-16T16:00:00.000Z"),
        reused: false,
        rawToken: RAW,
      }),
    );
    mocks.listQrPassesLifecycle.mockResolvedValue([
      {
        id: PASS_ID,
        organizationId: "org",
        eventId: EVENT_ID,
        registrationId: REG_ID,
        attendeeId: null,
        purpose: "EVENT_CHECK_IN",
        status: "ACTIVE",
        expiresAt: new Date("2030-01-16T16:00:00.000Z"),
        revokedAt: null,
        revokedByUserId: null,
        rotatedAt: null,
        replacedByTokenId: null,
        lastUsedAt: null,
        createdAt: new Date("2030-01-15T15:00:00.000Z"),
        updatedAt: new Date("2030-01-15T15:00:00.000Z"),
      },
    ]);
  });

  it("requires authentication", async () => {
    mocks.auth.mockResolvedValueOnce({ userId: null });
    const response = await POST(makePost({}), ctx());
    expect(response.status).toBe(401);
    expect(mocks.issueQrPassLifecycle).not.toHaveBeenCalled();
  });

  it("issues once with raw token, no-store headers, and never hash", async () => {
    const response = await POST(makePost({}), ctx());
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toMatch(/no-store/i);
    const json = await response.json();
    expect(json.data.rawToken).toBe(RAW);
    expect(json.data).not.toHaveProperty("tokenHash");
    expect(JSON.stringify(json)).not.toContain("tokenHash");
    expect(mocks.issueQrPassLifecycle).toHaveBeenCalledTimes(1);
  });

  it("returns reused metadata without fabricating a raw token", async () => {
    mocks.issueQrPassLifecycle.mockResolvedValueOnce(
      new QrPassSecretResult({
        passId: PASS_ID,
        eventId: EVENT_ID,
        registrationId: REG_ID,
        purpose: "EVENT_CHECK_IN",
        expiresAt: new Date("2030-01-16T16:00:00.000Z"),
        reused: true,
        rawToken: null,
      }),
    );
    const response = await POST(makePost({}), ctx());
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.reused).toBe(true);
    expect(json.data.rawToken).toBeNull();
  });

  it("lists metadata without raw token or hash", async () => {
    const response = await GET(
      new Request(
        `http://localhost/api/events/${EVENT_ID}/registrations/${REG_ID}/qr-passes`,
      ),
      ctx(),
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.items).toHaveLength(1);
    expect(json.data.items[0]).not.toHaveProperty("rawToken");
    expect(json.data.items[0]).not.toHaveProperty("tokenHash");
    expect(json.data.items[0].bindingType).toBe("PARTY");
  });

  it("rejects CSRF mismatch, unknown fields, and maps ineligible safely", async () => {
    const csrf = await POST(
      makePost(
        {},
        { origin: "http://evil.example", host: "localhost" },
      ),
      ctx(),
    );
    expect(csrf.status).toBe(403);

    const unknown = await POST(makePost({ purpose: "EVENT_CHECK_IN" }), ctx());
    expect(unknown.status).toBe(400);

    mocks.issueQrPassLifecycle.mockRejectedValueOnce(
      new CheckInError(
        "REGISTRATION_NOT_ELIGIBLE",
        "Registration is not eligible for a QR pass.",
      ),
    );
    const ineligible = await POST(makePost({}), ctx());
    expect(ineligible.status).toBe(409);
    const body = await ineligible.json();
    expect(body).not.toHaveProperty("rawToken");
    expect(JSON.stringify(body)).not.toContain(RAW);
  });
});
