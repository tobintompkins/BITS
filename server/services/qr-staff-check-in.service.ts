/**
 * Blueprint 7.3U — orchestrate 7.3T resolution + 7.3C/7.3F/7.3M check-in.
 * Controllers stay thin; crypto/eligibility/transactions live in existing services.
 */
import { CheckInError } from "@/lib/errors/check-in-errors";
import { QrPassRawTokenInput } from "@/lib/events/qr-pass-raw-token-input";
import { STAFF_PARTY_CHECK_IN_MAX_ATTENDEES } from "@/lib/constants/staff-party-check-in";
import { resolveQrPassForCheckIn } from "@/server/services/event-qr-pass-resolution.service";
import {
  staffCheckInRegisteredAttendee,
  staffCheckInSelectedParty,
  type StaffCheckInResult,
  type StaffPartyCheckInResult,
} from "@/server/services/staff-check-in.service";

type Actor = { userAccountId: string | null; email: string | null };

export type QrResolveApiDto = {
  passId: string;
  eventId: string;
  registrationId: string;
  bindingType: "PARTY" | "ATTENDEE";
  attendeeId: string | null;
  eligibleAttendeeIds: string[];
  expiresAt: Date;
  eligibility: "USABLE";
};

export type QrCheckInApiResult =
  | { kind: "SINGLE"; result: StaffCheckInResult }
  | { kind: "PARTY"; result: StaffPartyCheckInResult };

/** Read-only resolve for staff selection UI (calls 7.3T once). */
export async function resolveQrTokenForStaffApi(
  input: { eventId: string; token: string; now?: Date },
  actor: Actor,
): Promise<QrResolveApiDto> {
  const secret = QrPassRawTokenInput.fromUnknown(input.token);
  if (!secret) {
    throw new CheckInError("INVALID_QR_PASS", "QR pass is invalid.");
  }
  return resolveQrPassForCheckIn(
    { eventId: input.eventId, rawToken: secret, now: input.now },
    actor,
  );
}

/**
 * Re-resolve token then check in via existing single/party services.
 * Party passes require explicit nonempty selection within eligible IDs.
 */
export async function checkInViaQrTokenForStaffApi(
  input: {
    eventId: string;
    token: string;
    attendeeIds?: string[];
    stationId?: string | null;
    operationKey?: string;
    now?: Date;
  },
  actor: Actor,
): Promise<QrCheckInApiResult> {
  const secret = QrPassRawTokenInput.fromUnknown(input.token);
  if (!secret) {
    throw new CheckInError("INVALID_QR_PASS", "QR pass is invalid.");
  }

  const resolved = await resolveQrPassForCheckIn(
    { eventId: input.eventId, rawToken: secret, now: input.now },
    actor,
  );

  const selected = input.attendeeIds ?? [];

  if (resolved.bindingType === "ATTENDEE") {
    if (!resolved.attendeeId) {
      throw new CheckInError("INVALID_QR_PASS", "QR pass is invalid.");
    }
    if (
      selected.length > 0 &&
      (selected.length !== 1 || selected[0] !== resolved.attendeeId)
    ) {
      throw new CheckInError(
        "VALIDATION",
        "Attendee selection does not match this QR pass.",
      );
    }

    const result = await staffCheckInRegisteredAttendee(
      {
        eventId: input.eventId,
        attendeeId: resolved.attendeeId,
        stationId: input.stationId,
        operationKey: input.operationKey,
        now: input.now,
      },
      actor,
    );
    return { kind: "SINGLE", result };
  }

  if (selected.length === 0) {
    throw new CheckInError(
      "VALIDATION",
      "Select at least one attendee for this party pass.",
    );
  }
  if (selected.length > STAFF_PARTY_CHECK_IN_MAX_ATTENDEES) {
    throw new CheckInError(
      "VALIDATION",
      `At most ${STAFF_PARTY_CHECK_IN_MAX_ATTENDEES} attendees can be checked in at once.`,
    );
  }

  const eligible = new Set(resolved.eligibleAttendeeIds);
  for (const id of selected) {
    if (!eligible.has(id)) {
      throw new CheckInError(
        "VALIDATION",
        "One or more selected attendees are not part of this QR pass.",
      );
    }
  }

  const result = await staffCheckInSelectedParty(
    {
      eventId: input.eventId,
      registrationId: resolved.registrationId,
      attendeeIds: selected,
      stationId: input.stationId,
      operationKey: input.operationKey,
      now: input.now,
    },
    actor,
  );
  return { kind: "PARTY", result };
}
