import { NextResponse } from "next/server";

import { createMemberStripeCheckout } from "@/server/services/member-stripe-giving.service";

function returnToPortalGive(request: Request, key: string, message?: string) {
  const url = new URL("/portal/give", request.url);
  url.searchParams.set(key, message ?? "1");
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const result = await createMemberStripeCheckout(
    {
      fund: formData.get("fund"),
      amount: formData.get("amount"),
    },
    request,
  );

  if (result.status === "ORIGIN_REJECTED") {
    return new NextResponse("Invalid request origin.", { status: 403 });
  }
  if (result.status === "SIGNED_OUT") {
    return NextResponse.redirect(new URL("/sign-in", request.url), 303);
  }
  if (result.status === "NO_ORGANIZATION") {
    return returnToPortalGive(
      request,
      "error",
      "The church organization has not been configured.",
    );
  }
  if (result.status === "CONNECTION_PENDING") {
    return returnToPortalGive(request, "pending");
  }
  if (result.status === "INVALID") {
    return returnToPortalGive(
      request,
      "error",
      "Check the giving fund and amount and try again.",
    );
  }
  if (result.status === "NOT_CONFIGURED") {
    return returnToPortalGive(
      request,
      "setup",
      "Stripe sandbox checkout is not configured yet.",
    );
  }
  if (result.status === "STRIPE_ERROR") {
    return returnToPortalGive(request, "error", result.message);
  }

  return NextResponse.redirect(result.checkoutUrl, 303);
}
