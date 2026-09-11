import { NextResponse } from "next/server";

import { getStripeTestSecret } from "@/lib/stripe/test-mode";
import { stripeDonationSchema } from "@/lib/validation/stripe-donation";

function returnToGive(request: Request, key: string, message: string) {
  const url = new URL("/give", request.url);
  url.searchParams.set(key, message);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== requestUrl.origin) {
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

  const donorName = `${parsed.data.firstName} ${parsed.data.lastName}`;
  const parameters = new URLSearchParams({
    mode: "payment",
    customer_email: parsed.data.email,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(parsed.data.amount),
    "line_items[0][price_data][product_data][name]": parsed.data.fund,
    "line_items[0][price_data][product_data][description]":
      "Test gift to First UPC of Saco",
    "metadata[fund]": parsed.data.fund,
    "metadata[donor_name]": donorName,
    "metadata[environment]": "BITS_TEST",
    success_url: `${requestUrl.origin}/give/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${requestUrl.origin}/give?cancelled=1`,
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
    return returnToGive(
      request,
      "error",
      stripeResult.error?.message ?? "Stripe could not start test checkout.",
    );
  }

  return NextResponse.redirect(stripeResult.url, 303);
}
