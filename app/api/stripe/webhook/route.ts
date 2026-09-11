import { NextResponse } from "next/server";

import { verifyStripeWebhookSignature } from "@/lib/stripe/webhook-signature";
import { processVerifiedStripeWebhookEvent } from "@/server/services/stripe-webhook.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function invalidSignature() {
  return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
}

/**
 * POST /api/stripe/webhook
 *
 * Stripe calls this endpoint directly. Clerk auth is not required.
 * Signature verification runs on the unmodified raw body before any processing.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature") ?? "";
  const rawBody = await request.text();

  const verified = verifyStripeWebhookSignature(rawBody, signature);
  if (!verified.ok) {
    return invalidSignature();
  }

  const result = await processVerifiedStripeWebhookEvent(verified.event);
  if (result.httpStatus === 200) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  return NextResponse.json(
    { error: "Unable to process event." },
    { status: result.httpStatus },
  );
}
