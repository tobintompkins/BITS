ALTER TABLE "members" ADD COLUMN "profilePhotoKey" TEXT;

CREATE TABLE "member_emergency_contacts" (
  "id" UUID NOT NULL,
  "memberId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "relationship" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "member_emergency_contacts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "member_emergency_contacts_memberId_idx" ON "member_emergency_contacts"("memberId");

ALTER TABLE "member_emergency_contacts"
ADD CONSTRAINT "member_emergency_contacts_memberId_fkey"
FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
