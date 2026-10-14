import { describe, expect, it } from "vitest";

import {
  STAFF_INVITATION_MIGRATION,
  classifyStaffInvitationLocalMigratePlan,
  classifyStaffInvitationSchema,
  staffInvitationSchemaReadinessMessage,
} from "./staff-invitation-schema-readiness";

const PREREQ = "20261014130000_add_organization_membership_version";

describe("staff invitation schema classification", () => {
  it("is pending when the table and history are both absent", () => {
    expect(
      classifyStaffInvitationSchema({
        tableExists: false,
        migrationFinishedAt: null,
        migrationRolledBackAt: null,
      }),
    ).toEqual({ status: "pending" });
  });

  it("is ready when the table and finished migration are both present", () => {
    expect(
      classifyStaffInvitationSchema({
        tableExists: true,
        migrationFinishedAt: "2026-10-14T18:00:00.000Z",
        migrationRolledBackAt: null,
      }),
    ).toEqual({ status: "ready" });
  });

  it("records table-without-history drift instead of treating ALTER TABLE as success", () => {
    const state = classifyStaffInvitationSchema({
      tableExists: true,
      migrationFinishedAt: null,
      migrationRolledBackAt: null,
    });
    expect(state.status).toBe("drift_table_without_history");
    expect(staffInvitationSchemaReadinessMessage(state)).toMatch(
      /do not alter table/i,
    );
  });
});

describe("staff invitation local migrate plan", () => {
  const checkedIn = [PREREQ, STAFF_INVITATION_MIGRATION, "20261015000000_unrelated"];

  it("allows deploy only when the invitation migration is the sole pending checked-in migration", () => {
    expect(
      classifyStaffInvitationLocalMigratePlan({
        appliedNames: [PREREQ],
        checkedInNames: [PREREQ, STAFF_INVITATION_MIGRATION],
        unresolvedCount: 0,
        prerequisiteMigration: PREREQ,
        targetMigration: STAFF_INVITATION_MIGRATION,
      }),
    ).toEqual({ ok: true, pending: [STAFF_INVITATION_MIGRATION] });
  });

  it("refuses extra pending checked-in migrations instead of matching only the target name", () => {
    const plan = classifyStaffInvitationLocalMigratePlan({
      appliedNames: [PREREQ],
      checkedInNames: checkedIn,
      unresolvedCount: 0,
      prerequisiteMigration: PREREQ,
      targetMigration: STAFF_INVITATION_MIGRATION,
    });
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.reason).toMatch(/pending migrations are not exactly/i);
    }
  });

  it("refuses unresolved migration history", () => {
    const plan = classifyStaffInvitationLocalMigratePlan({
      appliedNames: [PREREQ],
      checkedInNames: [PREREQ, STAFF_INVITATION_MIGRATION],
      unresolvedCount: 1,
      prerequisiteMigration: PREREQ,
      targetMigration: STAFF_INVITATION_MIGRATION,
    });
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.reason).toMatch(/unresolved migration history/i);
    }
  });
});
