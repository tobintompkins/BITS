-- Add the core giving and member-portal tables that are present in the
-- application schema but were not included in the original tenant migration.
-- This migration is additive and does not remove or rewrite existing records.

CREATE TYPE "OfferingBatchStatus" AS ENUM ('DRAFT', 'ENTERED', 'RECONCILED', 'LOCKED');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CHECK', 'CARD', 'ACH', 'STOCK_OR_NONCASH', 'OTHER');
CREATE TYPE "StatementType" AS ENUM ('INDIVIDUAL', 'HOUSEHOLD');
CREATE TYPE "StatementStatus" AS ENUM ('GENERATED', 'PUBLISHED', 'VOIDED');
CREATE TYPE "StatementAccessAction" AS ENUM ('GENERATED', 'VIEWED', 'DOWNLOADED', 'EMAILED', 'VOIDED');

CREATE TABLE "donors" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userAccountId" UUID,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "mailingAddressLine1" TEXT,
    "mailingAddressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "preferredCommunicationMethod" TEXT,
    "internalNotes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deceased" BOOLEAN NOT NULL DEFAULT false,
    "deceasedDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "donors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "households" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "mailingAddressLine1" TEXT NOT NULL,
    "mailingAddressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'US',
    "primaryDonorId" UUID,
    "preferredStatementRecipientId" UUID,
    "statementDeliveryMethod" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "household_memberships" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "donorId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "relationshipLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "household_memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "offering_types" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "code" TEXT,
    "defaultTaxDeductible" BOOLEAN NOT NULL DEFAULT true,
    "onlineGivingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "offering_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "offering_batches" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "reference" TEXT,
    "offeringDate" DATE NOT NULL,
    "serviceDescription" TEXT,
    "status" "OfferingBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "expectedTotal" DECIMAL(12,2),
    "recordedTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "depositDate" DATE,
    "depositReference" TEXT,
    "notes" TEXT,
    "createdByUserAccountId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "offering_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "donations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "donorId" UUID,
    "batchId" UUID,
    "offeringDate" DATE NOT NULL,
    "receivedDate" DATE NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "checkNumber" TEXT,
    "note" TEXT,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "isTaxDeductible" BOOLEAN NOT NULL DEFAULT true,
    "deductibleAmount" DECIMAL(12,2) NOT NULL,
    "goodsOrServicesProvided" BOOLEAN NOT NULL DEFAULT false,
    "goodsOrServicesDescription" TEXT,
    "goodsOrServicesEstimatedValue" DECIMAL(12,2),
    "intangibleReligiousBenefitsOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "donations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "donation_allocations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "donationId" UUID NOT NULL,
    "offeringTypeId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "donation_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contribution_statements" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "statementType" "StatementType" NOT NULL,
    "donorId" UUID,
    "householdId" UUID,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "taxYear" INTEGER,
    "deductibleTotal" DECIMAL(12,2) NOT NULL,
    "statementIdentifier" TEXT NOT NULL,
    "pdfStorageKey" TEXT NOT NULL,
    "pdfChecksum" TEXT,
    "status" "StatementStatus" NOT NULL DEFAULT 'GENERATED',
    "generatedByUserAccountId" UUID NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contribution_statements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "statement_access_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "statementId" UUID NOT NULL,
    "userAccountId" UUID NOT NULL,
    "action" "StatementAccessAction" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "statement_access_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "donors_organizationId_idx" ON "donors"("organizationId");
