import { requireEventPermission } from "@/lib/auth/event-permissions";
import { CheckInError } from "@/lib/errors/check-in-errors";
import {
  kioskQueryIsReady,
  toKioskCheckInResult,
  type KioskCheckInResult,
} from "@/lib/events/check-in-kiosk-ui";
import { searchEligibleAttendees } from "@/server/repositories/event-check-in.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";
import { checkInAttendeeById } from "@/server/services/event-check-in.service";

type Actor = { userAccountId: string | null; email: string | null };

async function getOrganizationId() {
  const organization = await findPrimaryOrganization();
  if (!organization) {
    throw new CheckInError("EVENT_NOT_FOUND", "Organization not found.");
  }
  return organization.id;
}

export async function searchKioskCheckInAttendees(
  eventId: string,
  query: string,
  page = 1,
  pageSize = 8,
): Promise<{
  items: KioskCheckInResult[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (access) => access.canOperateCheckIn,
    "You do not have permission to use the check-in kiosk.",
  );

  if (!kioskQueryIsReady(query)) {
    return { items: [], total: 0, page, pageSize };
  }

  const result = await searchEligibleAttendees(
    organizationId,
    eventId,
    query.trim(),
    page,
    pageSize,
  );

  return {
    items: result.items.map(toKioskCheckInResult),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  };
}

export async function kioskCheckInAttendee(
  input: { eventId: string; attendeeId: string; operationKey?: string },
  actor: Actor,
) {
  return checkInAttendeeById(
    {
      eventId: input.eventId,
      attendeeId: input.attendeeId,
      source: "STAFF_SEARCH",
      operationKey: input.operationKey,
    },
    actor,
  );
}
