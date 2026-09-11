-- CreateEnum
CREATE TYPE "StripeWebhookEventStatus" AS ENUM (
  'RECEIVED',
  'PROCESSING',
  'PROCESSED',
  'IGNORED',
  'FAILED'
);

-- CreateTable
CREATE TABLE "stripe_webhook_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "stripeObjectId" TEXT,
    "livemode" BOOLEAN NOT NULL,
    "status" "StripeWebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stripe_webhook_events_stripeEventId_key"
  ON "stripe_webhook_events"("stripeEventId");

CREATE INDEX "stripe_webhook_events_organizationId_idx"
  ON "stripe_webhook_events"("organizationId");

CREATE INDEX "stripe_webhook_events_organizationId_status_idx"
  ON "stripe_webhook_events"("organizationId", "status");

CREATE INDEX "stripe_webhook_events_organizationId_eventType_idx"
  ON "stripe_webhook_events"("organizationId", "eventType");

CREATE INDEX "stripe_webhook_events_organizationId_createdAt_idx"
  ON "stripe_webhook_events"("organizationId", "createdAt");

ALTER TABLE "stripe_webhook_events"
  ADD CONSTRAINT "stripe_webhook_events_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
