CREATE TYPE "FinancialCorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "FinancialCorrectionType" AS ENUM ('DONOR', 'AMOUNT', 'FUND_ALLOCATION', 'PAYMENT_METHOD', 'DEPOSIT', 'OTHER');

CREATE TABLE "financial_correction_requests" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "offeringBatchId" UUID NOT NULL,
  "type" "FinancialCorrectionType" NOT NULL,
  "status" "FinancialCorrectionStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT NOT NULL,
  "requestedChange" TEXT NOT NULL,
  "requestedByUserAccountId" UUID NOT NULL,
  "reviewedByUserAccountId" UUID,
  "reviewNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "financial_correction_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "financial_correction_requests_organizationId_status_createdAt_idx" ON "financial_correction_requests"("organizationId", "status", "createdAt");
CREATE INDEX "financial_correction_requests_offeringBatchId_createdAt_idx" ON "financial_correction_requests"("offeringBatchId", "createdAt");
CREATE INDEX "financial_correction_requests_requestedByUserAccountId_idx" ON "financial_correction_requests"("requestedByUserAccountId");
CREATE INDEX "financial_correction_requests_reviewedByUserAccountId_idx" ON "financial_correction_requests"("reviewedByUserAccountId");
ALTER TABLE "financial_correction_requests" ADD CONSTRAINT "financial_correction_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "financial_correction_requests" ADD CONSTRAINT "financial_correction_requests_offeringBatchId_fkey" FOREIGN KEY ("offeringBatchId") REFERENCES "offering_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_correction_requests" ADD CONSTRAINT "financial_correction_requests_requestedByUserAccountId_fkey" FOREIGN KEY ("requestedByUserAccountId") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_correction_requests" ADD CONSTRAINT "financial_correction_requests_reviewedByUserAccountId_fkey" FOREIGN KEY ("reviewedByUserAccountId") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
