import { describe, expect, it } from "vitest";

import { mapStaffCheckOutError } from "@/lib/api/staff-check-out-errors";
import { CheckInError } from "@/lib/errors/check-in-errors";

describe("mapStaffCheckOutError", () => {
  it("maps auth and not-found safely", async () => {
    const forbidden = mapStaffCheckOutError(
      new CheckInError("FORBIDDEN", "nope"),
    );
    expect(forbidden.status).toBe(403);

    const missing = mapStaffCheckOutError(
      new CheckInError("ATTENDEE_NOT_FOUND", "missing"),
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      error: "Not found",
      code: "NOT_FOUND",
    });
  });

  it("maps disabled settings and invalid state as conflict", async () => {
    const disabled = mapStaffCheckOutError(
      new CheckInError("CHECK_OUT_DISABLED", "Check-out is disabled."),
    );
    expect(disabled.status).toBe(409);
    expect((await disabled.json()).code).toBe("CHECK_OUT_DISABLED");

    const state = mapStaffCheckOutError(
      new CheckInError("VALIDATION", "Only present attendees can check out."),
    );
    expect(state.status).toBe(409);
  });

  it("hides unexpected failures", async () => {
    const response = mapStaffCheckOutError(
      new Error("relation event_attendance does not exist"),
    );
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toMatch(/unable to complete/i);
    expect(JSON.stringify(body)).not.toMatch(/relation|sql|tenant/i);
  });
});
