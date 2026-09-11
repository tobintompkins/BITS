export type StaffAttendanceTransition = {
  attendanceId: string;
  eventId: string;
  attendeeId: string;
  status: "PRESENT" | "CHECKED_OUT";
  checkedOutAt: string | null;
  checkInCount: number;
  outcome:
    | "CHECKED_OUT"
    | "ALREADY_CHECKED_OUT"
    | "REENTERED"
    | "ALREADY_PRESENT";
};

type TransitionResult =
  | { ok: true; data: StaffAttendanceTransition }
  | { ok: false; message: string; code?: string };

export async function submitStaffAttendanceTransition(input: {
  action: "check-out" | "re-entry";
  eventId: string;
  attendeeId: string;
  stationId?: string;
  signal?: AbortSignal;
}): Promise<TransitionResult> {
  const endpoint =
    input.action === "check-out" ? "check-outs" : "re-entries";
  try {
    const response = await fetch(`/api/events/${input.eventId}/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        attendeeId: input.attendeeId,
        ...(input.stationId ? { stationId: input.stationId } : {}),
      }),
      signal: input.signal,
    });
    const payload = (await response.json()) as {
      data?: StaffAttendanceTransition;
      error?: string;
      code?: string;
    };
    if (!response.ok || !payload.data) {
      return {
        ok: false,
        message: payload.error || "Unable to update attendance.",
        code: payload.code,
      };
    }
    return { ok: true, data: payload.data };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, message: "Request cancelled." };
    }
    return { ok: false, message: "Unable to reach the attendance service." };
  }
}
