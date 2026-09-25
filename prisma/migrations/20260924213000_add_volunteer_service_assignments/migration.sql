-- Volunteer service assignments for existing church events.
CREATE TYPE "VolunteerServiceAssignmentStatus" AS ENUM (
  'SCHEDULED',
  'CANCELLED'
);

CREATE TABLE "volunteer_service_assignments" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "ministryId" UUID,
    "createdByUserId" UUID NOT NULL,
    "roleLabel" TEXT NOT NULL,
    "status" "VolunteerServiceAssignmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "staffNote" TEXT,
    "cancellationNote" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "volunteer_service_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "volunteer_service_assignments_organizationId_eventId_idx"
  ON "volunteer_service_assignments"("organizationId", "eventId");

CREATE INDEX "volunteer_service_assignments_organizationId_memberId_status_idx"
  ON "volunteer_service_assignments"("organizationId", "memberId", "status");

CREATE INDEX "volunteer_service_assignments_organizationId_status_eventId_idx"
  ON "volunteer_service_assignments"("organizationId", "status", "eventId");

CREATE UNIQUE INDEX "volunteer_service_assignments_active_unique"
  ON "volunteer_service_assignments" (
    "organizationId",
    "eventId",
    "memberId",
    COALESCE("ministryId", '00000000-0000-0000-0000-000000000000'),
    lower(btrim("roleLabel"))
  )
  WHERE "status" = 'SCHEDULED';

ALTER TABLE "volunteer_service_assignments"
  ADD CONSTRAINT "volunteer_service_assignments_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "volunteer_service_assignments"
  ADD CONSTRAINT "volunteer_service_assignments_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "events"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "volunteer_service_assignments"
  ADD CONSTRAINT "volunteer_service_assignments_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "members"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "volunteer_service_assignments"
  ADD CONSTRAINT "volunteer_service_assignments_ministryId_fkey"
  FOREIGN KEY ("ministryId") REFERENCES "ministries"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "volunteer_service_assignments"
  ADD CONSTRAINT "volunteer_service_assignments_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "user_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "volunteer_service_assignments"
  ADD CONSTRAINT "volunteer_service_assignments_cancelledByUserId_fkey"
  FOREIGN KEY ("cancelledByUserId") REFERENCES "user_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
