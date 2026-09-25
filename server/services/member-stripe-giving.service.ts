import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import { getStripeTestSecret } from "@/lib/stripe/test-mode";
import {
  isAllowedCheckoutRequestOrigin,
  memberStripeGivingSchema,
} from "@/lib/validation/member-stripe-giving";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

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
    };

export type MemberStripeCheckoutResult =
  | MemberStripeGivingAccessResult
  | { status: "ORIGIN_REJECTED" }
  | { status: "NOT_CONFIGURED" }
  | { status: "INVALID" }
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

async function resolveLinkedDonorAccess() {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findPrimaryOrganization();
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

  const donor = await prisma.donor.findFirst({
    where: {
      organizationId: access.organization.id,
      userAccountId: access.userAccount.id,
      active: true,
    },
    select: donorSelect,
  });
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

  const donor = await prisma.donor.findFirst({
    where: {
      organizationId: access.organization.id,
      userAccountId: access.userAccount.id,
      active: true,
    },
    select: donorSelect,
  });
  if (!donor) {
    return {
      status: "CONNECTION_PENDING",
      accountEmail: access.userAccount.primaryEmail,
    };
  }

  const secret = getStripeTestSecret();
  if (!secret) return { status: "NOT_CONFIGURED" };

  const requestUrl = new URL(request.url);
  const metadata = {
    environment: "BITS_TEST",
    fund: parsed.data.fund,
    bits_source: "member",
    bits_organization_id: access.organization.id,
    bits_donor_id: donor.id,
  };
  const receiptEmail = donor.email ?? access.userAccount.primaryEmail;
  const parameters = new URLSearchParams({
    mode: "payment",
    ...(receiptEmail ? { customer_email: receiptEmail } : {}),
    client_reference_id: `${access.organization.id}:${donor.id}`,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(parsed.data.amount),
    "line_items[0][price_data][product_data][name]": parsed.data.fund,
    "line_items[0][price_data][product_data][description]":
      "Member test gift through BITS",
    "metadata[environment]": metadata.environment,
    "metadata[fund]": metadata.fund,
    "metadata[bits_source]": metadata.bits_source,
    "metadata[bits_organization_id]": metadata.bits_organization_id,
    "metadata[bits_donor_id]": metadata.bits_donor_id,
    success_url: `${requestUrl.origin}/portal/give/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${requestUrl.origin}/portal/give?cancelled=1`,
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
  if (!stripeResponse.ok || !stripeResult.url) {
    return {
      status: "STRIPE_ERROR",
      message:
        stripeResult.error?.message ?? "Stripe could not start test checkout.",
    };
  }

  return {
    status: "READY",
    checkoutUrl: stripeResult.url,
    metadata,
  };
}
