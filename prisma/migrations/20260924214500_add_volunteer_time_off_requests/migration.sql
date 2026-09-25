-- Member-owned volunteer time-off requests for staff planning review.
CREATE TYPE "VolunteerTimeOffRequestStatus" AS ENUM (
  'OPEN',
  'IN_REVIEW',
  'APPROVED',
  'DECLINED',
  'CANCELLED'
);

CREATE TABLE "volunteer_time_off_requests" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "memberReason" TEXT,
    "status" "VolunteerTimeOffRequestStatus" NOT NULL DEFAULT 'OPEN',
    "staffResolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "volunteer_time_off_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "volunteer_time_off_requests_organizationId_status_idx"
  ON "volunteer_time_off_requests"("organizationId", "status");

CREATE INDEX "volunteer_time_off_requests_organizationId_memberId_status_idx"
  ON "volunteer_time_off_requests"("organizationId", "memberId", "status");

CREATE INDEX "volunteer_time_off_requests_organizationId_startDate_endDate_idx"
  ON "volunteer_time_off_requests"("organizationId", "startDate", "endDate");

ALTER TABLE "volunteer_time_off_requests"
  ADD CONSTRAINT "volunteer_time_off_requests_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "volunteer_time_off_requests"
  ADD CONSTRAINT "volunteer_time_off_requests_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "members"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "volunteer_time_off_requests"
  ADD CONSTRAINT "volunteer_time_off_requests_resolvedByUserId_fkey"
  FOREIGN KEY ("resolvedByUserId") REFERENCES "user_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
