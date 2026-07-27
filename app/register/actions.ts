"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  cancelRegistrationSchema,
  promotionOfferTokenSchema,
  submitRegistrationSchema,
} from "@/lib/validation/event-registration";
import {
  acceptPromotionOffer,
  cancelRegistration,
  declinePromotionOffer,
  getPublicRegistrationPage,
  getRegistrationByConfirmationCodePublic,
  submitRegistration,
} from "@/server/services/event-registration.service";
import { issueOrGetQrPass } from "@/server/services/event-check-in.service";
import { prisma } from "@/lib/db/prisma";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";
import { assertActionAllowed } from "@/lib/security/rate-limit";

async function getActor() {
  const userAccount = await getOrCreateUserAccount().catch(() => null);
  const clerkUser = await currentUser().catch(() => null);
  return {
    userAccountId: userAccount?.id ?? null,
    email:
      clerkUser?.primaryEmailAddress?.emailAddress ??
      userAccount?.primaryEmail ??
      null,
  };
}

function parseAttendeesJson(formData: FormData) {
  const raw = String(formData.get("attendeesJson") ?? "[]");
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getPublicRegistrationPageAction(slug: string) {
  const { userId } = await auth();
  const actor = await getActor();
  return getPublicRegistrationPage(slug, {
    isAuthenticated: Boolean(userId || actor.userAccountId),
    isStaff: false,
  });
}

export async function submitPublicRegistrationAction(formData: FormData) {
  const attendeesRaw = parseAttendeesJson(formData);
  const attendees =
    attendeesRaw.length > 0
      ? attendeesRaw
      : [
          {
            firstName: String(formData.get("firstName") ?? ""),
            lastName: String(formData.get("lastName") ?? ""),
            email: String(formData.get("email") ?? ""),
            phone: String(formData.get("phone") ?? ""),
            dateOfBirth: String(formData.get("dateOfBirth") ?? ""),
            isGuest: formData.get("isGuest") === "true",
            isMinor: formData.get("isMinor") === "true",
            guardianName: String(formData.get("guardianName") ?? ""),
            guardianPhone: String(formData.get("guardianPhone") ?? ""),
            emergencyContactName: String(
              formData.get("emergencyContactName") ?? "",
            ),
            emergencyContactPhone: String(
              formData.get("emergencyContactPhone") ?? "",
            ),
            accommodationRequest: String(
              formData.get("accommodationRequest") ?? "",
            ),
            dietaryNotes: String(formData.get("dietaryNotes") ?? ""),
            notes: String(formData.get("attendeeNotes") ?? ""),
          },
        ];

  const parsed = submitRegistrationSchema.safeParse({
    eventId: String(formData.get("eventId") ?? ""),
    memberId: String(formData.get("memberId") ?? ""),
    householdId: String(formData.get("householdId") ?? ""),
    primaryContactName: String(formData.get("primaryContactName") ?? ""),
    primaryContactEmail: String(formData.get("primaryContactEmail") ?? ""),
    primaryContactPhone: String(formData.get("primaryContactPhone") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    attendees,
  });

  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the registration form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const actor = await getActor();
    const registration = await submitRegistration(parsed.data, actor);
    revalidatePath(`/register/${String(formData.get("slug") ?? "")}`);
    revalidatePath(`/register/confirmation/${registration.confirmationCode}`);
    return {
      status: "success" as const,
      message:
        registration.status === "WAITLISTED"
          ? "You have been added to the waitlist."
          : "Registration confirmed.",
      confirmationCode: registration.confirmationCode,
      registrationStatus: registration.status,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message:
        error instanceof Error ? error.message : "Unable to submit registration.",
    };
  }
}

export async function getConfirmationAction(code: string) {
  return getRegistrationByConfirmationCodePublic(code);
}

export async function cancelPublicRegistrationAction(formData: FormData) {
  const parsed = cancelRegistrationSchema.safeParse({
    confirmationCode: String(formData.get("confirmationCode") ?? ""),
    reason: String(formData.get("reason") ?? ""),
    email: String(formData.get("email") ?? ""),
  });

  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please provide a valid confirmation code.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const actor = await getActor();
    const registration = await cancelRegistration(parsed.data, actor);
    revalidatePath("/register/cancel");
    revalidatePath(`/register/confirmation/${registration.confirmationCode}`);
    return {
      status: "success" as const,
      message: "Your registration has been cancelled.",
      confirmationCode: registration.confirmationCode,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message:
        error instanceof Error
          ? error.message
          : "Unable to cancel registration.",
    };
  }
}

export async function issueRegistrationQrPassAction(
  confirmationCode: string,
  rotate = false,
) {
  const organization = await findPrimaryOrganization();
  if (!organization) {
    return { status: "error" as const, message: "Organization not found." };
  }
  await assertActionAllowed("event.qr.public", null);

  const registration = await prisma.eventRegistration.findFirst({
    where: {
      organizationId: organization.id,
      confirmationCode: confirmationCode.toUpperCase(),
    },
    select: { id: true },
  });
  if (!registration) {
    return { status: "error" as const, message: "Registration not found." };
  }

  try {
    const actor = await getActor();
    const pass = await issueOrGetQrPass(registration.id, actor, {
      rotate,
      memberOwned: true,
    });
    return { status: "success" as const, ...pass };
  } catch (error) {
    return {
      status: "error" as const,
      message:
        error instanceof Error ? error.message : "Unable to issue check-in pass.",
    };
  }
}

export async function acceptPromotionOfferAction(formData: FormData) {
  const parsed = promotionOfferTokenSchema.safeParse({
    token: String(formData.get("token") ?? ""),
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "A valid offer token is required.",
    };
  }

  try {
    const registration = await acceptPromotionOffer(parsed.data.token);
    revalidatePath(`/register/confirmation/${registration.confirmationCode}`);
    return {
      status: "success" as const,
      message: "Your seat is confirmed.",
      confirmationCode: registration.confirmationCode,
      registrationStatus: registration.status,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message:
        error instanceof Error
          ? error.message
          : "Unable to accept this promotion offer.",
    };
  }
}

export async function declinePromotionOfferAction(formData: FormData) {
  const parsed = promotionOfferTokenSchema.safeParse({
    token: String(formData.get("token") ?? ""),
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "A valid offer token is required.",
    };
  }

  try {
    const registration = await declinePromotionOffer(parsed.data.token);
    return {
      status: "success" as const,
      message: "Offer declined. Your waitlist registration has been closed.",
      confirmationCode: registration.confirmationCode,
      registrationStatus: registration.status,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message:
        error instanceof Error
          ? error.message
          : "Unable to decline this promotion offer.",
    };
  }
}
