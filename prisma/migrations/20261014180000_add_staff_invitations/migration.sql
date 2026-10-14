-- Authorized staff invitation intent. BITS roles stay on OrganizationMembership.
-- activeEmailKey is set only for non-terminal rows so one active invite exists
-- per church + normalized email. Terminal rows keep history.

CREATE TYPE "StaffInvitationStatus" AS ENUM (
  'AUTHORIZED',
  'SENT',
  'FAILED',
  'UNKNOWN',
  'REVOKED',
  'ACCEPTED',
  'EXPIRED'
);

CREATE TABLE "staff_invitations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "emailDisplay" TEXT NOT NULL,
    "roleCode" "RoleCode" NOT NULL,
    "invitedByUserAccountId" UUID NOT NULL,
    "status" "StaffInvitationStatus" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "clerkInvitationId" TEXT,
    "clerkOrganizationId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedUserAccountId" UUID,
    "acceptedAt" TIMESTAMP(3),
    "lastProviderErrorRedacted" TEXT,
    "reapprovedByUserAccountId" UUID,
    "reapprovedAt" TIMESTAMP(3),
    "activeEmailKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_invitations_organizationId_activeEmailKey_key"
  ON "staff_invitations"("organizationId", "activeEmailKey");

CREATE INDEX "staff_invitations_organizationId_status_idx"
  ON "staff_invitations"("organizationId", "status");

CREATE INDEX "staff_invitations_organizationId_createdAt_idx"
  ON "staff_invitations"("organizationId", "createdAt");

ALTER TABLE "staff_invitations"
  ADD CONSTRAINT "staff_invitations_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_invitations"
  ADD CONSTRAINT "staff_invitations_invitedByUserAccountId_fkey"
  FOREIGN KEY ("invitedByUserAccountId") REFERENCES "user_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "staff_invitations"
  ADD CONSTRAINT "staff_invitations_acceptedUserAccountId_fkey"
  FOREIGN KEY ("acceptedUserAccountId") REFERENCES "user_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "staff_invitations"
  ADD CONSTRAINT "staff_invitations_reapprovedByUserAccountId_fkey"
  FOREIGN KEY ("reapprovedByUserAccountId") REFERENCES "user_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
