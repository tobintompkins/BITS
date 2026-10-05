import { auth } from "@clerk/nextjs/server";
import { RoleCode } from "@/app/generated/prisma/client";
import {
  canAssignGivingHouseholdFinancialContacts,
  canBackdateGivingHouseholdMemberships,
  canManageGivingHouseholds,
  canViewGivingHouseholds,
} from "@/lib/auth/giving-household-permissions";
import { prisma } from "@/lib/db/prisma";
import {
  addUtcDays,
  calendarDateInTimeZone,
  compareUtcDates,
  formatDateOnly,
  GIVING_HOUSEHOLD_PAGE_SIZE,
  GIVING_HOUSEHOLD_PICKER_PAGE_SIZE,
  givingHouseholdSchema,
  membershipIntervalsOverlap,
  parseDateOnly,
  parseUuid,
  type GivingHouseholdFormValues,
  type GivingHouseholdMembershipMutation,
} from "@/lib/validation/giving-household";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import {
  findGivingHouseholdInOrganization,
  listDonorGivingHouseholdMemberships,
  listGivingHouseholdMoveTargetsForOrganization,
  listGivingHouseholds,
  listUnassignedGivingDonorsForOrganization,
  lockDonorsInSortedOrder,
  lockHouseholdInOrganization,
  lockHouseholdsInSortedOrder,
} from "@/server/repositories/giving-household.repository";

export class GivingHouseholdError extends Error {}

function isUniqueConstraintError(error: unknown) {
  return (error as { code?: string }).code === "P2002";
}

export async function requireGivingHouseholdAccess(
  write = false,
  expectedOrganizationId?: string,
  financial = false,
) {
  const { userId, orgId } = await auth();
  if (!userId) throw new GivingHouseholdError("Sign in to access giving households.");
  const actor = await prisma.userAccount.findUnique({
    where: { clerkUserId: userId },
  });
  if (!actor?.active) {
    throw new GivingHouseholdError("An active staff account is required.");
  }
  const memberships = await prisma.organizationMembership.findMany({
    where: {
      userAccountId: actor.id,
      active: true,
      organization: {
        active: true,
        ...(orgId ? { clerkOrganizationId: orgId } : {}),
      },
    },
    include: { roleType: true, organization: true },
    take: 2,
  });
  if (memberships.length !== 1) {
    throw new GivingHouseholdError(
      "Select a church organization with an active staff membership.",
    );
  }
  const membership = memberships[0];
  const roleCode = membership.roleType.code as RoleCode;
  if (write && financial && !canAssignGivingHouseholdFinancialContacts(roleCode)) {
    throw new GivingHouseholdError(
      "You do not have permission to change the primary donor or preferred statement recipient.",
    );
  }
  if (write ? !canManageGivingHouseholds(roleCode) : !canViewGivingHouseholds(roleCode)) {
    throw new GivingHouseholdError(
      "You do not have permission to perform this giving household action.",
    );
  }
  if (
    expectedOrganizationId &&
    expectedOrganizationId !== membership.organizationId
  ) {
    throw new GivingHouseholdError(
      "Your church selection changed. Reload this page before saving.",
    );
  }
  return {
    actor,
    organization: membership.organization,
    roleCode,
    canEdit: canManageGivingHouseholds(roleCode),
    canAssignFinancial: canAssignGivingHouseholdFinancialContacts(roleCode),
    canBackdate: canBackdateGivingHouseholdMemberships(roleCode),
    canViewHouseholdStatements: roleCode === RoleCode.ORG_ADMIN || roleCode === RoleCode.TREASURER || roleCode === RoleCode.REPORT_VIEWER,
  };
}

function booleanFromForm(value: unknown) {
  return value === true || value === "on" || value === "true";
}

export function givingHouseholdFormFromUnknown(
  raw: unknown,
): GivingHouseholdFormValues {
  const data = (raw ?? {}) as Record<string, unknown>;
  return {
    displayName: String(data.displayName ?? ""),
    mailingAddressLine1: String(data.mailingAddressLine1 ?? ""),
    mailingAddressLine2: String(data.mailingAddressLine2 ?? ""),
    city: String(data.city ?? ""),
    state: String(data.state ?? ""),
    postalCode: String(data.postalCode ?? ""),
    country: String(data.country ?? "US"),
    statementDeliveryMethod: String(data.statementDeliveryMethod ?? ""),
    active: booleanFromForm(data.active),
    primaryDonorId: String(data.primaryDonorId ?? ""),
    preferredStatementRecipientId: String(data.preferredStatementRecipientId ?? ""),
  };
}

