-- Simple church equipment inventory. Not a purchasing, checkout, or member feature.
CREATE TYPE "EquipmentStatus" AS ENUM ('AVAILABLE', 'IN_USE', 'MAINTENANCE', 'RETIRED');

CREATE TYPE "EquipmentCondition" AS ENUM (
  'EXCELLENT',
  'GOOD',
  'FAIR',
  'NEEDS_SERVICE',
  'OUT_OF_SERVICE'
);

CREATE TABLE "equipment_items" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "assetTag" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "storageLocation" TEXT,
    "status" "EquipmentStatus" NOT NULL DEFAULT 'AVAILABLE',
    "condition" "EquipmentCondition" NOT NULL DEFAULT 'GOOD',
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "equipment_items_quantity_positive" CHECK ("quantity" >= 1)
);

CREATE UNIQUE INDEX "equipment_items_organizationId_assetTag_key"
  ON "equipment_items"("organizationId", "assetTag");

CREATE INDEX "equipment_items_organizationId_status_idx"
  ON "equipment_items"("organizationId", "status");

CREATE INDEX "equipment_items_organizationId_category_idx"
  ON "equipment_items"("organizationId", "category");

CREATE INDEX "equipment_items_organizationId_archivedAt_idx"
  ON "equipment_items"("organizationId", "archivedAt");

ALTER TABLE "equipment_items"
  ADD CONSTRAINT "equipment_items_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
