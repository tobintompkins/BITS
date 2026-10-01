import { CheckInError } from "@/lib/errors/check-in-errors";
import { getEventAccess } from "@/lib/auth/event-permissions";
import { getMemberAccess } from "@/lib/auth/member-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  CHILD_PICKUP_VERIFIED_AUDIT_ACTION,
  buildChildPickupVerifiedAuditChanges,
  canAccessVerifiedChildCheckOut,
  childPickupApprovalIdSchema,
  childPickupAttendanceIdSchema,
  childPickupCheckoutOperationKey,
  childPickupConfirmSchema,
  childPickupDisplayLabel,
  childPickupEventIdSchema,
  childPickupSearchQuerySchema,
  type ChildPickupApprovalRow,
  type ChildPickupSearchRow,
} from "@/lib/validation/child-pickup-checkout";
import { buildSafeAuditChanges } from "@/lib/validation/event-registration";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import {
  createChildPickupVerification,
  findActiveApprovedPickupForMember,
  findActiveApprovedPickupsForMember,
  findChildPickupVerificationByAttendance,
  findEventForChildPickup,
  findPresentAttendanceForChildPickup,
  searchPresentMemberLinkedAttendance,
} from "@/server/repositories/child-pickup-checkout.repository";
import { lockAttendanceForEventAttendee } from "@/server/repositories/event-attendance.repository";
import { prisma } from "@/lib/db/prisma";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";
import { applyAttendanceCheckOutInTransaction } from "@/server/services/event-check-in.service";

export type ChildPickupCheckoutPageView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "NOT_FOUND" }
  | {
      status: "READY";
      eventId: string;
      eventTitle: string;
      allowCheckOut: boolean;
      staffCheckInHref: string;
    };

export type ChildPickupSearchView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "NOT_FOUND" }
  | { status: "INVALID"; message: string }
  | { status: "READY"; rows: ChildPickupSearchRow[] };

export type ChildPickupApprovalsView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "NOT_FOUND" }
  | { status: "NOT_PRESENT" }
  | { status: "NO_APPROVALS"; displayLabel: string }
  | {
      status: "READY";
      displayLabel: string;
      attendanceId: string;
      attendeeId: string;
      rows: ChildPickupApprovalRow[];
    };

export type ChildPickupConfirmResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "NOT_FOUND" }
  | { status: "INVALID"; message: string }
  | { status: "NOT_PRESENT" }
  | { status: "CHECK_OUT_DISABLED" }
  | { status: "NO_APPROVALS" }
  | { status: "APPROVAL_MISMATCH" }
  | {
      status: "CHECKED_OUT";
      displayLabel: string;
      alreadyCompleted: boolean;
    };

function isUniqueConstraintError(error: unknown) {
  return (error as { code?: string }).code === "P2002";
}

async function requireChildPickupAccess() {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" as const };

  const [memberAccess, eventAccess] = await Promise.all([
    getMemberAccess(organization.id),
    getEventAccess(organization.id),
  ]);

  if (
    !canAccessVerifiedChildCheckOut({
      canViewMembers: memberAccess.canView,
      canEditMembers: memberAccess.canEdit,
      canManageCheckIn: eventAccess.canManageCheckIn,
    })
  ) {
    return { status: "UNAUTHORIZED" as const };
  }

  return {
    status: "READY" as const,
    userAccount,
    organization,
  };
}

function linkedMemberId(attendance: {
  memberId: string | null;
  attendee: { memberId: string | null } | null;
}) {
  const attendeeMemberId = attendance.attendee?.memberId ?? null;
  if (!attendeeMemberId) return null;
  if (attendance.memberId && attendance.memberId !== attendeeMemberId) {
    return null;
  }
  return attendeeMemberId;
}

function toSearchRow(record: {
  id: string;
  attendeeId: string | null;
  attendee: { firstName: string; lastName: string } | null;
}): ChildPickupSearchRow | null {
  if (!record.attendeeId || !record.attendee) return null;
  return {
    attendanceId: record.id,
    attendeeId: record.attendeeId,
    displayLabel: childPickupDisplayLabel(
      record.attendee.firstName,
      record.attendee.lastName,
    ),
  };
}

export async function getVerifiedChildCheckOutPage(
  eventId: string,
): Promise<ChildPickupCheckoutPageView> {
  const access = await requireChildPickupAccess();
  if (access.status !== "READY") return { status: access.status };

  const parsedEventId = childPickupEventIdSchema.safeParse(eventId);
  if (!parsedEventId.success) return { status: "NOT_FOUND" };

  const event = await findEventForChildPickup(
    access.organization.id,
    parsedEventId.data,
  );
  if (!event) return { status: "NOT_FOUND" };

  return {
    status: "READY",
    eventId: event.id,
    eventTitle: event.title,
    allowCheckOut: Boolean(event.checkInSettings?.allowCheckOut),
    staffCheckInHref: `/events/${event.id}/check-in`,
  };
}

