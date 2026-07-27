import { describe, expect, it } from "vitest";

import { mapStaffCheckInError } from "@/lib/api/staff-check-in-errors";
import { CheckInError } from "@/lib/errors/check-in-errors";

describe("mapStaffCheckInError", () => {
  it("maps forbidden and not-found safely", async () => {
    const forbidden = mapStaffCheckInError(
      new CheckInError("FORBIDDEN", "No permission"),
    );
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({ code: "FORBIDDEN" });

    const missing = mapStaffCheckInError(
      new CheckInError("ATTENDEE_NOT_FOUND", "Attendee not found."),
    );
    expect(missing.status).toBe(404);
    const body = await missing.json();
    expect(body.code).toBe("NOT_FOUND");
    expect(body.error).toBe("Not found");
  });

  it("maps window/eligibility conflicts", async () => {
    const disabled = mapStaffCheckInError(
      new CheckInError("CHECK_IN_DISABLED", "Check-in is disabled."),
    );
    expect(disabled.status).toBe(409);

    const pending = mapStaffCheckInError(
      new CheckInError(
        "REGISTRATION_NOT_ELIGIBLE",
        "Registration is not eligible for check-in.",
      ),
    );
    expect(pending.status).toBe(409);

    const closedStation = mapStaffCheckInError(
      new CheckInError("STATION_CLOSED", "This check-in station is closed."),
    );
    expect(closedStation.status).toBe(409);
    expect(await closedStation.json()).toMatchObject({
      code: "STATION_CLOSED",
    });
  });

  it("hides unexpected failures", async () => {
    const response = mapStaffCheckInError(new Error("relation does not exist"));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Unable to complete check-in.");
    expect(JSON.stringify(body)).not.toMatch(/relation does not exist/);
  });
});