function boundedChanges(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
  keys: string[],
) {
  return keys
    .filter(
      (field) =>
        !before || String(before[field] ?? "") !== String(after[field] ?? ""),
    )
    .map((field) => ({
      field,
      oldValue: before ? (before[field] ? "changed" : "") : null,
      newValue: after[field] ? "changed" : "",
    }));
}

function churchToday(organization: { timeZone?: string | null }, now: Date) {
  return calendarDateInTimeZone(now, organization.timeZone || "America/New_York");
}

function requireDate(value: string, label: string) {
  const parsed = parseDateOnly(value);
  if (!parsed) throw new GivingHouseholdError(`${label} must be a valid calendar date.`);
  return parsed;
}

function nextHouseholdVersion(updatedAt?: Date | null) {
  const previous = updatedAt?.getTime() ?? 0;
  return new Date(Math.max(Date.now(), previous + 1));
}

function requireUuid(value: string | undefined, label: string) {
  const parsed = parseUuid(value);
  if (!parsed) {
    throw new GivingHouseholdError(`${label} is not valid.`);
  }
  return parsed;
}

async function assertNoOverlaps(
  tx: Parameters<typeof lockHouseholdInOrganization>[0],
  organizationId: string,
  donorId: string,
  next: { startDate: Date; endDate: Date | null },
  ignoreId?: string,
) {
  const rows = await tx.householdMembership.findMany({
    where: { organizationId, donorId, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
    select: { id: true, startDate: true, endDate: true },
  });
  if (
    rows.some((row) =>
      membershipIntervalsOverlap(
        { startDate: row.startDate, endDate: row.endDate },
        next,
      ),
    )
  ) {
    throw new GivingHouseholdError(
      "This donor already has giving-household history that overlaps those dates. Review the existing rows instead of repairing them automatically.",
    );
  }
}

async function eligibleHouseholdDonors(
  organizationId: string,
  householdId: string,
) {
  const open = await prisma.householdMembership.findMany({
    where: { organizationId, householdId, endDate: null },
    include: {
      donor: {
        select: { id: true, firstName: true, lastName: true, active: true },
      },
    },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
  });
  return open
    .filter((row) => row.donor.active)
    .map((row) => row.donor);
}

export async function listGivingHouseholdDirectory(
  query: string,
  status: string,
  requestedPage: number,
) {
  const access = await requireGivingHouseholdAccess();
  const q = query.trim().slice(0, 100);
  const page = Number.isSafeInteger(requestedPage)
    ? Math.max(1, Math.min(100000, requestedPage))
    : 1;
  const result = await listGivingHouseholds({
    organizationId: access.organization.id,
    query: q,
    status,
    skip: (page - 1) * GIVING_HOUSEHOLD_PAGE_SIZE,
    take: GIVING_HOUSEHOLD_PAGE_SIZE,
  });
  return { ...access, ...result, page, q };
}

export async function getGivingHousehold(id: string) {
  const access = await requireGivingHouseholdAccess();
  const household = await findGivingHouseholdInOrganization(
    access.organization.id,
    id,
  );
  if (!household) {
    throw new GivingHouseholdError("Giving household not found in this church.");
  }
  const [eligibleDonors, moveTargets, unassignedDonors] = await Promise.all([
    eligibleHouseholdDonors(access.organization.id, household.id),
    listGivingHouseholdMoveTargetsForOrganization({
      organizationId: access.organization.id,
      excludeHouseholdId: household.id,
      query: "",
      page: 1,
    }),
    listUnassignedGivingDonorsForOrganization({
      organizationId: access.organization.id,
      query: "",
      page: 1,
    }),
  ]);
  return {
    ...access,
    household,
    eligibleDonors,
    moveTargets,
    unassignedDonors,
    pickerPageSize: GIVING_HOUSEHOLD_PICKER_PAGE_SIZE,
    churchToday: churchToday(access.organization, new Date()),
    needsRecipientReview: !household.preferredStatementRecipientId,
  };
}

export async function getDonorGivingHouseholdHistory(donorId: string) {
  const access = await requireGivingHouseholdAccess();
  const donor = await prisma.donor.findFirst({
    where: { id: donorId, organizationId: access.organization.id },
    select: { id: true },
  });
  if (!donor) throw new GivingHouseholdError("Donor not found in this church.");
  const memberships = await listDonorGivingHouseholdMemberships(
    access.organization.id,
    donorId,
  );
  return { ...access, memberships };
}

export async function saveGivingHousehold(
  organizationId: string,
  id: string | null,
  raw: unknown,
  expectedUpdatedAt?: string | null,
) {
  const access = await requireGivingHouseholdAccess(true, organizationId);
  const parsed = givingHouseholdSchema.safeParse(raw);
  if (!parsed.success) {
    throw new GivingHouseholdError(
      parsed.error.issues[0]?.message ?? "Check giving household details.",
    );
  }
  const data = parsed.data;

  try {
    return await prisma.$transaction(async (tx) => {
      if (!id) {
        const household = await tx.household.create({
          data: {
            organizationId: access.organization.id,
            displayName: data.displayName,
            mailingAddressLine1: data.mailingAddressLine1,
            mailingAddressLine2: data.mailingAddressLine2,
            city: data.city,
            state: data.state,
            postalCode: data.postalCode,
            country: data.country,
            statementDeliveryMethod: data.statementDeliveryMethod,
            active: data.active,
            primaryDonorId: null,
            preferredStatementRecipientId: null,
          },
        });
        await createAuditEvent(
          {
            organizationId: access.organization.id,
            actorUserAccountId: access.actor.id,
            action: "GIVING_HOUSEHOLD_CREATED",
            entityType: "Household",
            entityId: household.id,
            changes: boundedChanges(null, household, [
              "displayName",
              "mailingAddressLine1",
              "city",
              "state",
              "postalCode",
              "statementDeliveryMethod",
              "active",
            ]),
          },
          tx,
        );
        return { id: household.id };
      }

      const householdId = requireUuid(id, "Giving household");
      const lockedHousehold = await lockHouseholdInOrganization(
        tx,
        access.organization.id,
        householdId,
      );
      if (!lockedHousehold) {
        throw new GivingHouseholdError(
          "Giving household not found in this church.",
        );
      }

      const before = await tx.household.findFirst({
        where: { id: householdId, organizationId: access.organization.id },
      });
      if (!before) {
        throw new GivingHouseholdError(
          "Giving household not found in this church.",
        );
      }
      if (before.updatedAt.toISOString() !== expectedUpdatedAt) {
        throw new GivingHouseholdError(
          "This giving household was updated by someone else. Reload the page before saving.",
        );
      }

      const persist: Record<string, unknown> = {
        displayName: data.displayName,
        mailingAddressLine1: data.mailingAddressLine1,
        mailingAddressLine2: data.mailingAddressLine2,
        city: data.city,
        state: data.state,
        postalCode: data.postalCode,
        country: data.country,
        statementDeliveryMethod: data.statementDeliveryMethod,
        active: data.active,
        updatedAt: nextHouseholdVersion(before.updatedAt),
      };

      if (access.canAssignFinancial) {
        const donorIds = [
          data.primaryDonorId,
          data.preferredStatementRecipientId,
        ].filter((value): value is string => Boolean(value));
        const lockedDonors = await lockDonorsInSortedOrder(
          tx,
          access.organization.id,
          donorIds,
        );
        if (lockedDonors.missingId) {
          throw new GivingHouseholdError("Donor not found in this church.");
        }
        const openMembers = await tx.householdMembership.findMany({
          where: {
            organizationId: access.organization.id,
            householdId: before.id,
            endDate: null,
            donor: { active: true },
          },
          select: { donorId: true },
        });
        const eligibleIds = new Set(openMembers.map((row) => row.donorId));
        if (data.primaryDonorId && !eligibleIds.has(data.primaryDonorId)) {
          throw new GivingHouseholdError(
            "The primary donor must be an active current member of this giving household.",
          );
        }
        if (
          data.preferredStatementRecipientId &&
          !eligibleIds.has(data.preferredStatementRecipientId)
        ) {
          throw new GivingHouseholdError(
            "The preferred statement recipient must be an active current member of this giving household.",
          );
        }
        persist.primaryDonorId = data.primaryDonorId;
        persist.preferredStatementRecipientId = data.preferredStatementRecipientId;
      } else if (
        (data.primaryDonorId &&
          data.primaryDonorId !== (before.primaryDonorId ?? null)) ||
        (data.preferredStatementRecipientId &&
          data.preferredStatementRecipientId !==
            (before.preferredStatementRecipientId ?? null))
      ) {
        throw new GivingHouseholdError(
          "You do not have permission to change the primary donor or preferred statement recipient.",
        );
      }

      const updated = await tx.household.updateMany({
        where: {
          id: before.id,
          organizationId: access.organization.id,
          updatedAt: before.updatedAt,
        },
        data: persist,
      });
      if (updated.count !== 1) {
        throw new GivingHouseholdError(
          "This giving household was updated by someone else. Reload the page before saving.",
        );
      }

      await createAuditEvent(
        {
          organizationId: access.organization.id,
          actorUserAccountId: access.actor.id,
          action:
            data.active !== before.active
              ? data.active
                ? "GIVING_HOUSEHOLD_REACTIVATED"
                : "GIVING_HOUSEHOLD_DEACTIVATED"
              : "GIVING_HOUSEHOLD_UPDATED",
          entityType: "Household",
          entityId: before.id,
          changes: boundedChanges(before, persist, [
            "displayName",
            "mailingAddressLine1",
            "city",
            "state",
            "postalCode",
            "statementDeliveryMethod",
            "active",
            "primaryDonorId",
            "preferredStatementRecipientId",
          ]),
        },
        tx,
      );

      return { id: before.id };
    });
  } catch (error) {
    if (error instanceof GivingHouseholdError) throw error;
    throw error;
  }
}

async function requireMembershipDate(
  access: Awaited<ReturnType<typeof requireGivingHouseholdAccess>>,
  rawDate: string,
  confirmBackdate: boolean,
  now: Date,
) {
  const date = requireDate(rawDate, "The membership date");
  const today = requireDate(
    churchToday(access.organization, now),
    "Today",
  );
  if (compareUtcDates(date, today) > 0) {
    throw new GivingHouseholdError(
      "Future-effective membership changes are not available in this increment.",
    );
  }
  if (compareUtcDates(date, today) < 0) {
    if (!access.canBackdate) {
      throw new GivingHouseholdError(
        "Only an administrator or treasurer can backdate giving-household membership changes.",
      );
    }
    if (!confirmBackdate) {
      throw new GivingHouseholdError(
        "Confirm that this backdated change may affect future statement previews. Archived PDFs stay unchanged.",
      );
    }
  }
  return { date, today };
}

export async function linkGivingHouseholdDonor(
  organizationId: string,
  input: {
    householdId: string;
    donorId: string;
    startDate: string;
    relationshipLabel?: string;
    confirmBackdate?: boolean;
    now?: Date;
  },
): Promise<GivingHouseholdMembershipMutation> {
  const access = await requireGivingHouseholdAccess(true, organizationId);
  const householdId = requireUuid(input.householdId, "Giving household");
  const donorId = requireUuid(input.donorId, "Donor");
  const { date } = await requireMembershipDate(
    access,
    input.startDate,
    Boolean(input.confirmBackdate),
    input.now ?? new Date(),
  );

  try {
    return await prisma.$transaction(async (tx) => {
      const households = await lockHouseholdsInSortedOrder(
        tx,
        access.organization.id,
        [householdId],
      );
      if (households.missingId) {
        throw new GivingHouseholdError(
          "Giving household not found in this church.",
        );
      }
      const donors = await lockDonorsInSortedOrder(
        tx,
        access.organization.id,
        [donorId],
      );
      if (donors.missingId) {
        throw new GivingHouseholdError("Donor not found in this church.");
      }

      const [household, donor] = await Promise.all([
        tx.household.findFirst({
          where: { id: householdId, organizationId: access.organization.id },
        }),
        tx.donor.findFirst({
          where: { id: donorId, organizationId: access.organization.id },
        }),
      ]);
      if (!household) {
        throw new GivingHouseholdError(
          "Giving household not found in this church.",
        );
      }
      if (!household.active) {
        throw new GivingHouseholdError(
          "Choose an active giving household. Inactive households stay on file for history.",
        );
      }
      if (!donor) throw new GivingHouseholdError("Donor not found in this church.");

      const already = await tx.householdMembership.findFirst({
        where: {
          organizationId: access.organization.id,
          householdId: household.id,
          donorId: donor.id,
          startDate: date,
          endDate: null,
        },
      });
      if (already) {
        return {
          membershipId: already.id,
          donorId: donor.id,
          householdIds: [household.id],
        };
      }

      await assertNoOverlaps(tx, access.organization.id, donor.id, {
        startDate: date,
        endDate: null,
      });

      const membership = await tx.householdMembership.create({
        data: {
          organizationId: access.organization.id,
          householdId: household.id,
          donorId: donor.id,
          startDate: date,
          relationshipLabel: input.relationshipLabel?.trim() || null,
        },
      });

      await createAuditEvent(
        {
          organizationId: access.organization.id,
          actorUserAccountId: access.actor.id,
          action: "GIVING_HOUSEHOLD_MEMBER_LINKED",
          entityType: "HouseholdMembership",
          entityId: membership.id,
          changes: [
            { field: "householdId", oldValue: null, newValue: "changed" },
            { field: "donorId", oldValue: null, newValue: "changed" },
            { field: "startDate", oldValue: null, newValue: formatDateOnly(date) },
          ],
        },
        tx,
      );

      return {
        membershipId: membership.id,
        donorId: donor.id,
        householdIds: [household.id],
      };
    });
  } catch (error) {
    if (error instanceof GivingHouseholdError) throw error;
    if (isUniqueConstraintError(error)) {
      throw new GivingHouseholdError(
        "This donor already has an open giving-household membership.",
      );
    }
    throw error;
  }
}

export async function moveGivingHouseholdDonor(
  organizationId: string,
  input: {
    donorId?: string;
    fromHouseholdId?: string;
    toHouseholdId: string;
    currentMembershipId: string;
    effectiveDate: string;
    relationshipLabel?: string;
    confirmBackdate?: boolean;
    now?: Date;
  },
): Promise<GivingHouseholdMembershipMutation> {
  const access = await requireGivingHouseholdAccess(true, organizationId);
  const toHouseholdId = requireUuid(input.toHouseholdId, "Destination household");
  const currentMembershipId = requireUuid(
    input.currentMembershipId,
    "Current membership",
  );
  const { date } = await requireMembershipDate(
    access,
    input.effectiveDate,
    Boolean(input.confirmBackdate),
    input.now ?? new Date(),
  );
  if (input.fromHouseholdId && input.fromHouseholdId === toHouseholdId) {
    throw new GivingHouseholdError(
      "Choose a different giving household. A donor cannot be moved to the same household.",
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const selected = await tx.householdMembership.findFirst({
        where: {
          id: currentMembershipId,
          organizationId: access.organization.id,
        },
      });
      if (!selected) {
        throw new GivingHouseholdError(
          "The current giving-household membership was not found in this church.",
        );
      }
      if (
        (input.donorId && input.donorId !== selected.donorId) ||
        (input.fromHouseholdId && input.fromHouseholdId !== selected.householdId)
      ) {
        throw new GivingHouseholdError(
          "This membership was updated by someone else. Reload the page before moving the donor.",
        );
      }

      const households = await lockHouseholdsInSortedOrder(
        tx,
        access.organization.id,
        [selected.householdId, toHouseholdId],
      );
      if (households.missingId) {
        throw new GivingHouseholdError(
          "The current giving-household membership was not found in this church.",
        );
      }
      const donors = await lockDonorsInSortedOrder(
        tx,
        access.organization.id,
        [selected.donorId],
      );
      if (donors.missingId) {
        throw new GivingHouseholdError("Donor not found in this church.");
      }

      const [fromHousehold, toHousehold, current] = await Promise.all([
        tx.household.findFirst({
          where: {
            id: selected.householdId,
            organizationId: access.organization.id,
          },
        }),
        tx.household.findFirst({
          where: {
            id: toHouseholdId,
            organizationId: access.organization.id,
          },
        }),
        tx.householdMembership.findFirst({
          where: {
            id: selected.id,
            organizationId: access.organization.id,
            donorId: selected.donorId,
            householdId: selected.householdId,
          },
        }),
      ]);
      if (!fromHousehold || !toHousehold || !current) {
        throw new GivingHouseholdError(
          "The current giving-household membership was not found in this church.",
        );
      }
      if (!toHousehold.active) {
        throw new GivingHouseholdError(
          "Choose an active giving household. Inactive households stay on file for history.",
        );
      }
      if (current.householdId === toHousehold.id) {
        throw new GivingHouseholdError(
          "Choose a different giving household. A donor cannot be moved to the same household.",
        );
      }
      const affectedHouseholdIds = [fromHousehold.id, toHousehold.id];
      if (current.endDate) {
        const existing = await tx.householdMembership.findFirst({
          where: {
            organizationId: access.organization.id,
            donorId: current.donorId,
            householdId: toHousehold.id,
            startDate: date,
          },
        });
        if (existing) {
          return {
            membershipId: existing.id,
            donorId: current.donorId,
            householdIds: affectedHouseholdIds,
          };
        }
        throw new GivingHouseholdError(
          "This membership was updated by someone else. Reload the page before moving the donor.",
        );
      }
      if (compareUtcDates(date, current.startDate) <= 0) {
        throw new GivingHouseholdError(
          "A move cannot start on or before the current membership start date. Ask an administrator for a later dedicated correction workflow.",
        );
      }

      const closeOn = addUtcDays(date, -1);
      const already = await tx.householdMembership.findFirst({
        where: {
          organizationId: access.organization.id,
          donorId: current.donorId,
          householdId: toHousehold.id,
          startDate: date,
          endDate: null,
        },
      });
      if (already && compareUtcDates(current.endDate ?? closeOn, closeOn) === 0) {
        return {
          membershipId: already.id,
          donorId: current.donorId,
          householdIds: affectedHouseholdIds,
        };
      }

      await assertNoOverlaps(
        tx,
        access.organization.id,
        current.donorId,
        { startDate: date, endDate: null },
        current.id,
      );

      await tx.householdMembership.update({
        where: { id: current.id },
        data: { endDate: closeOn },
      });
      const created = await tx.householdMembership.create({
        data: {
          organizationId: access.organization.id,
          householdId: toHousehold.id,
          donorId: current.donorId,
          startDate: date,
          relationshipLabel: input.relationshipLabel?.trim() || current.relationshipLabel,
        },
      });

      const cleanup: Record<string, unknown> = {};
      if (fromHousehold.primaryDonorId === current.donorId) {
        cleanup.primaryDonorId = null;
      }
      if (fromHousehold.preferredStatementRecipientId === current.donorId) {
        cleanup.preferredStatementRecipientId = null;
      }
      if (Object.keys(cleanup).length) {
        await tx.household.updateMany({
          where: {
            id: fromHousehold.id,
            organizationId: access.organization.id,
          },
          data: {
            ...cleanup,
            updatedAt: nextHouseholdVersion(fromHousehold.updatedAt),
          },
        });
      }

      await createAuditEvent(
        {
          organizationId: access.organization.id,
          actorUserAccountId: access.actor.id,
          action: "GIVING_HOUSEHOLD_MEMBER_MOVED",
          entityType: "HouseholdMembership",
          entityId: created.id,
          changes: [
            { field: "fromHouseholdId", oldValue: "changed", newValue: "changed" },
            { field: "toHouseholdId", oldValue: null, newValue: "changed" },
            { field: "closedOn", oldValue: null, newValue: formatDateOnly(closeOn) },
            { field: "startedOn", oldValue: null, newValue: formatDateOnly(date) },
            ...(Object.keys(cleanup).length
              ? [{ field: "recipientReview", oldValue: null, newValue: "needed" }]
              : []),
          ],
        },
        tx,
      );

      return {
        membershipId: created.id,
        donorId: current.donorId,
        householdIds: affectedHouseholdIds,
      };
    });
  } catch (error) {
    if (error instanceof GivingHouseholdError) throw error;
    if (isUniqueConstraintError(error)) {
      throw new GivingHouseholdError(
        "This donor already has an open giving-household membership.",
      );
    }
    throw error;
  }
}