CREATE INDEX "donors_organizationId_active_idx" ON "donors"("organizationId", "active");
CREATE INDEX "donors_organizationId_lastName_firstName_idx" ON "donors"("organizationId", "lastName", "firstName");
CREATE UNIQUE INDEX "donors_organizationId_userAccountId_key" ON "donors"("organizationId", "userAccountId");
CREATE INDEX "households_organizationId_idx" ON "households"("organizationId");
CREATE INDEX "households_organizationId_active_idx" ON "households"("organizationId", "active");
CREATE INDEX "household_memberships_organizationId_idx" ON "household_memberships"("organizationId");
CREATE INDEX "household_memberships_householdId_idx" ON "household_memberships"("householdId");
CREATE INDEX "household_memberships_donorId_idx" ON "household_memberships"("donorId");
CREATE INDEX "household_memberships_donorId_endDate_idx" ON "household_memberships"("donorId", "endDate");
CREATE INDEX "household_memberships_householdId_endDate_idx" ON "household_memberships"("householdId", "endDate");
CREATE INDEX "offering_types_organizationId_idx" ON "offering_types"("organizationId");
CREATE INDEX "offering_types_organizationId_active_idx" ON "offering_types"("organizationId", "active");
CREATE UNIQUE INDEX "offering_types_organizationId_code_key" ON "offering_types"("organizationId", "code");
CREATE INDEX "offering_batches_organizationId_idx" ON "offering_batches"("organizationId");
CREATE INDEX "offering_batches_organizationId_status_idx" ON "offering_batches"("organizationId", "status");
CREATE INDEX "offering_batches_organizationId_offeringDate_idx" ON "offering_batches"("organizationId", "offeringDate");
CREATE INDEX "donations_organizationId_idx" ON "donations"("organizationId");
CREATE INDEX "donations_organizationId_offeringDate_idx" ON "donations"("organizationId", "offeringDate");
CREATE INDEX "donations_organizationId_receivedDate_idx" ON "donations"("organizationId", "receivedDate");
CREATE INDEX "donations_donorId_idx" ON "donations"("donorId");
CREATE INDEX "donations_batchId_idx" ON "donations"("batchId");
CREATE INDEX "donations_organizationId_paymentMethod_idx" ON "donations"("organizationId", "paymentMethod");
CREATE INDEX "donations_organizationId_anonymous_idx" ON "donations"("organizationId", "anonymous");
CREATE INDEX "donation_allocations_organizationId_idx" ON "donation_allocations"("organizationId");
CREATE INDEX "donation_allocations_donationId_idx" ON "donation_allocations"("donationId");
CREATE INDEX "donation_allocations_offeringTypeId_idx" ON "donation_allocations"("offeringTypeId");
CREATE INDEX "donation_allocations_organizationId_offeringTypeId_idx" ON "donation_allocations"("organizationId", "offeringTypeId");
CREATE INDEX "contribution_statements_organizationId_idx" ON "contribution_statements"("organizationId");
CREATE INDEX "contribution_statements_organizationId_status_idx" ON "contribution_statements"("organizationId", "status");
CREATE INDEX "contribution_statements_organizationId_taxYear_idx" ON "contribution_statements"("organizationId", "taxYear");
CREATE INDEX "contribution_statements_donorId_idx" ON "contribution_statements"("donorId");
CREATE INDEX "contribution_statements_householdId_idx" ON "contribution_statements"("householdId");
CREATE UNIQUE INDEX "contribution_statements_organizationId_statementIdentifier_key" ON "contribution_statements"("organizationId", "statementIdentifier");
CREATE INDEX "statement_access_events_organizationId_idx" ON "statement_access_events"("organizationId");
CREATE INDEX "statement_access_events_statementId_idx" ON "statement_access_events"("statementId");
CREATE INDEX "statement_access_events_userAccountId_idx" ON "statement_access_events"("userAccountId");
CREATE INDEX "statement_access_events_organizationId_occurredAt_idx" ON "statement_access_events"("organizationId", "occurredAt");

ALTER TABLE "donors" ADD CONSTRAINT "donors_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "donors" ADD CONSTRAINT "donors_userAccountId_fkey" FOREIGN KEY ("userAccountId") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "households" ADD CONSTRAINT "households_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "households" ADD CONSTRAINT "households_primaryDonorId_fkey" FOREIGN KEY ("primaryDonorId") REFERENCES "donors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "households" ADD CONSTRAINT "households_preferredStatementRecipientId_fkey" FOREIGN KEY ("preferredStatementRecipientId") REFERENCES "donors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "household_memberships" ADD CONSTRAINT "household_memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "household_memberships" ADD CONSTRAINT "household_memberships_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "household_memberships" ADD CONSTRAINT "household_memberships_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "donors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offering_types" ADD CONSTRAINT "offering_types_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offering_batches" ADD CONSTRAINT "offering_batches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offering_batches" ADD CONSTRAINT "offering_batches_createdByUserAccountId_fkey" FOREIGN KEY ("createdByUserAccountId") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "donations" ADD CONSTRAINT "donations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "donations" ADD CONSTRAINT "donations_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "donors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "donations" ADD CONSTRAINT "donations_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "offering_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "donation_allocations" ADD CONSTRAINT "donation_allocations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "donation_allocations" ADD CONSTRAINT "donation_allocations_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "donations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "donation_allocations" ADD CONSTRAINT "donation_allocations_offeringTypeId_fkey" FOREIGN KEY ("offeringTypeId") REFERENCES "offering_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contribution_statements" ADD CONSTRAINT "contribution_statements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contribution_statements" ADD CONSTRAINT "contribution_statements_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "donors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contribution_statements" ADD CONSTRAINT "contribution_statements_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contribution_statements" ADD CONSTRAINT "contribution_statements_generatedByUserAccountId_fkey" FOREIGN KEY ("generatedByUserAccountId") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "statement_access_events" ADD CONSTRAINT "statement_access_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "statement_access_events" ADD CONSTRAINT "statement_access_events_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "contribution_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "statement_access_events" ADD CONSTRAINT "statement_access_events_userAccountId_fkey" FOREIGN KEY ("userAccountId") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
