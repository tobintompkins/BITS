import { z } from "zod";

import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import { isRegistrationError } from "@/lib/errors/registration-errors";
import { memberEventRegistrationCancellationSchema } from "@/lib/validation/member-event-registration-cancellation";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";
import { cancelRegistration } from "@/server/services/event-registration.service";

export type CancelMemberEventRegistrationResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "NOT_FOUND" }
  | { status: "INVALID_REASON"; message: string }
  | { status: "CANCELLATION_DISABLED" }
  | { status: "CANCELLATION_DEADLINE_PASSED" }
  | { status: "ERROR" }
  | {
      status: "CANCELLED";
      eventId: string;
      eventSlug: string | null;
      confirmationCode: string;
    };

/**
 * Member-facing cancel for a registration created by the signed-in account.
 * Ownership is organization + registration UUID + registeredByUserId only.
 */
export async function cancelMemberEventRegistration(input: {
  registrationId?: string;
  reason?: string;
}): Promise<CancelMemberEventRegistrationResult> {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" };

  const registrationIdParse = z.string().uuid().safeParse(input.registrationId);
  if (!registrationIdParse.success) return { status: "NOT_FOUND" };

  const parsed = memberEventRegistrationCancellationSchema.safeParse({
    registrationId: registrationIdParse.data,
    reason: input.reason,
  });
  if (!parsed.success) {
    const reasonIssue = parsed.error.issues.find((issue) =>
      issue.path.includes("reason"),
    );
    return {
      status: "INVALID_REASON",
      message:
        reasonIssue?.message ??
        "Please enter a plain-text reason of 500 characters or fewer.",
    };
  }

  const owned = await prisma.eventRegistration.findFirst({
    where: {
      id: parsed.data.registrationId,
      organizationId: organization.id,
      registeredByUserId: userAccount.id,
    },
    select: {
      confirmationCode: true,
      eventId: true,
      event: {
        select: {
          slug: true,
        },
      },
    },
  });
  if (!owned) return { status: "NOT_FOUND" };

  try {
    const cancelled = await cancelRegistration(
      {
        confirmationCode: owned.confirmationCode,
        reason: parsed.data.reason,
      },
      {
        userAccountId: userAccount.id,
        email: userAccount.primaryEmail,
      },
    );

    return {
      status: "CANCELLED",
      eventId: cancelled.eventId ?? owned.eventId,
      eventSlug: owned.event.slug,
      confirmationCode: cancelled.confirmationCode ?? owned.confirmationCode,
    };
  } catch (error) {
    if (isRegistrationError(error)) {
      if (error.code === "NOT_FOUND") return { status: "NOT_FOUND" };
      if (error.code === "CANCELLATION_DISABLED") {
        return { status: "CANCELLATION_DISABLED" };
      }
      if (error.code === "CANCELLATION_DEADLINE_PASSED") {
        return { status: "CANCELLATION_DEADLINE_PASSED" };
      }
    }
    return { status: "ERROR" };
  }
}
