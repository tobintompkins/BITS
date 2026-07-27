-- Blueprint 6.7 performance indexes for member directory, care, and duplicate scan.

-- Member lookup / filter indexes
CREATE INDEX IF NOT EXISTS "members_organizationId_email_idx" ON "members"("organizationId", "email");
CREATE INDEX IF NOT EXISTS "members_organizationId_phone_idx" ON "members"("organizationId", "phone");
CREATE INDEX IF NOT EXISTS "members_organizationId_archivedAt_idx" ON "members"("organizationId", "archivedAt");
CREATE INDEX IF NOT EXISTS "members_organizationId_deceasedDate_idx" ON "members"("organizationId", "deceasedDate");
CREATE INDEX IF NOT EXISTS "members_organizationId_createdAt_idx" ON "members"("organizationId", "createdAt");

-- Attendance
CREATE INDEX IF NOT EXISTS "member_attendances_organizationId_attendanceType_idx" ON "member_attendances"("organizationId", "attendanceType");

-- Follow-ups
CREATE INDEX IF NOT EXISTS "member_follow_ups_organizationId_priority_idx" ON "member_follow_ups"("organizationId", "priority");

-- Pastoral care
CREATE INDEX IF NOT EXISTS "pastoral_care_notes_organizationId_category_idx" ON "pastoral_care_notes"("organizationId", "category");
CREATE INDEX IF NOT EXISTS "pastoral_care_notes_organizationId_followUpDate_idx" ON "pastoral_care_notes"("organizationId", "followUpDate");
CREATE INDEX IF NOT EXISTS "pastoral_care_notes_organizationId_isConfidential_idx" ON "pastoral_care_notes"("organizationId", "isConfidential");

-- Communications
CREATE INDEX IF NOT EXISTS "member_communications_organizationId_communicationType_idx" ON "member_communications"("organizationId", "communicationType");
CREATE INDEX IF NOT EXISTS "member_communications_organizationId_followUpDate_idx" ON "member_communications"("organizationId", "followUpDate");

-- Documents
CREATE INDEX IF NOT EXISTS "member_documents_organizationId_isConfidential_idx" ON "member_documents"("organizationId", "isConfidential");

-- Consent history
CREATE INDEX IF NOT EXISTS "member_consent_history_consentType_idx" ON "member_consent_history"("consentType");

-- Duplicate candidates (pair lookups; unique already covers (memberAId, memberBId))
CREATE INDEX IF NOT EXISTS "member_duplicate_candidates_memberAId_idx" ON "member_duplicate_candidates"("memberAId");
CREATE INDEX IF NOT EXISTS "member_duplicate_candidates_memberBId_idx" ON "member_duplicate_candidates"("memberBId");
