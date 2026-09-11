import type { Prisma } from "@/app/generated/prisma/client";

import { prisma } from "@/lib/db/prisma";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  requireUnmatchedGiftMatchAccess,
  requireUnmatchedGiftViewAccess,
} from "@/lib/auth/giving-permissions";
import {
  maskEmail,
  maskPhone,
  parseStripeGiftAttribution,
  shortenStripeCheckoutSessionId,
} from "@/lib/privacy/contact-mask";
import {
  matchUnmatchedOnlineGiftSchema,
  unmatchedGiftDonorSearchSchema,
  type unmatchedGiftQueueQuerySchema,
} from "@/lib/validation/unmatched-online-gift";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export class UnmatchedGiftError extends Error {
  constructor(
    public readonly code:
      | "SIGNED_OUT"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "ALREADY_MATCHED"
      | "INACTIVE_DONOR"
      | "NOT_CONFIRMED"
      | "INVALID_REQUEST",
    message: string,
  ) {
    super(message);
    this.name = "UnmatchedGiftError";
  }
}

export const MATCH_ONLINE_GIFT_TO_DONOR = "MATCH_ONLINE_GIFT_TO_DONOR";

type QueueQuery = ReturnType<
  typeof unmatchedGiftQueueQuerySchema.parse
>;

