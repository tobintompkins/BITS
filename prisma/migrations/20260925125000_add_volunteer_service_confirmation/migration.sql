-- Member acknowledgement that they have seen an upcoming scheduled assignment.
ALTER TABLE "volunteer_service_assignments"
  ADD COLUMN "memberConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "memberConfirmedByUserAccountId" UUID;

ALTER TABLE "volunteer_service_assignments"
  ADD CONSTRAINT "volunteer_service_assignments_memberConfirmedByUserAccountId_fkey"
  FOREIGN KEY ("memberConfirmedByUserAccountId") REFERENCES "user_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
