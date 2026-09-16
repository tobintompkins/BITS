import { afterEach, describe, expect, it, vi } from "vitest";

import { submitStaffAttendanceTransition } from "./staff-check-out-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("staff check-out client", () => {
  it("posts check-out with an idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            attendanceId: "attendance",
            eventId: "event",
            attendeeId: "attendee",
            status: "CHECKED_OUT",
            checkedOutAt: "2026-07-27T12:00:00.000Z",
            checkInCount: 1,
            outcome: "CHECKED_OUT",
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "operation-key" });

    const result = await submitStaffAttendanceTransition({
      action: "check-out",
      eventId: "event",
      attendeeId: "attendee",
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/events/event/check-outs",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Idempotency-Key": "operation-key",
        }),
      }),
    );
  });

  it("returns the safe API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: "Re-entry is disabled.", code: "REENTRY_DISABLED" }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    vi.stubGlobal("crypto", { randomUUID: () => "operation-key" });

    const result = await submitStaffAttendanceTransition({
      action: "re-entry",
      eventId: "event",
      attendeeId: "attendee",
    });

    expect(result).toEqual({
      ok: false,
      message: "Re-entry is disabled.",
      code: "REENTRY_DISABLED",
    });
  });
});
