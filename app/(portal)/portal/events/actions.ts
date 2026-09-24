"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  memberEventRegistrationsHref,
  parseMemberEventRegistrationsQuery,
  type MemberEventRegistrationNotice,
} from "@/lib/validation/member-event-registrations";
import { cancelMemberEventRegistration } from "@/server/services/member-event-registration-cancellation.service";

function filtersFromForm(formData: FormData) {
  return parseMemberEventRegistrationsQuery({
    view: String(formData.get("view") ?? ""),
    status: String(formData.get("status") ?? ""),
    page: String(formData.get("page") ?? ""),
  });
}

function redirectWithNotice(
  filters: ReturnType<typeof parseMemberEventRegistrationsQuery>,
  notice: MemberEventRegistrationNotice,
): never {
  redirect(
    memberEventRegistrationsHref({
      view: filters.view,
      status: filters.status,
      page: filters.page,
      notice,
    }),
  );
}

export async function cancelMemberRegistrationAction(formData: FormData) {
  const filters = filtersFromForm(formData);
  const result = await cancelMemberEventRegistration({
    registrationId: String(formData.get("registrationId") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });

  if (result.status === "SIGNED_OUT") redirect("/sign-in");
  if (result.status === "NO_ORGANIZATION") {
    redirectWithNotice(filters, "no-organization");
  }
  if (result.status === "NOT_FOUND") {
    redirectWithNotice(filters, "not-found");
  }
  if (result.status === "INVALID_REASON") {
    redirectWithNotice(filters, "invalid-reason");
  }
  if (result.status === "CANCELLATION_DISABLED") {
    redirectWithNotice(filters, "disabled");
  }
  if (result.status === "CANCELLATION_DEADLINE_PASSED") {
    redirectWithNotice(filters, "deadline");
  }
  if (result.status === "ERROR" || result.status !== "CANCELLED") {
    redirectWithNotice(filters, "unavailable");
  }

  revalidatePath("/portal/events");
  revalidatePath("/church-events");
  if (result.confirmationCode) {
    revalidatePath(`/register/confirmation/${result.confirmationCode}`);
  }
  if (result.eventSlug) {
    revalidatePath(`/register/${result.eventSlug}`);
  }
  if (result.eventId) {
    revalidatePath(`/events/${result.eventId}`);
  }

  redirectWithNotice(filters, "cancelled");
}