export async function endGivingHouseholdMembership(
  organizationId: string,
  input: {
    membershipId: string;
    endDate: string;
    expectedUpdatedAt: string;
    confirmBackdate?: boolean;
    now?: Date;
  },
): Promise<GivingHouseholdMembershipMutation> {
  const access = await requireGivingHouseholdAccess(true, organizationId);
  const membershipId = requireUuid(input.membershipId, "Membership");
  const { date } = await requireMembershipDate(
    access,
    input.endDate,
    Boolean(input.confirmBackdate),
    input.now ?? new Date(),
  );

  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.householdMembership.findFirst({
        where: {
          id: membershipId,
          organizationId: access.organization.id,
        },
      });
      if (!current) {
        throw new GivingHouseholdError(
          "Giving-household membership not found in this church.",
        );
      }
      const households = await lockHouseholdsInSortedOrder(
        tx,
        access.organization.id,
        [current.householdId],
      );
      if (households.missingId) {
        throw new GivingHouseholdError(
          "Giving household not found in this church.",
        );
      }
      const donors = await lockDonorsInSortedOrder(
        tx,
        access.organization.id,
        [current.donorId],
      );
      if (donors.missingId) {
        throw new GivingHouseholdError("Donor not found in this church.");
      }
      const fresh = await tx.householdMembership.findFirst({
        where: { id: current.id, organizationId: access.organization.id },
      });
      if (!fresh) {
        throw new GivingHouseholdError(
          "Giving-household membership not found in this church.",
        );
      }
      if (fresh.updatedAt.toISOString() !== input.expectedUpdatedAt) {
        throw new GivingHouseholdError(
          "This membership was updated by someone else. Reload the page before saving.",
        );
      }
      if (fresh.endDate && compareUtcDates(fresh.endDate, date) === 0) {
        return {
          membershipId: fresh.id,
          donorId: fresh.donorId,
          householdIds: [fresh.householdId],
        };
      }
      if (fresh.endDate) {
        throw new GivingHouseholdError(
          "This membership was updated by someone else. Reload the page before saving.",
        );
      }
      if (compareUtcDates(date, fresh.startDate) < 0) {
        throw new GivingHouseholdError(
          "The end date must be on or after the membership start date.",
        );
      }

      await assertNoOverlaps(
        tx,
        access.organization.id,
        fresh.donorId,
        { startDate: fresh.startDate, endDate: date },
        fresh.id,
      );

      await tx.householdMembership.update({
        where: { id: fresh.id },
        data: { endDate: date },
      });

      const household = await tx.household.findFirst({
        where: { id: fresh.householdId, organizationId: access.organization.id },
      });
      const cleanup: Record<string, unknown> = {};
      if (household?.primaryDonorId === fresh.donorId) {
        cleanup.primaryDonorId = null;
      }
      if (household?.preferredStatementRecipientId === fresh.donorId) {
        cleanup.preferredStatementRecipientId = null;
      }
      if (household && Object.keys(cleanup).length) {
        await tx.household.updateMany({
          where: {
            id: household.id,
            organizationId: access.organization.id,
          },
          data: {
            ...cleanup,
            updatedAt: nextHouseholdVersion(household.updatedAt),
          },
        });
      }

      await createAuditEvent(
        {
          organizationId: access.organization.id,
          actorUserAccountId: access.actor.id,
          action: "GIVING_HOUSEHOLD_MEMBER_ENDED",
          entityType: "HouseholdMembership",
          entityId: fresh.id,
          changes: [
            { field: "endDate", oldValue: null, newValue: formatDateOnly(date) },
            ...(Object.keys(cleanup).length
              ? [{ field: "recipientReview", oldValue: null, newValue: "needed" }]
              : []),
          ],
        },
        tx,
      );

      return {
        membershipId: fresh.id,
        donorId: fresh.donorId,
        householdIds: [fresh.householdId],
      };
    });
  } catch (error) {
    if (error instanceof GivingHouseholdError) throw error;
    throw error;
  }
}

export async function searchUnassignedGivingDonors(
  organizationId: string,
  query: string,
  requestedPage: number,
) {
  const access = await requireGivingHouseholdAccess(false, organizationId);
  return listUnassignedGivingDonorsForOrganization({
    organizationId: access.organization.id,
    query,
    page: requestedPage,
  });
}

export async function searchGivingHouseholdMoveTargets(
  organizationId: string,
  excludeHouseholdId: string,
  query: string,
  requestedPage: number,
) {
  const access = await requireGivingHouseholdAccess(false, organizationId);
  const householdId = requireUuid(excludeHouseholdId, "Giving household");
  return listGivingHouseholdMoveTargetsForOrganization({
    organizationId: access.organization.id,
    excludeHouseholdId: householdId,
    query,
    page: requestedPage,
  });
}
