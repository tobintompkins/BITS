-- Blueprint 7.3P: harden EventQrPass foundation (hash-only, status, lineage, tenant FKs).
-- Reuses existing event_qr_passes from Blueprint 7.3 ops; no issuance/API/UI in this patch.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Purpose / status enums
DO $$ BEGIN
  CREATE TYPE "EventQrPassPurpose" AS ENUM ('EVENT_CHECK_IN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EventQrPassStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED', 'REPLACED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Parent unique targets for tenant-aware composite FKs
CREATE UNIQUE INDEX IF NOT EXISTS "events_organizationId_id_key"
  ON "events"("organizationId", "id");

CREATE UNIQUE INDEX IF NOT EXISTS "event_registrations_organizationId_eventId_id_key"
  ON "event_registrations"("organizationId", "eventId", "id");

CREATE UNIQUE INDEX IF NOT EXISTS "event_attendees_organizationId_eventId_registrationId_id_key"
  ON "event_attendees"("organizationId", "eventId", "registrationId", "id");

-- New columns (nullable until backfill)
ALTER TABLE "event_qr_passes"
  ADD COLUMN IF NOT EXISTS "fallbackCodeHash" TEXT,
  ADD COLUMN IF NOT EXISTS "status" "EventQrPassStatus",
  ADD COLUMN IF NOT EXISTS "revokedByUserId" UUID,
  ADD COLUMN IF NOT EXISTS "replacedByTokenId" UUID;

-- Migrate purpose from free text to enum (existing default is EVENT_CHECK_IN)
ALTER TABLE "event_qr_passes"
  ALTER COLUMN "purpose" DROP DEFAULT;

ALTER TABLE "event_qr_passes"
  ALTER COLUMN "purpose" TYPE "EventQrPassPurpose"
  USING (
    CASE
      WHEN "purpose" = 'EVENT_CHECK_IN' THEN 'EVENT_CHECK_IN'::"EventQrPassPurpose"
      ELSE 'EVENT_CHECK_IN'::"EventQrPassPurpose"
    END
  );

ALTER TABLE "event_qr_passes"
  ALTER COLUMN "purpose" SET DEFAULT 'EVENT_CHECK_IN'::"EventQrPassPurpose";

-- Hash plaintext fallback codes (ops legacy) then drop plaintext column
UPDATE "event_qr_passes"
SET "fallbackCodeHash" = encode(digest(upper(btrim("fallbackCode")), 'sha256'), 'hex')
WHERE "fallbackCodeHash" IS NULL
  AND "fallbackCode" IS NOT NULL
  AND btrim("fallbackCode") <> '';

-- Any row still missing a hash gets a unique random placeholder (should not happen for real rows)
UPDATE "event_qr_passes"
SET "fallbackCodeHash" = encode(digest(gen_random_uuid()::text, 'sha256'), 'hex')
WHERE "fallbackCodeHash" IS NULL;

-- Ops rotation historically set rotatedAt/revokedAt without replacement lineage.
-- Map those to REVOKED (REPLACED requires replacedByTokenId).
UPDATE "event_qr_passes"
SET "status" = CASE
  WHEN "revokedAt" IS NOT NULL OR "rotatedAt" IS NOT NULL THEN 'REVOKED'::"EventQrPassStatus"
  WHEN "expiresAt" <= CURRENT_TIMESTAMP THEN 'EXPIRED'::"EventQrPassStatus"
  ELSE 'ACTIVE'::"EventQrPassStatus"
END
WHERE "status" IS NULL;

-- Ensure REVOKED rows have revokedAt for the status check constraint
UPDATE "event_qr_passes"
SET "revokedAt" = COALESCE("revokedAt", COALESCE("rotatedAt", CURRENT_TIMESTAMP))
WHERE "status" = 'REVOKED' AND "revokedAt" IS NULL;

ALTER TABLE "event_qr_passes"
  ALTER COLUMN "fallbackCodeHash" SET NOT NULL,
  ALTER COLUMN "status" SET NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::"EventQrPassStatus";

DROP INDEX IF EXISTS "event_qr_passes_organizationId_fallbackCode_idx";

ALTER TABLE "event_qr_passes"
  DROP COLUMN IF EXISTS "fallbackCode";

-- Replace single-column event/registration/attendee FKs with tenant-aware composites
ALTER TABLE "event_qr_passes"
  DROP CONSTRAINT IF EXISTS "event_qr_passes_eventId_fkey";
ALTER TABLE "event_qr_passes"
  DROP CONSTRAINT IF EXISTS "event_qr_passes_registrationId_fkey";
ALTER TABLE "event_qr_passes"
  DROP CONSTRAINT IF EXISTS "event_qr_passes_attendeeId_fkey";

DO $$ BEGIN
  ALTER TABLE "event_qr_passes"
    ADD CONSTRAINT "event_qr_passes_organizationId_eventId_fkey"
    FOREIGN KEY ("organizationId", "eventId")
    REFERENCES "events"("organizationId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "event_qr_passes"
    ADD CONSTRAINT "event_qr_passes_organizationId_eventId_registrationId_fkey"
    FOREIGN KEY ("organizationId", "eventId", "registrationId")
    REFERENCES "event_registrations"("organizationId", "eventId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- MATCH SIMPLE: when attendeeId is NULL (party pass), this FK is not enforced.
DO $$ BEGIN
  ALTER TABLE "event_qr_passes"
    ADD CONSTRAINT "event_qr_passes_organizationId_eventId_registrationId_attendeeId_fkey"
    FOREIGN KEY ("organizationId", "eventId", "registrationId", "attendeeId")
    REFERENCES "event_attendees"("organizationId", "eventId", "registrationId", "id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "event_qr_passes"
    ADD CONSTRAINT "event_qr_passes_revokedByUserId_fkey"
    FOREIGN KEY ("revokedByUserId")
    REFERENCES "user_accounts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "event_qr_passes"
    ADD CONSTRAINT "event_qr_passes_replacedByTokenId_fkey"
    FOREIGN KEY ("replacedByTokenId")
    REFERENCES "event_qr_passes"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Status / timestamp / self-replacement consistency
DO $$ BEGIN
  ALTER TABLE "event_qr_passes"
    ADD CONSTRAINT "event_qr_passes_expires_after_created_check"
    CHECK ("expiresAt" > "createdAt");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "event_qr_passes"
    ADD CONSTRAINT "event_qr_passes_no_self_replacement_check"
    CHECK ("replacedByTokenId" IS NULL OR "replacedByTokenId" <> "id");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "event_qr_passes"
    ADD CONSTRAINT "event_qr_passes_status_fields_check"
    CHECK (
      (
        "status" = 'ACTIVE'
        AND "revokedAt" IS NULL
        AND "revokedByUserId" IS NULL
        AND "replacedByTokenId" IS NULL
      )
      OR (
        "status" = 'REVOKED'
        AND "revokedAt" IS NOT NULL
        AND "replacedByTokenId" IS NULL
      )
      OR (
        "status" = 'REPLACED'
        AND "revokedAt" IS NOT NULL
        AND "replacedByTokenId" IS NOT NULL
      )
      OR (
        "status" = 'EXPIRED'
        AND "replacedByTokenId" IS NULL
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Demote duplicate ACTIVE party/attendee passes before uniqueness (keep newest)
WITH ranked_party AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "organizationId", "eventId", "registrationId", "purpose"
      ORDER BY "createdAt" DESC, id DESC
    ) AS rn
  FROM "event_qr_passes"
  WHERE "status" = 'ACTIVE' AND "attendeeId" IS NULL
)
UPDATE "event_qr_passes" p
SET
  "status" = 'REVOKED'::"EventQrPassStatus",
  "revokedAt" = COALESCE(p."revokedAt", CURRENT_TIMESTAMP)
FROM ranked_party r
WHERE p.id = r.id
  AND r.rn > 1;

WITH ranked_attendee AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "organizationId", "eventId", "registrationId", "attendeeId", "purpose"
      ORDER BY "createdAt" DESC, id DESC
    ) AS rn
  FROM "event_qr_passes"
  WHERE "status" = 'ACTIVE' AND "attendeeId" IS NOT NULL
)
UPDATE "event_qr_passes" p
SET
  "status" = 'REVOKED'::"EventQrPassStatus",
  "revokedAt" = COALESCE(p."revokedAt", CURRENT_TIMESTAMP)
FROM ranked_attendee r
WHERE p.id = r.id
  AND r.rn > 1;

-- Hash uniqueness (dedupe collisions by suffixing rare duplicates)
WITH dup_hashes AS (
  SELECT id, "tokenHash",
    ROW_NUMBER() OVER (PARTITION BY "tokenHash" ORDER BY "createdAt", id) AS rn
  FROM "event_qr_passes"
)
UPDATE "event_qr_passes" p
SET "tokenHash" = encode(digest(p.id::text || p."tokenHash", 'sha256'), 'hex')
FROM dup_hashes d
WHERE p.id = d.id AND d.rn > 1;

WITH dup_fallback AS (
  SELECT id, "fallbackCodeHash",
    ROW_NUMBER() OVER (PARTITION BY "fallbackCodeHash" ORDER BY "createdAt", id) AS rn
  FROM "event_qr_passes"
)
UPDATE "event_qr_passes" p
SET "fallbackCodeHash" = encode(digest(p.id::text || p."fallbackCodeHash", 'sha256'), 'hex')
FROM dup_fallback d
WHERE p.id = d.id AND d.rn > 1;

-- Hash uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS "event_qr_passes_tokenHash_key"
  ON "event_qr_passes"("tokenHash");

CREATE UNIQUE INDEX IF NOT EXISTS "event_qr_passes_fallbackCodeHash_key"
  ON "event_qr_passes"("fallbackCodeHash");

-- At most one ACTIVE pass per tenant+event+registration+attendee-binding+purpose
CREATE UNIQUE INDEX IF NOT EXISTS "event_qr_passes_active_party_key"
  ON "event_qr_passes"("organizationId", "eventId", "registrationId", "purpose")
  WHERE "status" = 'ACTIVE' AND "attendeeId" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "event_qr_passes_active_attendee_key"
  ON "event_qr_passes"("organizationId", "eventId", "registrationId", "attendeeId", "purpose")
  WHERE "status" = 'ACTIVE' AND "attendeeId" IS NOT NULL;

-- Lookup / listing indexes
DROP INDEX IF EXISTS "event_qr_passes_organizationId_tokenHash_idx";

CREATE INDEX IF NOT EXISTS "event_qr_passes_organizationId_purpose_tokenHash_idx"
  ON "event_qr_passes"("organizationId", "purpose", "tokenHash");

CREATE INDEX IF NOT EXISTS "event_qr_passes_organizationId_eventId_registrationId_idx"
  ON "event_qr_passes"("organizationId", "eventId", "registrationId");

CREATE INDEX IF NOT EXISTS "event_qr_passes_organizationId_eventId_attendeeId_idx"
  ON "event_qr_passes"("organizationId", "eventId", "attendeeId");

CREATE INDEX IF NOT EXISTS "event_qr_passes_organizationId_eventId_status_expiresAt_idx"
  ON "event_qr_passes"("organizationId", "eventId", "status", "expiresAt");

CREATE INDEX IF NOT EXISTS "event_qr_passes_replacedByTokenId_idx"
  ON "event_qr_passes"("replacedByTokenId");

CREATE INDEX IF NOT EXISTS "event_qr_passes_registrationId_status_createdAt_idx"
  ON "event_qr_passes"("registrationId", "status", "createdAt");
