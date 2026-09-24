CREATE TYPE "MemberPrivacyRequestType" AS ENUM ('DATA_COPY', 'CONTACT_CORRECTION', 'PRIVACY_QUESTION');

CREATE TYPE "MemberPrivacyRequestStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'COMPLETED', 'DECLINED');

CREATE TABLE "member_privacy_data_requests" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "requestingUserAccountId" UUID NOT NULL,
  "linkedDonorId" UUID,
  "requestType" "MemberPrivacyRequestType" NOT NULL,
  "memberNote" TEXT,
  "status" "MemberPrivacyRequestStatus" NOT NULL DEFAULT 'OPEN',
  "staffResolutionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "resolvedByUserAccountId" UUID,
  CONSTRAINT "member_privacy_data_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "member_privacy_data_requests_organizationId_status_idx"
  ON "member_privacy_data_requests"("organizationId", "status");

CREATE INDEX "member_privacy_data_requests_org_user_type_status_idx"
  ON "member_privacy_data_requests"("organizationId", "requestingUserAccountId", "requestType", "status");

CREATE UNIQUE INDEX "member_privacy_data_requests_open_type_key"
  ON "member_privacy_data_requests"("organizationId", "requestingUserAccountId", "requestType")
  WHERE "status" IN ('OPEN', 'IN_REVIEW');

ALTER TABLE "member_privacy_data_requests"
  ADD CONSTRAINT "member_privacy_data_requests_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "member_privacy_data_requests"
  ADD CONSTRAINT "member_privacy_data_requests_requestingUserAccountId_fkey"
  FOREIGN KEY ("requestingUserAccountId") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "member_privacy_data_requests"
  ADD CONSTRAINT "member_privacy_data_requests_linkedDonorId_fkey"
  FOREIGN KEY ("linkedDonorId") REFERENCES "donors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "member_privacy_data_requests"
  ADD CONSTRAINT "member_privacy_data_requests_resolvedByUserAccountId_fkey"
  FOREIGN KEY ("resolvedByUserAccountId") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
