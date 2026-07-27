/**
 * In-app notification placeholders for event registration.
 * No email/SMS provider is configured in BITS yet — this records
 * structured intent for a future delivery service.
 */

export type RegistrationNotificationType =
  | "REGISTRATION_CONFIRMED"
  | "REGISTRATION_WAITLISTED"
  | "WAITLIST_OFFERED"
  | "WAITLIST_PROMOTED"
  | "WAITLIST_OFFER_ACCEPTED"
  | "WAITLIST_OFFER_DECLINED"
  | "WAITLIST_OFFER_EXPIRED"
  | "REGISTRATION_CANCELLED"
  | "EVENT_REMINDER"
  | "CHECK_IN_READY";

export type RegistrationNotificationPayload = {
  type: RegistrationNotificationType;
  organizationId: string;
  eventId: string;
  registrationId?: string;
  recipientEmail?: string | null;
  message: string;
  meta?: Record<string, string>;
};

const recent: RegistrationNotificationPayload[] = [];

export function enqueueRegistrationNotification(
  payload: RegistrationNotificationPayload,
) {
  recent.push({
    ...payload,
    recipientEmail: payload.recipientEmail
      ? payload.recipientEmail.toLowerCase()
      : null,
  });
  if (recent.length > 100) recent.shift();
  return { queued: true as const, delivery: "placeholder" as const };
}

export function getRecentRegistrationNotifications() {
  return [...recent];
}

export function clearRecentRegistrationNotifications() {
  recent.length = 0;
}
