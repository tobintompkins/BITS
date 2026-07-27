import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildStaffCheckInRequest,
  mapStaffCheckInFailureMessage,
  submitStaffCheckIn,
} from "@/lib/api/staff-check-in-client";

describe("staff check-in client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds a request with only attendeeId and idempotency key", () => {
    const { url, init } = buildStaffCheckInRequest({
      eventId: "00000000-0000-4000-8000-00000000e001",
      attendeeId: "00000000-0000-4000-8000-00000000a001",
      idempotencyKey: "key-1",
    });

    expect(url).toBe(
      "/api/events/00000000-0000-4000-8000-00000000e001/check-ins",
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      "Idempotency-Key": "key-1",
    });
    expect(JSON.parse(init.body)).toEqual({
      attendeeId: "00000000-0000-4000-8000-00000000a001",
    });
    expect(init.body).not.toMatch(/organizationId|source|actor/);
  });

  it("includes optional stationId when provided", () => {
    const { init } = buildStaffCheckInRequest({
      eventId: "00000000-0000-4000-8000-00000000e001",
      attendeeId: "00000000-0000-4000-8000-00000000a001",
      idempotencyKey: "key-1",
      stationId: "00000000-0000-4000-8000-00000000b001",
    });
    expect(JSON.parse(init.body)).toEqual({
      attendeeId: "00000000-0000-4000-8000-00000000a001",
      stationId: "00000000-0000-4000-8000-00000000b001",
    });
    expect(init.body).not.toMatch(/deviceLabel|organizationId/);
  });

  it("parses success and already-present responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          attendanceId: "00000000-0000-4000-8000-00000000c001",
          eventId: "00000000-0000-4000-8000-00000000e001",
          attendeeId: "00000000-0000-4000-8000-00000000a001",
          status: "PRESENT",
          firstCheckedInAt: "2030-01-15T15:30:00.000Z",
          lastCheckedInAt: "2030-01-15T15:30:00.000Z",
          checkInCount: 1,
          alreadyPresent: true,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitStaffCheckIn({
      eventId: "00000000-0000-4000-8000-00000000e001",
      attendeeId: "00000000-0000-4000-8000-00000000a001",
      idempotencyKey: "k",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.alreadyPresent).toBe(true);
      expect(result.data.checkInCount).toBe(1);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps failure codes to safe staff messages", () => {
    expect(
      mapStaffCheckInFailureMessage({
        ok: false,
        status: 409,
        code: "CHECK_IN_NOT_OPEN",
        error: "Check-in has not opened yet.",
      }),
    ).toMatch(/not open/i);

    expect(
      mapStaffCheckInFailureMessage({
        ok: false,
        status: 403,
        code: "FORBIDDEN",
        error: "Forbidden",
      }),
    ).toMatch(/permission/i);

    expect(
      mapStaffCheckInFailureMessage({
        ok: false,
        status: 500,
        error: "Unable to complete check-in.",
      }),
    ).not.toMatch(/stack|select|prisma/i);
  });

  it("does not retry on a single submit call", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Unable to complete check-in." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await submitStaffCheckIn({
      eventId: "00000000-0000-4000-8000-00000000e001",
      attendeeId: "00000000-0000-4000-8000-00000000a001",
      idempotencyKey: "once",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
