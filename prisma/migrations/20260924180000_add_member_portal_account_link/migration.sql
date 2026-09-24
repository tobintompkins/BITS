-- Optional staff-set portal ownership for a Member record.
-- One active sign-in account may be linked to at most one member per organization.
ALTER TABLE "members" ADD COLUMN "userAccountId" UUID;

CREATE UNIQUE INDEX "members_organizationId_userAccountId_key"
  ON "members"("organizationId", "userAccountId");

CREATE INDEX "members_userAccountId_idx" ON "members"("userAccountId");

ALTER TABLE "members"
  ADD CONSTRAINT "members_userAccountId_fkey"
  FOREIGN KEY ("userAccountId") REFERENCES "user_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
