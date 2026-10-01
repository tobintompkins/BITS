-- Private staff-only approved pickup people for child/minor check-out authorization.
-- Not connected to kiosk, Member Portal, emergency contacts, or public pages.
CREATE TABLE "member_approved_pickups" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),
    "deactivatedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_approved_pickups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "member_approved_pickups_org_member_active_idx"
  ON "member_approved_pickups"("organizationId", "memberId", "isActive");

CREATE INDEX "member_approved_pickups_memberId_idx"
  ON "member_approved_pickups"("memberId");

CREATE UNIQUE INDEX "member_approved_pickups_active_name_rel_key"
  ON "member_approved_pickups" (
    "organizationId",
    "memberId",
    lower("firstName"),
    lower("lastName"),
    lower("relationship")
  )
  WHERE "isActive" = true;

ALTER TABLE "member_approved_pickups"
  ADD CONSTRAINT "member_approved_pickups_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "member_approved_pickups"
  ADD CONSTRAINT "member_approved_pickups_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "members"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "member_approved_pickups"
  ADD CONSTRAINT "member_approved_pickups_deactivatedByUserId_fkey"
  FOREIGN KEY ("deactivatedByUserId") REFERENCES "user_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
