ALTER TABLE "donations"
ADD COLUMN "stripeCheckoutSessionId" TEXT,
ADD COLUMN "stripePaymentIntentId" TEXT,
ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "donations_stripeCheckoutSessionId_key"
ON "donations"("stripeCheckoutSessionId");

CREATE INDEX "donations_organizationId_isTest_idx"
ON "donations"("organizationId", "isTest");