export async function searchVerifiedChildCheckOut(
  eventId: string,
  query: string,
): Promise<ChildPickupSearchView> {
  const access = await requireChildPickupAccess();
  if (access.status !== "READY") return { status: access.status };

  const parsedEventId = childPickupEventIdSchema.safeParse(eventId);
  if (!parsedEventId.success) return { status: "NOT_FOUND" };

  const parsedQuery = childPickupSearchQuerySchema.safeParse(query);
  if (!parsedQuery.success) {
    return {
      status: "INVALID",
      message:
        parsedQuery.error.issues[0]?.message ?? "Enter at least two letters to search.",
    };
  }

  const event = await findEventForChildPickup(
    access.organization.id,
    parsedEventId.data,
  );
  if (!event) return { status: "NOT_FOUND" };

  const records = await searchPresentMemberLinkedAttendance({
    organizationId: access.organization.id,
    eventId: event.id,
    query: parsedQuery.data,
  });

  return {
    status: "READY",
    rows: records
      .map(toSearchRow)
      .filter((row): row is ChildPickupSearchRow => row !== null),
  };
}

export async function listActiveApprovalsForCheckedInChild(
  eventId: string,
  attendanceId: string,
): Promise<ChildPickupApprovalsView> {
  const access = await requireChildPickupAccess();
  if (access.status !== "READY") return { status: access.status };

  const parsedEventId = childPickupEventIdSchema.safeParse(eventId);
  const parsedAttendanceId = childPickupAttendanceIdSchema.safeParse(attendanceId);
  if (!parsedEventId.success || !parsedAttendanceId.success) {
    return { status: "NOT_FOUND" };
  }

  const attendance = await findPresentAttendanceForChildPickup(
    access.organization.id,
    parsedEventId.data,
    parsedAttendanceId.data,
  );
  if (!attendance) return { status: "NOT_FOUND" };
  if (attendance.status !== "PRESENT") return { status: "NOT_PRESENT" };

  const memberId = linkedMemberId(attendance);
  if (!memberId || !attendance.attendeeId || !attendance.attendee) {
    return { status: "NOT_FOUND" };
  }

  const displayLabel = childPickupDisplayLabel(
    attendance.attendee.firstName,
    attendance.attendee.lastName,
  );
  const pickups = await findActiveApprovedPickupsForMember(
    access.organization.id,
    memberId,
  );

  if (pickups.length === 0) {
    return { status: "NO_APPROVALS", displayLabel };
  }

  return {
    status: "READY",
    displayLabel,
    attendanceId: attendance.id,
    attendeeId: attendance.attendeeId,
    rows: pickups.map((row) => ({
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      relationship: row.relationship,
    })),
  };
}

