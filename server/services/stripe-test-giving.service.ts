import { findPublicOrganization } from "@/server/repositories/public-organization.repository";
import type { Prisma } from "@/app/generated/prisma/client";

import { prisma } from "@/lib/db/prisma";
import { getStripeTestSecret } from "@/lib/stripe/test-mode";
import {
  isAllowedRecordedStripeDonationFund,
  isAllowedStripeDonationAmountCents,
  recordedStripeFundCode,
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
  return recordedStripeFundCode(fund);
}

export async function findRecordedStripeOfferingType(
  organizationId: string,
  fund: string,
  db: DonationWriter = prisma,
) {
  return db.offeringType.findFirst({
    where: { organizationId, code: fundCode(fund) },
    select: {
      id: true,
      name: true,
      code: true,
      active: true,
      onlineGivingEnabled: true,
    },
  });
}

export async function isStripeFundBlockedForNewCheckout(
  organizationId: string,
  fund: string,
) {
  const existing = await findRecordedStripeOfferingType(organizationId, fund);
  if (!existing) return false;
  return !existing.active || !existing.onlineGivingEnabled;
}

export async function advertisedStripeFunds<T extends string>(
  organizationId: string,
  candidates: readonly T[],
) {
  const blocked = await Promise.all(
    candidates.map(async (fund) => [
      fund,
      await isStripeFundBlockedForNewCheckout(organizationId, fund),
    ] as const),
  );
  return blocked.filter(([, isBlocked]) => !isBlocked).map(([fund]) => fund);
}

type StoredContact = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string | null;
  mailingAddressLine1?: string | null;
  mailingAddressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
};

export class StripeCheckoutOwnershipError extends Error {
  readonly code = "CHECKOUT_ORGANIZATION_MISMATCH";

  constructor() {
    super("This Stripe test checkout belongs to another church.");
    this.name = "StripeCheckoutOwnershipError";
  }
}

function readAttributionId(metadata: Record<string, string>) {
  const value = metadata.bits_attribution_id?.trim() ?? "";
  return UUID_PATTERN.test(value) ? value : null;
}

function contactEmail(contact: StoredContact | null) {
  const email = contact?.email?.trim().toLowerCase() ?? "";
  return email.includes("@") ? email : null;
}

async function createGuestDonor(
  db: DonationWriter,
  organizationId: string,
  contact: StoredContact,
) {
  const created = await db.donor.create({
    data: {
      organizationId,
      userAccountId: null,
      firstName: contact.firstName?.trim() || "Guest",
      lastName: contact.lastName?.trim() || "Donor",
      email: contactEmail(contact),
      phone: contact.phone ?? null,
      mailingAddressLine1: contact.mailingAddressLine1 ?? null,
      mailingAddressLine2: contact.mailingAddressLine2 ?? null,
      city: contact.city ?? null,
      state: contact.state ?? null,
      postalCode: contact.postalCode ?? null,
      country: contact.country ?? null,
      active: true,
    },
    select: { id: true },
  });
  return created.id;
}

async function resolveDonationDonor(
  checkout: NormalizedStripeTestCheckout,
  organizationId: string,
  db: DonationWriter,
) {
  const attributionId = readAttributionId(checkout.metadata);
  if (!attributionId || !("checkoutAttribution" in db)) return null;
  const attribution = await db.checkoutAttribution.findFirst({
    where: { id: attributionId, organizationId },
  });
  if (!attribution) return null;
  if (
    attribution.consumedAt &&
    attribution.stripeCheckoutSessionId &&
    attribution.stripeCheckoutSessionId !== checkout.id
  ) {
    return null;
  }

  const contact = attribution.contact as StoredContact;
  let donorId: string | null = null;
  if (attribution.kind === "MEMBER") {
    if (attribution.donorId) {
      const donor = await db.donor.findFirst({
        where: {
          id: attribution.donorId,
          organizationId,
          active: true,
          userAccountId: { not: null },
        },
        select: { id: true },
      });
      donorId = donor?.id ?? null;
    }
  } else if (attribution.kind === "UNVERIFIED_GUEST") {
    donorId =
      attribution.donorId ??
      (await createGuestDonor(db, organizationId, contact));
  } else {
    return null;
  }

  if (!attribution.consumedAt) {
    await db.checkoutAttribution.update({
      where: { id: attribution.id },
      data: {
        donorId,
        consumedAt: new Date(),
        stripeCheckoutSessionId: checkout.id,
      },
    });
  }
  return donorId;
}

async function assertCheckoutAttributionForOrganization(
  checkout: NormalizedStripeTestCheckout,
  organizationId: string,
  db: DonationWriter,
) {
  const attributionId = readAttributionId(checkout.metadata);
  if (!attributionId) return;
  const attribution = await db.checkoutAttribution.findFirst({
    where: { id: attributionId, organizationId },
  });
  if (
    !attribution ||
    attribution.amountCents !== checkout.amountTotalCents ||
    attribution.fund !== checkout.fund
  ) {
    throw new StripeCheckoutOwnershipError();
  }
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
    const recordedOrganizationId = (
      existing as { organizationId: string }
    ).organizationId;
    if (recordedOrganizationId !== organizationId) {
      throw new StripeCheckoutOwnershipError();
    }
    return { donation: existing, alreadyRecorded: true };
  }

  await assertCheckoutAttributionForOrganization(checkout, organizationId, db);
  const donorId = await resolveDonationDonor(checkout, organizationId, db);

  const amount = (checkout.amountTotalCents / 100).toFixed(2);
  const offeringDate = new Date(checkout.created * 1000);

  try {
    const existingType = await findRecordedStripeOfferingType(
      organizationId,
      checkout.fund,
      db,
    );
    let offeringType = existingType;
    if (!offeringType) {
      offeringType = await db.offeringType.create({
        data: {
          organizationId,
          name: checkout.fund,
          code: fundCode(checkout.fund),
          onlineGivingEnabled: true,
          defaultTaxDeductible: true,
        },
        select: {
          id: true,
          name: true,
          code: true,
          active: true,
          onlineGivingEnabled: true,
        },
      });
    }
    const reviewNote =
      existingType && (!existingType.active || !existingType.onlineGivingEnabled)
        ? "Inactive or online-disabled offering type retained for staff review."
        : null;
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
          reviewNote,
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

export async function recordStripeTestCheckout(sessionId: string, context: "public" | "portal" = "portal") {
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

  const organization = context === "public" ? await findPublicOrganization() : await findPrimaryOrganization();
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
