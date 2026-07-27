ALTER TABLE "prayer_requests"
  ADD COLUMN "requesterContact" TEXT,
  ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publicPublishedAt" TIMESTAMP(3),
  ADD COLUMN "publicExpiresAt" TIMESTAMP(3),
  ALTER COLUMN "createdByUserId" DROP NOT NULL;

ALTER TABLE "prayer_requests"
  DROP CONSTRAINT IF EXISTS "prayer_requests_createdByUserId_fkey";

ALTER TABLE "prayer_requests"
  ADD CONSTRAINT "prayer_requests_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "user_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "prayer_requests_organizationId_isPublic_publicExpiresAt_idx"
  ON "prayer_requests"("organizationId", "isPublic", "publicExpiresAt");
