import { z } from "zod";

import { EVENT_QR_PASS_RAW_TOKEN_MAX_LENGTH } from "@/lib/constants/event-qr-pass";
import { STAFF_PARTY_CHECK_IN_MAX_ATTENDEES } from "@/lib/constants/staff-party-check-in";
import { normalizeStaffPartyAttendeeIds } from "@/lib/validation/staff-party-check-in";

export const qrCheckInApiEventIdSchema = z.string().uuid();

const rawTokenSchema = z
  .string()
  .min(1, "Token is required.")
  .max(
    EVENT_QR_PASS_RAW_TOKEN_MAX_LENGTH,
    "Token is too long.",
  );

/** POST .../qr-check-in/resolve */
export const qrCheckInResolveApiBodySchema = z
  .object({
    token: rawTokenSchema,
  })
  .strict();

/**
 * POST .../qr-check-in
 * Party selection is validated after 7.3T resolution (must be explicit for party passes).
 */
export const qrCheckInApiBodySchema = z
  .object({
    token: rawTokenSchema,
    attendeeIds: z.array(z.string().uuid()).optional(),
    stationId: z.string().uuid().optional(),
  })
  .strict()
  .transform((body) => {
    const out: {
      token: string;
      attendeeIds?: string[];
      stationId?: string;
    } = { token: body.token };
    if (body.attendeeIds !== undefined) {
      out.attendeeIds = normalizeStaffPartyAttendeeIds(body.attendeeIds);
    }
    if (body.stationId !== undefined) {
      out.stationId = body.stationId;
    }
    return out;
  })
  .pipe(
    z.object({
      token: rawTokenSchema,
      attendeeIds: z
        .array(z.string().uuid())
        .max(STAFF_PARTY_CHECK_IN_MAX_ATTENDEES)
        .optional(),
      stationId: z.string().uuid().optional(),
    }),
  );

export const qrCheckInIdempotencyKeySchema = z.string().trim().min(1).max(120);

export type QrCheckInResolveApiBody = z.infer<
  typeof qrCheckInResolveApiBodySchema
>;
export type QrCheckInApiBody = z.infer<typeof qrCheckInApiBodySchema>;
