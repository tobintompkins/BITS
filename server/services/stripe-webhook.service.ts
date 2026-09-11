import type Stripe from "stripe";

import { prisma } from "@/lib/db/prisma";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";
import {
  persistStripeTestDonation,
  validateStripeTestCheckoutSession,
  type StripeCheckoutSessionInput,
} from "@/server/services/stripe-test-giving.service";

const SUPPORTED_EVENT_TYPE = "checkout.session.completed";

export type StripeWebhookProcessResult = {
  httpStatus: number;
  received: boolean;
  errorCode?: string;
};

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002",
  );
}

function stripeObjectId(event: Stripe.Event) {
  const object = event.data.object as { id?: unknown };
  return typeof object.id === "string" ? object.id : null;
}

async function markWebhookEvent(
  stripeEventId: string,
  status: "PROCESSED" | "IGNORED" | "FAILED",
  lastErrorCode?: string | null,
) {
  await prisma.stripeWebhookEvent.update({
    where: { stripeEventId },
    data: {
      status,
      lastErrorCode: lastErrorCode ?? null,
      processedAt: status === "FAILED" ? null : new Date(),
    },
  });
}

/**
 * Claim the Stripe event ID with the unique constraint. Concurrent inserts
 * cannot create two rows. Already PROCESSED/IGNORED deliveries are no-ops.
 * FAILED rows can be reclaimed for retry.
 */
export async function claimStripeWebhookEvent(input: {
  organizationId: string;
  stripeEventId: string;
  eventType: string;
  stripeObjectId: string | null;
  livemode: boolean;
}) {
  try {
    const created = await prisma.stripeWebhookEvent.create({
      data: {
        organizationId: input.organizationId,
        stripeEventId: input.stripeEventId,
        eventType: input.eventType,
        stripeObjectId: input.stripeObjectId,
        livemode: input.livemode,
        status: "PROCESSING",
        attemptCount: 1,
      },
    });
    return { outcome: "CLAIMED" as const, record: created };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
  }

  const existing = await prisma.stripeWebhookEvent.findUnique({
    where: { stripeEventId: input.stripeEventId },
  });
  if (!existing) {
    throw new Error("WEBHOOK_CLAIM_MISSING");
  }
  if (existing.status === "PROCESSED" || existing.status === "IGNORED") {
    return { outcome: "ALREADY_DONE" as const, record: existing };
  }

  const claimed = await prisma.stripeWebhookEvent.updateMany({
    where: {
      stripeEventId: input.stripeEventId,
      status: { in: ["FAILED", "RECEIVED"] },
    },
    data: {
      status: "PROCESSING",
      attemptCount: { increment: 1 },
      lastErrorCode: null,
    },
  });
  if (claimed.count === 1) {
    const record = await prisma.stripeWebhookEvent.findUniqueOrThrow({
      where: { stripeEventId: input.stripeEventId },
    });
    return { outcome: "CLAIMED" as const, record };
  }

  await prisma.stripeWebhookEvent.update({
    where: { stripeEventId: input.stripeEventId },
    data: { attemptCount: { increment: 1 } },
  });
  const inFlight = await prisma.stripeWebhookEvent.findUniqueOrThrow({
    where: { stripeEventId: input.stripeEventId },
  });
  if (inFlight.status === "PROCESSED" || inFlight.status === "IGNORED") {
    return { outcome: "ALREADY_DONE" as const, record: inFlight };
  }
  return { outcome: "IN_FLIGHT" as const, record: inFlight };
}

export async function processVerifiedStripeWebhookEvent(
  event: Stripe.Event,
): Promise<StripeWebhookProcessResult> {
  const organization = await findPrimaryOrganization();
  if (!organization) {
    return {
      httpStatus: 500,
      received: false,
      errorCode: "ORGANIZATION_MISSING",
    };
  }

  let claim;
  try {
    claim = await claimStripeWebhookEvent({
      organizationId: organization.id,
      stripeEventId: event.id,
      eventType: event.type,
      stripeObjectId: stripeObjectId(event),
      livemode: event.livemode,
    });
  } catch {
    return {
      httpStatus: 500,
      received: false,
      errorCode: "WEBHOOK_CLAIM_FAILED",
    };
  }

  if (claim.outcome === "ALREADY_DONE") {
    return { httpStatus: 200, received: true };
  }

  try {
    if (event.type !== SUPPORTED_EVENT_TYPE) {
      await markWebhookEvent(event.id, "IGNORED", "UNSUPPORTED_EVENT");
      return { httpStatus: 200, received: true };
    }

    if (event.livemode) {
      await markWebhookEvent(event.id, "IGNORED", "LIVE_MODE_REJECTED");
      return { httpStatus: 200, received: true };
    }

    const session = event.data.object as StripeCheckoutSessionInput;
    const validated = validateStripeTestCheckoutSession(session, {
      eventLivemode: event.livemode,
    });
    if (!validated.ok) {
      await markWebhookEvent(event.id, "IGNORED", validated.errorCode);
      return { httpStatus: 200, received: true };
    }

    await prisma.$transaction(async (tx) => {
      await persistStripeTestDonation(
        validated.checkout,
        organization.id,
        tx,
      );
      await tx.stripeWebhookEvent.update({
        where: { stripeEventId: event.id },
        data: {
          status: "PROCESSED",
          processedAt: new Date(),
          lastErrorCode: null,
        },
      });
    });

    return { httpStatus: 200, received: true };
  } catch {
    try {
      await markWebhookEvent(event.id, "FAILED", "DONATION_PERSISTENCE_FAILED");
    } catch {
      // Status write failed; Stripe should retry because we return 500.
    }
    if (claim.outcome === "IN_FLIGHT") {
      return { httpStatus: 409, received: false, errorCode: "EVENT_IN_FLIGHT" };
    }
    return {
      httpStatus: 500,
      received: false,
      errorCode: "DONATION_PERSISTENCE_FAILED",
    };
  }
}
