-- CreateTable
CREATE TABLE IF NOT EXISTS "audit_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "actorUserAccountId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "changeMetadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_events_organizationId_idx" ON "audit_events"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_events_organizationId_occurredAt_idx" ON "audit_events"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_events_organizationId_entityType_entityId_idx" ON "audit_events"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_events_actorUserAccountId_idx" ON "audit_events"("actorUserAccountId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_events_organizationId_fkey'
  ) THEN
    ALTER TABLE "audit_events"
    ADD CONSTRAINT "audit_events_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_events_actorUserAccountId_fkey'
  ) THEN
    ALTER TABLE "audit_events"
    ADD CONSTRAINT "audit_events_actorUserAccountId_fkey"
    FOREIGN KEY ("actorUserAccountId") REFERENCES "user_accounts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
