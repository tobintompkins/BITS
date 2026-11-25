import { randomUUID } from "node:crypto";

import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import {
  buildStripeTestCheckoutBody,
  hashCheckoutBinding,
  isStripeHostedCheckoutUrl,
} from "@/lib/stripe/test-checkout-session";
import { getStripeTestSecret } from "@/lib/stripe/test-mode";
import {
  checkoutAppOrigin,
  isAllowedCheckoutRequestOrigin,
  memberStripeGivingSchema,
} from "@/lib/validation/member-stripe-giving";
import { memberStripeDonationFundOptions } from "@/lib/validation/stripe-donation";
import { findMemberPortalOrganization } from "@/server/repositories/organization.repository";
import {
  advertisedStripeFunds,
  isStripeFundBlockedForNewCheckout,
} from "@/server/services/stripe-test-giving.service";

export type MemberStripeGivingAccessResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "CONNECTION_PENDING"; accountEmail: string };

export type MemberStripeGivingView =
  | MemberStripeGivingAccessResult
  | {
      status: "READY";
      donor: {
        firstName: string;
        lastName: string;
        email: string | null;
      };
      funds: readonly string[];
    };

export type MemberStripeCheckoutResult =
  | MemberStripeGivingAccessResult
  | { status: "ORIGIN_REJECTED" }
  | { status: "NOT_CONFIGURED" }
  | { status: "INVALID" }
  | { status: "FUND_UNAVAILABLE" }
  | { status: "STRIPE_ERROR"; message: string }
  | {
      status: "READY";
      checkoutUrl: string;
      metadata: Record<string, string>;
    };

const donorSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

async function findLinkedDonor(
  organization: { id: string },
  account: { id: string },
) {
  return prisma.donor.findFirst({
    where: {
      organizationId: organization.id,
      userAccountId: account.id,
      active: true,
    },
    select: donorSelect,
  });
}

async function resolveLinkedDonorAccess() {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findMemberPortalOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" as const };

  return {
    status: "LINKED" as const,
    userAccount,
    organization,
  };
}

/**
 * Page context for private member Stripe giving.
 * Account, organization, and donor are resolved server-side only.
 */
export async function getMemberStripeGiving(): Promise<MemberStripeGivingView> {
  const access = await resolveLinkedDonorAccess();
  if (access.status !== "LINKED") return access;

  const donor = await findLinkedDonor(access.organization, access.userAccount);
  if (!donor) {
    return {
      status: "CONNECTION_PENDING",
      accountEmail: access.userAccount.primaryEmail,
    };
  }

  return {
    status: "READY",
    donor: {
      firstName: donor.firstName,
      lastName: donor.lastName,
      email: donor.email ?? access.userAccount.primaryEmail,
    },
    funds: await advertisedStripeFunds(
      access.organization.id,
      memberStripeDonationFundOptions,
    ),
  };
}

export async function createMemberStripeCheckout(
  input: unknown,
  request: Request,
): Promise<MemberStripeCheckoutResult> {
  if (!isAllowedCheckoutRequestOrigin(request)) {
    return { status: "ORIGIN_REJECTED" };
  }

  const parsed = memberStripeGivingSchema.safeParse(input);
  if (!parsed.success) return { status: "INVALID" };

  const access = await resolveLinkedDonorAccess();
  if (access.status !== "LINKED") return access;

  const donor = await findLinkedDonor(access.organization, access.userAccount);
  if (!donor) {
    return {
      status: "CONNECTION_PENDING",
      accountEmail: access.userAccount.primaryEmail,
    };
  }

  const secret = getStripeTestSecret();
  if (!secret) return { status: "NOT_CONFIGURED" };

  if (
    await isStripeFundBlockedForNewCheckout(
      access.organization.id,
      parsed.data.fund,
    )
  ) {
    return { status: "FUND_UNAVAILABLE" };
  }

  const appOrigin = checkoutAppOrigin(request);
  const receiptEmail = donor.email ?? access.userAccount.primaryEmail;
  const attribution = await prisma.checkoutAttribution.create({
    data: {
      organizationId: access.organization.id,
      kind: "MEMBER",
      donorId: donor.id,
      emailHash: hashCheckoutBinding(`${access.organization.id}\n${receiptEmail ?? ""}`),
      contact: {
        firstName: donor.firstName,
        lastName: donor.lastName,
        email: receiptEmail,
      },
      amountCents: parsed.data.amount,
      fund: parsed.data.fund,
      tokenHash: hashCheckoutBinding(randomUUID()),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
    select: { id: true },
  });
  const metadata = {
    environment: "BITS_TEST",
    fund: parsed.data.fund,
    bits_attribution_id: attribution.id,
  };
  const parameters = buildStripeTestCheckoutBody({
    amountCents: parsed.data.amount,
    fund: parsed.data.fund,
    receiptEmail: receiptEmail ?? "",
    attributionId: attribution.id,
    description: "Member test gift through BITS",
    successUrl: `${appOrigin}/portal/give/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appOrigin}/portal/give?cancelled=1`,
  });

  const stripeResponse = await fetch(
    "https://api.stripe.com/v1/checkout/sessions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: parameters,
      cache: "no-store",
    },
  );
  const stripeResult = (await stripeResponse.json()) as {
    url?: string;
    error?: { message?: string };
  };
  if (
    !stripeResponse.ok ||
    !stripeResult.url ||
    !isStripeHostedCheckoutUrl(stripeResult.url)
  ) {
    return {
      status: "STRIPE_ERROR",
      message: "Stripe could not start test checkout.",
    };
  }

  return {
    status: "READY",
    checkoutUrl: stripeResult.url,
    metadata,
  };
}
