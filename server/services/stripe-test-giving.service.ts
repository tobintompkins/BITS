import type { Prisma } from "@/app/generated/prisma/client";

import { prisma } from "@/lib/db/prisma";
import { getStripeTestSecret } from "@/lib/stripe/test-mode";
import {
  isAllowedRecordedStripeDonationFund,
  isAllowedStripeDonationAmountCents,
} from "@/lib/validation/stripe-donation";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export const STRIPE_TEST_CHECKOUT_SESSION_ID =
  /^cs_test_[A-Za-z0-9_]+$/;

export type StripeCheckoutSessionInput = {
  id: string;
  livemode?: boolean;
  created: number;
  amount_total: number | null;
  currency: string | null;
  payment_status: string;
  payment_intent?: string | { id?: string } | null;
  customer_details?: {
    email?: string | null;
    name?: string | null;
  } | null;
  metadata?: Record<string, string> | null;
};

export type StripeTestCheckoutValidationError =
  | "INVALID_SESSION_ID"
  | "LIVE_MODE_REJECTED"
  | "UNPAID_SESSION"
  | "MISSING_TEST_ENVIRONMENT"
  | "INVALID_AMOUNT"
  | "INVALID_CURRENCY"
  | "INVALID_FUND";

export type NormalizedStripeTestCheckout = {
  id: string;
  created: number;
  amountTotalCents: number;
  currency: "usd";
  paymentStatus: "paid";
  paymentIntentId: string | null;
  email: string | null;
  donorName: string | null;
  fund: string;
  metadata: Record<string, string>;
};

type DonationWriter = Prisma.TransactionClient | typeof prisma;

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002",
  );
}

function paymentIntentId(
  value: StripeCheckoutSessionInput["payment_intent"],
) {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object" && typeof value.id === "string") {
    return value.id;
  }
  return null;
}

