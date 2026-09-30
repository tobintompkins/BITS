-- Staff-only facility and equipment maintenance requests. Not a public form.
CREATE TYPE "MaintenanceRequestStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

CREATE TYPE "MaintenancePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

CREATE TABLE "maintenance_requests" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "equipmentItemId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "locationDescription" TEXT,
    "priority" "MaintenancePriority" NOT NULL DEFAULT 'NORMAL',
    "status" "MaintenanceRequestStatus" NOT NULL DEFAULT 'OPEN',
    "reportedByUserAccountId" UUID,
    "assignedToUserAccountId" UUID,
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "maintenance_requests_organizationId_status_idx"
  ON "maintenance_requests"("organizationId", "status");

CREATE INDEX "maintenance_requests_organizationId_priority_idx"
  ON "maintenance_requests"("organizationId", "priority");

CREATE INDEX "maintenance_requests_equipmentItemId_idx"
  ON "maintenance_requests"("equipmentItemId");

CREATE INDEX "maintenance_requests_organizationId_createdAt_idx"
  ON "maintenance_requests"("organizationId", "createdAt");

ALTER TABLE "maintenance_requests"
  ADD CONSTRAINT "maintenance_requests_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "maintenance_requests"
  ADD CONSTRAINT "maintenance_requests_equipmentItemId_fkey"
  FOREIGN KEY ("equipmentItemId") REFERENCES "equipment_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "maintenance_requests"
  ADD CONSTRAINT "maintenance_requests_reportedByUserAccountId_fkey"
  FOREIGN KEY ("reportedByUserAccountId") REFERENCES "user_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "maintenance_requests"
  ADD CONSTRAINT "maintenance_requests_assignedToUserAccountId_fkey"
  FOREIGN KEY ("assignedToUserAccountId") REFERENCES "user_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
