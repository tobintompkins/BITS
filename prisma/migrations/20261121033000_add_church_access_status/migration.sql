CREATE TYPE "ChurchAccessStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REMOVED');

ALTER TABLE "organization_memberships"
ADD COLUMN "churchAccess" "ChurchAccessStatus" NOT NULL DEFAULT 'ACTIVE';

UPDATE "organization_memberships"
SET "churchAccess" = 'SUSPENDED'
WHERE active = false;
