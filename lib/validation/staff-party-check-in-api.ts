import { z } from "zod";

import { STAFF_PARTY_CHECK_IN_MAX_ATTENDEES } from "@/lib/constants/staff-party-check-in";
import { normalizeStaffPartyAttendeeIds } from "@/lib/validation/staff-party-check-in";

/**
 * Blueprint 7.3G / 7.3N — selected-party check-in API body.
 * Strict: rejects tenant/actor/source/status/timestamps/audit/`all` flags.
 * Duplicate IDs follow 7.3F: trim, drop empties, dedupe preserving first-seen order,
 * then enforce min 1 / max 25 on the normalized list.
 * `stationId` is optional (7.3N); empty string is rejected (not coerced to null).
 */
export const staffPartyCheckInApiBodySchema = z
  .object({
    attendeeIds: z.array(z.string().uuid()),
    stationId: z.string().uuid().optional(),
  })
  .strict()
  .transform((body) => {
    const out: { attendeeIds: string[]; stationId?: string } = {
      attendeeIds: normalizeStaffPartyAttendeeIds(body.attendeeIds),
    };
    if (body.stationId !== undefined) {
      out.stationId = body.stationId;
    }
    return out;
  })
  .pipe(
    z.object({
      attendeeIds: z
        .array(z.string().uuid())
        .min(1, "Select at least one attendee.")
        .max(
          STAFF_PARTY_CHECK_IN_MAX_ATTENDEES,
          `At most ${STAFF_PARTY_CHECK_IN_MAX_ATTENDEES} attendees can be checked in at once.`,
        ),
      stationId: z.string().uuid().optional(),
    }),
  );

export const staffPartyCheckInApiEventIdSchema = z.string().uuid();
export const staffPartyCheckInApiRegistrationIdSchema = z.string().uuid();

/** Optional Idempotency-Key header — same bounds as 7.3D. */
export const staffPartyCheckInIdempotencyKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(120);

export type StaffPartyCheckInApiBody = z.infer<
  typeof staffPartyCheckInApiBodySchema
>;
