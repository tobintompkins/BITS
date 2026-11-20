-- Checkout attribution only. This migration was never applied.
-- Guest email challenges, continuity flags, and giving-origin columns
-- were removed before application. Existing donors are unchanged.

CREATE TYPE "CheckoutAttributionKind" AS ENUM ('MEMBER', 'UNVERIFIED_GUEST');

CREATE TABLE "checkout_attributions" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "kind" "CheckoutAttributionKind" NOT NULL,
  "donorId" UUID,
  "emailHash" TEXT NOT NULL,
  "contact" JSONB NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "fund" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "stripeCheckoutSessionId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "checkout_attributions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "checkout_attributions_organizationId_emailHash_idx"
  ON "checkout_attributions"("organizationId", "emailHash");
CREATE UNIQUE INDEX "checkout_attributions_tokenHash_key" ON "checkout_attributions"("tokenHash");
CREATE UNIQUE INDEX "checkout_attributions_stripeCheckoutSessionId_key"
  ON "checkout_attributions"("stripeCheckoutSessionId");

ALTER TABLE "checkout_attributions"
  ADD CONSTRAINT "checkout_attributions_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