export async function confirmVerifiedChildCheckOut(input: {
  eventId: string;
  attendanceId: string;
  approvedPickupId: string;
}): Promise<ChildPickupConfirmResult> {
  const access = await requireChildPickupAccess();
  if (access.status !== "READY") return { status: access.status };

  const parsed = childPickupConfirmSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "INVALID",
      message: parsed.error.issues[0]?.message ?? "That record was not found.",
    };
  }

  const approvalId = childPickupApprovalIdSchema.safeParse(
    parsed.data.approvedPickupId,
  );
  if (!approvalId.success) return { status: "NOT_FOUND" };

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const event = await findEventForChildPickup(
        access.organization.id,
        parsed.data.eventId,
        tx,
      );
      if (!event) return { kind: "NOT_FOUND" as const };

      const attendance = await findPresentAttendanceForChildPickup(
        access.organization.id,
        parsed.data.eventId,
        parsed.data.attendanceId,
        tx,
      );
      if (!attendance) return { kind: "NOT_FOUND" as const };

      if (attendance.attendeeId) {
        await lockAttendanceForEventAttendee(
          access.organization.id,
          parsed.data.eventId,
          attendance.attendeeId,
          tx,
        );
      }

      const locked = await findPresentAttendanceForChildPickup(
        access.organization.id,
        parsed.data.eventId,
        parsed.data.attendanceId,
        tx,
      );
      if (!locked) return { kind: "NOT_FOUND" as const };

      const memberId = linkedMemberId(locked);
      if (!memberId || !locked.attendee) return { kind: "NOT_FOUND" as const };

      const displayLabel = childPickupDisplayLabel(
        locked.attendee.firstName,
        locked.attendee.lastName,
      );

      const existing = await findChildPickupVerificationByAttendance(
        access.organization.id,
        locked.id,
        tx,
      );

      if (existing) {
        await applyAttendanceCheckOutInTransaction(
          parsed.data.eventId,
          locked.id,
          { userAccountId: access.userAccount.id, email: null },
          {
            operationKey: childPickupCheckoutOperationKey(
              parsed.data.eventId,
              locked.id,
            ),
          },
          access.organization.id,
          tx,
        );
        return {
          kind: "CHECKED_OUT" as const,
          displayLabel,
          alreadyCompleted: true,
          verificationId: existing.id,
          attendanceId: locked.id,
          skipAudit: true,
        };
      }

      if (locked.status !== "PRESENT") return { kind: "NOT_PRESENT" as const };

      const pickup = await findActiveApprovedPickupForMember(
        access.organization.id,
        memberId,
        approvalId.data,
        tx,
      );
      if (!pickup) {
        const anyActive = await findActiveApprovedPickupsForMember(
          access.organization.id,
          memberId,
          tx,
        );
        return anyActive.length === 0
          ? { kind: "NO_APPROVALS" as const }
          : { kind: "APPROVAL_MISMATCH" as const };
      }

      const verifiedAt = new Date();
      let verification;
      try {
        verification = await createChildPickupVerification(
          {
            organizationId: access.organization.id,
            eventId: parsed.data.eventId,
            attendanceId: locked.id,
            memberId,
            approvedPickupId: pickup.id,
            verifiedByUserId: access.userAccount.id,
            verifiedAt,
          },
          tx,
        );
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        const raced = await findChildPickupVerificationByAttendance(
          access.organization.id,
          locked.id,
          tx,
        );
        if (!raced) throw error;
        await applyAttendanceCheckOutInTransaction(
          parsed.data.eventId,
          locked.id,
          { userAccountId: access.userAccount.id, email: null },
          {
            operationKey: childPickupCheckoutOperationKey(
              parsed.data.eventId,
              locked.id,
            ),
          },
          access.organization.id,
          tx,
        );
        return {
          kind: "CHECKED_OUT" as const,
          displayLabel,
          alreadyCompleted: true,
          verificationId: raced.id,
          attendanceId: locked.id,
          skipAudit: true,
        };
      }

      const checkout = await applyAttendanceCheckOutInTransaction(
        parsed.data.eventId,
        locked.id,
        { userAccountId: access.userAccount.id, email: null },
        {
          operationKey: childPickupCheckoutOperationKey(
            parsed.data.eventId,
            locked.id,
          ),
        },
        access.organization.id,
        tx,
      );

      return {
        kind: "CHECKED_OUT" as const,
        displayLabel,
        alreadyCompleted: checkout.alreadyCheckedOut,
        verificationId: verification.id,
        attendanceId: locked.id,
        skipAudit: false,
      };
    });

    if (outcome.kind !== "CHECKED_OUT") {
      return { status: outcome.kind };
    }

    if (!outcome.skipAudit) {
      await createAuditEvent({
        organizationId: access.organization.id,
        actorUserAccountId: access.userAccount.id,
        action: "EVENT_ATTENDEE_CHECKED_OUT",
        entityType: "EventAttendanceRecord",
        entityId: outcome.attendanceId,
        changes: buildSafeAuditChanges({ eventId: parsed.data.eventId }),
      });
      await createAuditEvent({
        organizationId: access.organization.id,
        actorUserAccountId: access.userAccount.id,
        action: CHILD_PICKUP_VERIFIED_AUDIT_ACTION,
        entityType: "ChildPickupCheckoutVerification",
        entityId: outcome.verificationId,
        changes: buildChildPickupVerifiedAuditChanges({
          eventId: parsed.data.eventId,
          attendanceId: outcome.attendanceId,
          verificationId: outcome.verificationId,
          alreadyCompleted: false,
        }),
      });
    }

    return {
      status: "CHECKED_OUT",
      displayLabel: outcome.displayLabel,
      alreadyCompleted: outcome.alreadyCompleted,
    };
  } catch (error) {
    if (error instanceof CheckInError) {
      if (error.code === "CHECK_OUT_DISABLED") {
        return { status: "CHECK_OUT_DISABLED" };
      }
      if (error.code === "CHECK_IN_DISABLED" || error.code === "STATION_CLOSED") {
        return { status: "CHECK_OUT_DISABLED" };
      }
      if (error.code === "VALIDATION") return { status: "NOT_PRESENT" };
      if (error.code === "NOT_FOUND") return { status: "NOT_FOUND" };
    }
    throw error;
  }
}
