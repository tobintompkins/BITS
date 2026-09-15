CREATE TYPE "StatementVoidRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "statement_void_requests" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "contributionStatementId" UUID NOT NULL,
  "status" "StatementVoidRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT NOT NULL,
  "requestedByUserAccountId" UUID NOT NULL,
  "reviewedByUserAccountId" UUID,
  "reviewNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "statement_void_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "statement_void_requests_organizationId_status_createdAt_idx" ON "statement_void_requests"("organizationId", "status", "createdAt");
CREATE INDEX "statement_void_requests_contributionStatementId_createdAt_idx" ON "statement_void_requests"("contributionStatementId", "createdAt");
CREATE INDEX "statement_void_requests_requestedByUserAccountId_idx" ON "statement_void_requests"("requestedByUserAccountId");
CREATE INDEX "statement_void_requests_reviewedByUserAccountId_idx" ON "statement_void_requests"("reviewedByUserAccountId");

CREATE UNIQUE INDEX "statement_void_requests_one_pending_per_statement_key"
  ON "statement_void_requests" ("contributionStatementId")
  WHERE "status" = 'PENDING';

ALTER TABLE "statement_void_requests" ADD CONSTRAINT "statement_void_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "statement_void_requests" ADD CONSTRAINT "statement_void_requests_contributionStatementId_fkey" FOREIGN KEY ("contributionStatementId") REFERENCES "contribution_statements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "statement_void_requests" ADD CONSTRAINT "statement_void_requests_requestedByUserAccountId_fkey" FOREIGN KEY ("requestedByUserAccountId") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "statement_void_requests" ADD CONSTRAINT "statement_void_requests_reviewedByUserAccountId_fkey" FOREIGN KEY ("reviewedByUserAccountId") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
