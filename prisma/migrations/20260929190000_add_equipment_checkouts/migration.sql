-- Staff equipment check-out and return log. Does not change inventory quantities.
CREATE TABLE "equipment_checkouts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "equipmentItemId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "checkedOutToName" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "dueBackAt" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedOutByUserAccountId" UUID NOT NULL,
    "returnedAt" TIMESTAMP(3),
    "returnedByUserAccountId" UUID,
    "returnNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_checkouts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "equipment_checkouts_quantity_positive" CHECK ("quantity" >= 1)
);

CREATE INDEX "equipment_checkouts_organizationId_returnedAt_idx"
  ON "equipment_checkouts"("organizationId", "returnedAt");

CREATE INDEX "equipment_checkouts_equipmentItemId_returnedAt_idx"
  ON "equipment_checkouts"("equipmentItemId", "returnedAt");

CREATE INDEX "equipment_checkouts_dueBackAt_idx"
  ON "equipment_checkouts"("dueBackAt");

ALTER TABLE "equipment_checkouts"
  ADD CONSTRAINT "equipment_checkouts_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "equipment_checkouts"
  ADD CONSTRAINT "equipment_checkouts_equipmentItemId_fkey"
  FOREIGN KEY ("equipmentItemId") REFERENCES "equipment_items"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "equipment_checkouts"
  ADD CONSTRAINT "equipment_checkouts_checkedOutByUserAccountId_fkey"
  FOREIGN KEY ("checkedOutByUserAccountId") REFERENCES "user_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "equipment_checkouts"
  ADD CONSTRAINT "equipment_checkouts_returnedByUserAccountId_fkey"
  FOREIGN KEY ("returnedByUserAccountId") REFERENCES "user_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