function isEmailQuery(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function getUnmatchedOnlineGiftQueue(query: QueueQuery) {
  const organization = await findPrimaryOrganization();
  if (!organization) throw new UnmatchedGiftError("NOT_FOUND", "Not found.");
  let access;
  try {
    access = await requireUnmatchedGiftViewAccess(organization.id);
  } catch {
    throw new UnmatchedGiftError(
      "FORBIDDEN",
      "You do not have permission to review unmatched gifts.",
    );
  }

  const where: Prisma.DonationWhereInput = {
    organizationId: organization.id,
    stripeCheckoutSessionId: { not: null },
    donorId: null,
  };

  if (query.environment === "test") where.isTest = true;
  if (query.environment === "live") where.isTest = false;
  if (query.date) {
    where.offeringDate = new Date(`${query.date}T00:00:00`);
  }
  if (query.amount) {
    where.totalAmount = query.amount;
  }

  const andFilters: Prisma.DonationWhereInput[] = [];
  if (query.fund) {
    andFilters.push({
      allocations: {
        some: {
          offeringType: {
            name: { contains: query.fund, mode: "insensitive" },
          },
        },
      },
    });
  }
  if (query.email) {
    andFilters.push({
      note: { contains: query.email, mode: "insensitive" },
    });
  }
  if (query.name) {
    andFilters.push({
      note: { contains: query.name, mode: "insensitive" },
    });
  }
  if (query.q) {
    andFilters.push({
      OR: [
        { note: { contains: query.q, mode: "insensitive" } },
        {
          allocations: {
            some: {
              offeringType: {
                name: { contains: query.q, mode: "insensitive" },
              },
            },
          },
        },
      ],
    });
  }
  if (andFilters.length) where.AND = andFilters;

  const skip = (query.page - 1) * query.pageSize;
  const [total, rows] = await Promise.all([
    prisma.donation.count({ where }),
    prisma.donation.findMany({
      where,
      orderBy: [
        query.sort === "totalAmount"
          ? { totalAmount: query.order }
          : { offeringDate: query.order },
        { id: "desc" },
      ],
      skip,
      take: query.pageSize,
      select: {
        id: true,
        offeringDate: true,
        totalAmount: true,
        isTest: true,
        stripeCheckoutSessionId: true,
        note: true,
        allocations: {
          select: { offeringType: { select: { name: true } } },
        },
      },
    }),
  ]);

  return {
    organizationName: organization.displayName ?? organization.name,
    canMatch: access.canManageStatements,
    page: query.page,
    pageSize: query.pageSize,
    total,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    gifts: rows.map((gift) => {
      const attribution = parseStripeGiftAttribution(gift.note);
      return {
        id: gift.id,
        offeringDate: gift.offeringDate,
        totalAmount: gift.totalAmount.toString(),
        fund:
          gift.allocations.map((row) => row.offeringType.name).join(", ") ||
          "General Giving",
        isTest: gift.isTest,
        environmentLabel: gift.isTest ? "STRIPE TEST" : "LIVE",
        stripeSessionRef: shortenStripeCheckoutSessionId(
          gift.stripeCheckoutSessionId ?? "",
        ),
        suppliedDonorName: attribution.donorName,
        suppliedDonorEmail: attribution.donorEmail,
        matchStatus: "Needs review" as const,
      };
    }),
  };
}

export async function searchDonorsForOnlineGiftMatch(rawQuery: string) {
  const organization = await findPrimaryOrganization();
  if (!organization) throw new UnmatchedGiftError("NOT_FOUND", "Not found.");
  try {
    await requireUnmatchedGiftViewAccess(organization.id);
  } catch {
    throw new UnmatchedGiftError(
      "FORBIDDEN",
      "You do not have permission to review unmatched gifts.",
    );
  }

  const parsed = unmatchedGiftDonorSearchSchema.safeParse({ q: rawQuery });
  if (!parsed.success) {
    throw new UnmatchedGiftError("INVALID_REQUEST", "Enter a donor search.");
  }
  const q = parsed.data.q;
  const normalized = q.toLowerCase();
  const parts = q.split(/\s+/).filter(Boolean);

  const nameFilters: Prisma.DonorWhereInput[] = [
    { firstName: { contains: q, mode: "insensitive" } },
    { lastName: { contains: q, mode: "insensitive" } },
    { email: { contains: q, mode: "insensitive" } },
  ];
  if (parts.length >= 2) {
    nameFilters.push({
      AND: [
        { firstName: { contains: parts[0], mode: "insensitive" } },
        { lastName: { contains: parts.slice(1).join(" "), mode: "insensitive" } },
      ],
    });
  }

  const donors = await prisma.donor.findMany({
    where: {
      organizationId: organization.id,
      active: true,
      OR: nameFilters,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 20,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      householdMemberships: {
        where: {
          endDate: null,
          organizationId: organization.id,
          household: { organizationId: organization.id, active: true },
        },
        select: { household: { select: { displayName: true } } },
        take: 1,
      },
    },
  });

  return donors.map((donor) => {
    const exactEmail =
      Boolean(donor.email) &&
      isEmailQuery(normalized) &&
      donor.email?.trim().toLowerCase() === normalized;
    return {
      id: donor.id,
      name: `${donor.firstName} ${donor.lastName}`,
      maskedEmail: maskEmail(donor.email),
      maskedPhone: maskPhone(donor.phone),
      householdName: donor.householdMemberships[0]?.household.displayName ?? null,
      recommended: exactEmail,
    };
  }).sort((a, b) => Number(b.recommended) - Number(a.recommended));
}

export async function matchUnmatchedOnlineGift(input: {
  donationId: string;
  donorId: string;
  confirmed: boolean;
}) {
  const parsed = matchUnmatchedOnlineGiftSchema.safeParse(input);
  if (!parsed.success) {
    throw new UnmatchedGiftError(
      input.confirmed === true ? "INVALID_REQUEST" : "NOT_CONFIRMED",
      input.confirmed === true
        ? "This gift cannot be matched."
        : "Confirm the match before saving.",
    );
  }

  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) {
    throw new UnmatchedGiftError("SIGNED_OUT", "You must be signed in.");
  }

  const organization = await findPrimaryOrganization();
  if (!organization) throw new UnmatchedGiftError("NOT_FOUND", "Not found.");
  try {
    await requireUnmatchedGiftMatchAccess(organization.id);
  } catch {
    throw new UnmatchedGiftError(
      "FORBIDDEN",
      "You do not have permission to match online gifts.",
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const donation = await tx.donation.findFirst({
        where: {
          id: parsed.data.donationId,
          organizationId: organization.id,
          stripeCheckoutSessionId: { not: null },
        },
        select: {
          id: true,
          donorId: true,
          isTest: true,
          organizationId: true,
        },
      });
      const donor = await tx.donor.findFirst({
        where: {
          id: parsed.data.donorId,
          organizationId: organization.id,
        },
        select: { id: true, active: true, organizationId: true },
      });

      if (!donation || !donor) {
        throw new UnmatchedGiftError("NOT_FOUND", "This gift cannot be matched.");
      }
      if (!donor.active) {
        throw new UnmatchedGiftError(
          "INACTIVE_DONOR",
          "The selected donor is not active.",
        );
      }
      if (donation.donorId) {
        throw new UnmatchedGiftError(
          "ALREADY_MATCHED",
          "Another staff member already matched this gift.",
        );
      }

      const updated = await tx.donation.updateMany({
        where: {
          id: donation.id,
          organizationId: organization.id,
          donorId: null,
          stripeCheckoutSessionId: { not: null },
        },
        data: { donorId: donor.id },
      });
      if (updated.count !== 1) {
        throw new UnmatchedGiftError(
          "ALREADY_MATCHED",
          "Another staff member already matched this gift.",
        );
      }

      await createAuditEvent(
        {
          organizationId: organization.id,
          actorUserAccountId: userAccount.id,
          action: MATCH_ONLINE_GIFT_TO_DONOR,
          entityType: "Donation",
          entityId: donation.id,
          changes: [
            { field: "donorId", oldValue: null, newValue: donor.id },
            {
              field: "isTestGift",
              oldValue: donation.isTest ? "true" : "false",
              newValue: donation.isTest ? "true" : "false",
            },
          ],
        },
        tx,
      );

      return { donationId: donation.id, donorId: donor.id };
    });
  } catch (error) {
    if (error instanceof UnmatchedGiftError) throw error;
    throw new UnmatchedGiftError("INVALID_REQUEST", "This gift cannot be matched.");
  }
}
