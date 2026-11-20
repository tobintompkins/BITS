import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

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
} from "@/lib/validation/member-stripe-giving";
import { stripeDonationSchema } from "@/lib/validation/stripe-donation";
import { findPublicOrganization } from "@/server/repositories/public-organization.repository";
import { isStripeFundBlockedForNewCheckout } from "@/server/services/stripe-test-giving.service";

function returnToGive(request: Request, key: string, message: string) {
  const url = new URL("/give", checkoutAppOrigin(request));
  url.searchParams.set(key, message);
  return NextResponse.redirect(url, 303);
}

function contactFrom(data: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  mailingAddressLine1: string | null;
  mailingAddressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}) {
  return {
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    phone: data.phone,
    mailingAddressLine1: data.mailingAddressLine1,
    mailingAddressLine2: data.mailingAddressLine2,
    city: data.city,
    state: data.state,
    postalCode: data.postalCode,
    country: data.country,
  };
}

export async function POST(request: Request) {
  if (!isAllowedCheckoutRequestOrigin(request)) {
    return new NextResponse("Invalid request origin.", { status: 403 });
  }

  const secret = getStripeTestSecret();
  if (!secret) {
    return returnToGive(
      request,
      "setup",
      "Stripe sandbox checkout is not configured yet.",
    );
  }

  const formData = await request.formData();
  const parsed = stripeDonationSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    mailingAddressLine1: formData.get("mailingAddressLine1"),
    mailingAddressLine2: formData.get("mailingAddressLine2"),
    city: formData.get("city"),
    state: formData.get("state"),
    postalCode: formData.get("postalCode"),
    country: formData.get("country"),
    fund: formData.get("fund"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) {
    return returnToGive(
      request,
      "error",
      parsed.error.issues[0]?.message ?? "Check the giving form and try again.",
    );
  }

  const organization = await findPublicOrganization();
  if (!organization) {
    return returnToGive(
      request,
      "setup",
      "Online giving is not configured for a church yet.",
    );
  }
  if (await isStripeFundBlockedForNewCheckout(organization.id, parsed.data.fund)) {
    return returnToGive(
      request,
      "error",
      "That giving fund is not available for online gifts.",
    );
  }

  const attribution = await prisma.checkoutAttribution.create({
    data: {
      organizationId: organization.id,
      kind: "UNVERIFIED_GUEST",
      emailHash: hashCheckoutBinding(`${organization.id}\n${parsed.data.email}`),
      contact: contactFrom(parsed.data),
      amountCents: parsed.data.amount,
      fund: parsed.data.fund,
      tokenHash: hashCheckoutBinding(randomUUID()),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
    select: { id: true },
  });

  const parameters = buildStripeTestCheckoutBody({
    amountCents: parsed.data.amount,
    fund: parsed.data.fund,
    receiptEmail: parsed.data.email,
    attributionId: attribution.id,
    description: "Test gift to First UPC of Saco",
    successUrl: `${checkoutAppOrigin(request)}/give/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${checkoutAppOrigin(request)}/give?cancelled=1`,
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
    id?: string;
    url?: string;
    error?: { message?: string };
  };
  if (
    !stripeResponse.ok ||
    !stripeResult.url ||
    !isStripeHostedCheckoutUrl(stripeResult.url)
  ) {
    return returnToGive(
      request,
      "error",
      "Stripe could not start test checkout.",
    );
  }
  if (stripeResult.id) {
    await prisma.checkoutAttribution.update({
      where: { id: attribution.id },
      data: { stripeCheckoutSessionId: stripeResult.id },
    });
  }
  return NextResponse.redirect(stripeResult.url, 303);
}
