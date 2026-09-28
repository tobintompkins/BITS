import { z } from "zod";

export const MEMBER_VOLUNTEER_CONFIRMATION_NOTICE =
  "Confirming lets church leadership know you saw this assignment. If you need help, use Request a substitute.";

export const MEMBER_VOLUNTEER_CONFIRMATION_SUCCESS =
  "Your service assignment was confirmed.";

export const volunteerServiceConfirmationSchema = z.object({
  assignmentId: z.string().uuid(),
});

function firstString(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

export function parseVolunteerServiceConfirmation(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  return volunteerServiceConfirmationSchema.safeParse({
    assignmentId:
      typeof input === "string" ? input : firstString(record.assignmentId),
  });
}

function confirmationTimeZone(timeZone?: string | null) {
  if (!timeZone) return undefined;
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return undefined;
  }
}

export function formatVolunteerConfirmationWhen(
  value: Date,
  timeZone?: string | null,
) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: confirmationTimeZone(timeZone),
  }).format(value);
}

export function memberVolunteerConfirmationState(
  memberConfirmedAt: Date | null,
  timeZone?: string | null,
) {
  if (!memberConfirmedAt) {
    return {
      canConfirm: true,
      confirmedAtLabel: null,
    };
  }
  return {
    canConfirm: false,
    confirmedAtLabel: `Confirmed · ${formatVolunteerConfirmationWhen(
      memberConfirmedAt,
      timeZone,
    )}`,
  };
}

export function staffVolunteerConfirmationLabel(input: {
  status: "SCHEDULED" | "CANCELLED";
  memberConfirmedAt: Date | null;
  timeZone?: string | null;
}) {
  if (input.memberConfirmedAt) {
    return `Confirmed · ${formatVolunteerConfirmationWhen(
      input.memberConfirmedAt,
      input.timeZone,
    )}`;
  }
  if (input.status === "SCHEDULED") return "Awaiting confirmation";
  return "—";
}
