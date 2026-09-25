-- Member-owned substitute requests for staff planning review.
CREATE TYPE "VolunteerSubstituteRequestStatus" AS ENUM (
  'OPEN',
  'IN_REVIEW',
  'RESOLVED',
  'DECLINED',
  'CANCELLED'
);

CREATE TABLE "volunteer_substitute_requests" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "memberReason" TEXT,
    "status" "VolunteerSubstituteRequestStatus" NOT NULL DEFAULT 'OPEN',
    "staffResolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "volunteer_substitute_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "volunteer_substitute_requests_open_unique"
  ON "volunteer_substitute_requests"("assignmentId")
  WHERE "status" IN ('OPEN', 'IN_REVIEW');

CREATE INDEX "volunteer_substitute_requests_organizationId_status_idx"
  ON "volunteer_substitute_requests"("organizationId", "status");

CREATE INDEX "volunteer_substitute_requests_organizationId_memberId_status_idx"
  ON "volunteer_substitute_requests"("organizationId", "memberId", "status");

CREATE INDEX "volunteer_substitute_requests_organizationId_assignmentId_status_idx"
  ON "volunteer_substitute_requests"("organizationId", "assignmentId", "status");

ALTER TABLE "volunteer_substitute_requests"
  ADD CONSTRAINT "volunteer_substitute_requests_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "volunteer_substitute_requests"
  ADD CONSTRAINT "volunteer_substitute_requests_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "volunteer_service_assignments"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "volunteer_substitute_requests"
  ADD CONSTRAINT "volunteer_substitute_requests_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "members"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "volunteer_substitute_requests"
  ADD CONSTRAINT "volunteer_substitute_requests_resolvedByUserId_fkey"
  FOREIGN KEY ("resolvedByUserId") REFERENCES "user_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
