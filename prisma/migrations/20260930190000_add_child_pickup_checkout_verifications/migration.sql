-- Internal staff-only verified child pickup check-out trail.
-- Never included in portal, kiosk, directory, export, or public DTOs.
CREATE TABLE "child_pickup_checkout_verifications" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "attendanceId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "approvedPickupId" UUID NOT NULL,
    "verifiedByUserId" UUID,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "child_pickup_checkout_verifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "child_pickup_checkout_verifications_attendanceId_key"
  ON "child_pickup_checkout_verifications"("attendanceId");

CREATE INDEX "child_pickup_checkout_verifications_org_event_idx"
  ON "child_pickup_checkout_verifications"("organizationId", "eventId");

CREATE INDEX "child_pickup_checkout_verifications_org_member_idx"
  ON "child_pickup_checkout_verifications"("organizationId", "memberId");

CREATE INDEX "child_pickup_checkout_verifications_approvedPickupId_idx"
  ON "child_pickup_checkout_verifications"("approvedPickupId");

ALTER TABLE "child_pickup_checkout_verifications"
  ADD CONSTRAINT "child_pickup_checkout_verifications_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "child_pickup_checkout_verifications"
  ADD CONSTRAINT "child_pickup_checkout_verifications_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "events"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "child_pickup_checkout_verifications"
  ADD CONSTRAINT "child_pickup_checkout_verifications_attendanceId_fkey"
  FOREIGN KEY ("attendanceId") REFERENCES "event_attendance_records"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "child_pickup_checkout_verifications"
  ADD CONSTRAINT "child_pickup_checkout_verifications_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "members"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "child_pickup_checkout_verifications"
  ADD CONSTRAINT "child_pickup_checkout_verifications_approvedPickupId_fkey"
  FOREIGN KEY ("approvedPickupId") REFERENCES "member_approved_pickups"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "child_pickup_checkout_verifications"
  ADD CONSTRAINT "child_pickup_checkout_verifications_verifiedByUserId_fkey"
  FOREIGN KEY ("verifiedByUserId") REFERENCES "user_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
