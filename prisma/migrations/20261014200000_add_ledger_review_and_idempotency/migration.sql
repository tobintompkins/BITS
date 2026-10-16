-- AlterTable
ALTER TABLE "offering_batches" ADD COLUMN "reviewVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ledger_create_idempotency" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "operationToken" TEXT NOT NULL,
    "actorUserAccountId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "payloadFingerprint" TEXT NOT NULL,
    "donationId" UUID,
    "resultJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_create_idempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ledger_create_idempotency_org_action_token_key"
  ON "ledger_create_idempotency"("organizationId", "action", "operationToken");

CREATE INDEX "ledger_create_idempotency_organizationId_batchId_idx"
  ON "ledger_create_idempotency"("organizationId", "batchId");

ALTER TABLE "ledger_create_idempotency"
  ADD CONSTRAINT "ledger_create_idempotency_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ledger_create_idempotency"
  ADD CONSTRAINT "ledger_create_idempotency_actorUserAccountId_fkey"
  FOREIGN KEY ("actorUserAccountId") REFERENCES "user_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ledger_create_idempotency"
  ADD CONSTRAINT "ledger_create_idempotency_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "offering_batches"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ledger_create_idempotency"
  ADD CONSTRAINT "ledger_create_idempotency_donationId_fkey"
  FOREIGN KEY ("donationId") REFERENCES "donations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
