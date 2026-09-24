import { z } from "zod";

import { containsMarkup } from "@/lib/validation/church-announcement";

export const MEMBER_CANCELLATION_REASON_MAX = 500;

export const memberEventRegistrationCancellationSchema = z.object({
  registrationId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .max(MEMBER_CANCELLATION_REASON_MAX, {
      error: "Cancellation reason must be 500 characters or fewer.",
    })
    .optional()
    .transform((value) => (!value ? undefined : value))
    .refine((value) => value == null || !containsMarkup(value), {
      error: "Use plain text only. HTML and markup are not allowed.",
    }),
});

export const memberRegistrationCancelStatuses = [
  "PENDING",
  "CONFIRMED",
  "WAITLISTED",
  "OFFERED",
] as const;

export function memberRegistrationCanCancel(input: {
  status: string;
  isUpcoming: boolean;
  allowCancellation?: boolean | null;
  cancellationDeadline?: Date | null;
  now?: Date;
}) {
  if (!input.isUpcoming) return false;
  if (
    !memberRegistrationCancelStatuses.includes(
      input.status as (typeof memberRegistrationCancelStatuses)[number],
    )
  ) {
    return false;
  }
  if (!input.allowCancellation) return false;
  if (input.cancellationDeadline && (input.now ?? new Date()) > input.cancellationDeadline) {
    return false;
  }
  return true;
}
