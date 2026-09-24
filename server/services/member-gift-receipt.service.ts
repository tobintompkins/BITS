import { prisma } from "@/lib/db/prisma";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { parseMemberGiftId } from "@/lib/validation/member-gift-receipt";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

/**
 * Member-facing gift receipt for one owned donation.
 * Lookups always require current organization + linked donor + gift UUID.
 * Donor IDs are never taken from the URL or client.
 */
export async function getMemberGiftReceipt(giftId: string | undefined) {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" as const };

  const donor = await prisma.donor.findFirst({
    where: {
      organizationId: organization.id,
      userAccountId: userAccount.id,
      active: true,
    },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!donor) {
    return {
      status: "CONNECTION_PENDING" as const,
      accountEmail: userAccount.primaryEmail,
    };
  }

  const id = parseMemberGiftId(giftId);
  if (!id) return { status: "NOT_FOUND" as const };

  const gift = await prisma.donation.findFirst({
    where: {
      id,
      organizationId: organization.id,
      donorId: donor.id,
    },
    select: {
      offeringDate: true,
      totalAmount: true,
      deductibleAmount: true,
      isTest: true,
      allocations: {
        where: {
          organizationId: organization.id,
          offeringType: { organizationId: organization.id },
        },
        select: {
          amount: true,
          offeringType: { select: { name: true } },
        },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!gift) return { status: "NOT_FOUND" as const };

  const displayName =
    organization.displayName?.trim() || organization.name.trim();
  const footer = organization.statementFooterText?.trim() || null;

  return {
    status: "READY" as const,
    organization: {
      name: organization.name,
      displayName,
      mailingAddressLine1: organization.mailingAddressLine1,
      mailingAddressLine2: organization.mailingAddressLine2,
      city: organization.city,
      state: organization.state,
      postalCode: organization.postalCode,
      country: organization.country,
      statementFooterText: footer,
    },
    member: {
      displayName: `${donor.firstName} ${donor.lastName}`.trim(),
    },
    gift: {
      offeringDate: gift.offeringDate,
      isTest: gift.isTest,
      totalAmount: gift.totalAmount.toString(),
      deductibleAmount: gift.deductibleAmount.toString(),
      allocations: gift.allocations.map((allocation) => ({
        fund: allocation.offeringType.name,
        amount: allocation.amount.toString(),
      })),
    },
  };
}
