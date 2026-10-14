-- Additive concurrency token for existing staff membership edits.
-- Same-millisecond saves cannot rely on updated_at alone.
ALTER TABLE "organization_memberships"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
