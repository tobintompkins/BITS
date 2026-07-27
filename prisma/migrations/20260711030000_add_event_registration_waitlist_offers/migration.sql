-- Blueprint 7.2 patch: waitlist offer FSM, promotion tokens, sensitive attendee fields

DO $$ BEGIN
  ALTER TYPE "EventRegistrationStatus" ADD VALUE 'OFFERED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "EventRegistrationStatus" ADD VALUE 'DECLINED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EventRegistrationSource" AS ENUM ('MEMBER_PORTAL', 'PUBLIC_GUEST', 'STAFF', 'IMPORT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EventWaitlistEntryStatus" AS ENUM ('WAITING', 'OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EventAttendeeType" AS ENUM ('MEMBER', 'GUEST', 'CHILD', 'VOLUNTEER', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "event_registration_settings"
  ADD COLUMN IF NOT EXISTS "confirmationRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "promotionOfferTtlMinutes" INTEGER NOT NULL DEFAULT 1440;

ALTER TABLE "event_registrations"
  ADD COLUMN IF NOT EXISTS "source" "EventRegistrationSource" NOT NULL DEFAULT 'PUBLIC_GUEST',
  ADD COLUMN IF NOT EXISTS "cancelledByUserId" UUID,
  ADD COLUMN IF NOT EXISTS "offeredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "offerExpiresAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "event_registrations_organizationId_eventId_createdAt_idx"
  ON "event_registrations"("organizationId", "eventId", "createdAt");
CREATE INDEX IF NOT EXISTS "event_registrations_organizationId_eventId_primaryContactEmail_idx"
  ON "event_registrations"("organizationId", "eventId", "primaryContactEmail");

DO $$ BEGIN
  ALTER TABLE "event_registrations"
    ADD CONSTRAINT "event_registrations_cancelledByUserId_fkey"
    FOREIGN KEY ("cancelledByUserId") REFERENCES "user_accounts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "event_attendees"
  ADD COLUMN IF NOT EXISTS "attendeeType" "EventAttendeeType" NOT NULL DEFAULT 'GUEST',
  ADD COLUMN IF NOT EXISTS "accommodationRequest" TEXT,
  ADD COLUMN IF NOT EXISTS "dietaryNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "internalNotes" TEXT;

CREATE INDEX IF NOT EXISTS "event_attendees_organizationId_eventId_memberId_idx"
  ON "event_attendees"("organizationId", "eventId", "memberId");
CREATE INDEX IF NOT EXISTS "event_attendees_organizationId_eventId_lastName_firstName_idx"
  ON "event_attendees"("organizationId", "eventId", "lastName", "firstName");

CREATE TABLE IF NOT EXISTS "event_waitlist_entries" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "registrationId" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "partySize" INTEGER NOT NULL,
  "status" "EventWaitlistEntryStatus" NOT NULL DEFAULT 'WAITING',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "offeredAt" TIMESTAMP(3),
  "offerExpiresAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "declinedAt" TIMESTAMP(3),
  "expiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_waitlist_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "event_waitlist_entries_registrationId_key"
  ON "event_waitlist_entries"("registrationId");
CREATE UNIQUE INDEX IF NOT EXISTS "event_waitlist_entries_eventId_position_key"
  ON "event_waitlist_entries"("eventId", "position");
CREATE INDEX IF NOT EXISTS "event_waitlist_entries_organizationId_eventId_status_position_idx"
  ON "event_waitlist_entries"("organizationId", "eventId", "status", "position");
CREATE INDEX IF NOT EXISTS "event_waitlist_entries_eventId_offerExpiresAt_idx"
  ON "event_waitlist_entries"("eventId", "offerExpiresAt");

DO $$ BEGIN
  ALTER TABLE "event_waitlist_entries"
    ADD CONSTRAINT "event_waitlist_entries_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "event_waitlist_entries"
    ADD CONSTRAINT "event_waitlist_entries_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "events"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "event_waitlist_entries"
    ADD CONSTRAINT "event_waitlist_entries_registrationId_fkey"
    FOREIGN KEY ("registrationId") REFERENCES "event_registrations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "event_promotion_offers" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "registrationId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "purpose" TEXT NOT NULL DEFAULT 'WAITLIST_PROMOTION',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_promotion_offers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "event_promotion_offers_organizationId_tokenHash_idx"
  ON "event_promotion_offers"("organizationId", "tokenHash");
CREATE INDEX IF NOT EXISTS "event_promotion_offers_registrationId_idx"
  ON "event_promotion_offers"("registrationId");
CREATE INDEX IF NOT EXISTS "event_promotion_offers_expiresAt_idx"
  ON "event_promotion_offers"("expiresAt");

DO $$ BEGIN
  ALTER TABLE "event_promotion_offers"
    ADD CONSTRAINT "event_promotion_offers_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "event_promotion_offers"
    ADD CONSTRAINT "event_promotion_offers_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "events"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "event_promotion_offers"
    ADD CONSTRAINT "event_promotion_offers_registrationId_fkey"
    FOREIGN KEY ("registrationId") REFERENCES "event_registrations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Backfill waitlist entries for existing WAITLISTED registrations (stable positions)
INSERT INTO "event_waitlist_entries" (
  "id",
  "organizationId",
  "eventId",
  "registrationId",
  "position",
  "partySize",
  "status",
  "joinedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  ranked."organizationId",
  ranked."eventId",
  ranked."id",
  ranked.pos,
  ranked."partySize",
  'WAITING'::"EventWaitlistEntryStatus",
  ranked."createdAt",
  NOW(),
  NOW()
FROM (
  SELECT
    r.*,
    ROW_NUMBER() OVER (
      PARTITION BY r."eventId"
      ORDER BY COALESCE(r."waitlistPosition", 2147483647), r."createdAt", r."id"
    ) AS pos
  FROM "event_registrations" r
  WHERE r."status" = 'WAITLISTED'
) ranked
WHERE NOT EXISTS (
  SELECT 1 FROM "event_waitlist_entries" w WHERE w."registrationId" = ranked."id"
);