export function validateStripeTestCheckoutSession(
  session: StripeCheckoutSessionInput,
  options?: { eventLivemode?: boolean },
):
  | { ok: true; checkout: NormalizedStripeTestCheckout }
  | { ok: false; errorCode: StripeTestCheckoutValidationError } {
  if (!STRIPE_TEST_CHECKOUT_SESSION_ID.test(session.id)) {
    return { ok: false, errorCode: "INVALID_SESSION_ID" };
  }
  if (session.livemode === true || options?.eventLivemode === true) {
    return { ok: false, errorCode: "LIVE_MODE_REJECTED" };
  }
  if (session.payment_status !== "paid") {
    return { ok: false, errorCode: "UNPAID_SESSION" };
  }
  if (session.metadata?.environment !== "BITS_TEST") {
    return { ok: false, errorCode: "MISSING_TEST_ENVIRONMENT" };
  }
  if (
    typeof session.amount_total !== "number" ||
    !isAllowedStripeDonationAmountCents(session.amount_total)
  ) {
    return { ok: false, errorCode: "INVALID_AMOUNT" };
  }
  if ((session.currency ?? "").toLowerCase() !== "usd") {
    return { ok: false, errorCode: "INVALID_CURRENCY" };
  }
  const fund = session.metadata.fund?.trim() ?? "";
  if (!isAllowedRecordedStripeDonationFund(fund)) {
    return { ok: false, errorCode: "INVALID_FUND" };
  }

  return {
    ok: true,
    checkout: {
      id: session.id,
      created: session.created,
      amountTotalCents: session.amount_total,
      currency: "usd",
      paymentStatus: "paid",
      paymentIntentId: paymentIntentId(session.payment_intent),
      email: session.customer_details?.email?.trim().toLowerCase() ?? null,
      donorName: session.metadata?.donor_name?.trim() || null,
      fund,
      metadata: session.metadata,
    },
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fundCode(fund: string) {
  return `STRIPE_${fund.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`.slice(0, 64);
}

export function readMemberCheckoutAttribution(
  metadata: Record<string, string> | null | undefined,
) {
  const source = metadata?.bits_source?.trim() ?? "";
  const donorId = metadata?.bits_donor_id?.trim() ?? "";
  const organizationId = metadata?.bits_organization_id?.trim() ?? "";
  if (source !== "member" && !donorId && !organizationId) {
    return null;
  }
  return {
    donorId,
    organizationId,
    valid:
      source === "member" &&
      UUID_PATTERN.test(donorId) &&
      UUID_PATTERN.test(organizationId),
  };
}

async function resolveDonationDonor(
  checkout: NormalizedStripeTestCheckout,
  organizationId: string,
  db: DonationWriter,
) {
  const attribution = readMemberCheckoutAttribution(checkout.metadata);
  if (attribution) {
    if (!attribution.valid || attribution.organizationId !== organizationId) {
      return null;
    }
    const donor = await db.donor.findFirst({
      where: {
        id: attribution.donorId,
        organizationId,
        active: true,
      },
      select: { id: true },
    });
    return donor?.id ?? null;
  }

  if (!checkout.email) return null;
  const donor = await db.donor.findFirst({
    where: {
      organizationId,
      email: { equals: checkout.email, mode: "insensitive" },
      active: true,
    },
    select: { id: true },
  });
  return donor?.id ?? null;
}

export async function persistStripeTestDonation(
  checkout: NormalizedStripeTestCheckout,
  organizationId: string,
  db: DonationWriter = prisma,
) {
  const existing = await db.donation.findUnique({
    where: { stripeCheckoutSessionId: checkout.id },
    include: {
      allocations: { include: { offeringType: true } },
    },
  });
  if (existing) {
    return { donation: existing, alreadyRecorded: true };
  }

  const donorId = await resolveDonationDonor(checkout, organizationId, db);

  const amount = (checkout.amountTotalCents / 100).toFixed(2);
  const offeringDate = new Date(checkout.created * 1000);

  try {
    const offeringType = await db.offeringType.upsert({
      where: {
        organizationId_code: {
          organizationId,
          code: fundCode(checkout.fund),
        },
      },
      update: { name: checkout.fund, onlineGivingEnabled: true, active: true },
      create: {
        organizationId,
        name: checkout.fund,
        code: fundCode(checkout.fund),
        onlineGivingEnabled: true,
        defaultTaxDeductible: true,
      },
    });
    const donation = await db.donation.create({
      data: {
        organizationId,
        donorId: donorId,
        offeringDate,
        receivedDate: offeringDate,
        paymentMethod: "CARD",
        totalAmount: amount,
        deductibleAmount: amount,
        anonymous: false,
        isTaxDeductible: true,
        stripeCheckoutSessionId: checkout.id,
        stripePaymentIntentId: checkout.paymentIntentId,
        isTest: true,
        note: [
          "Stripe sandbox test gift",
          checkout.donorName,
          checkout.email,
        ]
          .filter(Boolean)
          .join(" · "),
        allocations: {
          create: {
            organizationId,
            offeringTypeId: offeringType.id,
            amount,
          },
        },
      },
      include: {
        allocations: { include: { offeringType: true } },
      },
    });
    return { donation, alreadyRecorded: false };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const raced = await db.donation.findUnique({
      where: { stripeCheckoutSessionId: checkout.id },
      include: {
        allocations: { include: { offeringType: true } },
      },
    });
    if (!raced) throw error;
    return { donation: raced, alreadyRecorded: true };
  }
}

export async function recordStripeTestCheckout(sessionId: string) {
  if (!STRIPE_TEST_CHECKOUT_SESSION_ID.test(sessionId)) {
    throw new Error("Invalid Stripe test checkout reference.");
  }
  const secret = getStripeTestSecret();
  if (!secret) throw new Error("Stripe test mode is not configured.");

  const response = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    },
  );
  const session = (await response.json()) as StripeCheckoutSessionInput & {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error("Unable to verify Stripe checkout.");
  }

  const validated = validateStripeTestCheckoutSession(session);
  if (!validated.ok) {
    throw new Error("This Stripe test checkout is not confirmed as paid.");
  }

  const organization = await findPrimaryOrganization();
  if (!organization) throw new Error("Church organization not found.");

  const recorded = await persistStripeTestDonation(
    validated.checkout,
    organization.id,
  );

  return {
    donation: recorded.donation,
    session: {
      ...session,
      id: validated.checkout.id,
      amount_total: validated.checkout.amountTotalCents,
      metadata: validated.checkout.metadata,
    },
    alreadyRecorded: recorded.alreadyRecorded,
  };
}
