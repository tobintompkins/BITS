-- Staff-only purchase request and approval records. Does not place orders or move money.
CREATE TYPE "PurchaseRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'CANCELLED');

CREATE TABLE "purchase_requests" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "estimatedAmountCents" INTEGER,
    "requestedForLocation" TEXT,
    "equipmentItemId" UUID,
    "status" "PurchaseRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedByUserAccountId" UUID NOT NULL,
    "reviewedByUserAccountId" UUID,
    "decisionNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "purchase_requests_organizationId_status_idx"
  ON "purchase_requests"("organizationId", "status");

CREATE INDEX "purchase_requests_organizationId_createdAt_idx"
  ON "purchase_requests"("organizationId", "createdAt");

CREATE INDEX "purchase_requests_equipmentItemId_idx"
  ON "purchase_requests"("equipmentItemId");

ALTER TABLE "purchase_requests"
  ADD CONSTRAINT "purchase_requests_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "purchase_requests"
  ADD CONSTRAINT "purchase_requests_equipmentItemId_fkey"
  FOREIGN KEY ("equipmentItemId") REFERENCES "equipment_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "purchase_requests"
  ADD CONSTRAINT "purchase_requests_requestedByUserAccountId_fkey"
  FOREIGN KEY ("requestedByUserAccountId") REFERENCES "user_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_requests"
  ADD CONSTRAINT "purchase_requests_reviewedByUserAccountId_fkey"
  FOREIGN KEY ("reviewedByUserAccountId") REFERENCES "user_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
