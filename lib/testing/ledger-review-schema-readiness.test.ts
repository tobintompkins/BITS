import { describe, expect, it } from "vitest";

import {
  LEDGER_REVIEW_MIGRATION,
  classifyLedgerReviewLocalMigratePlan,
  classifyLedgerReviewSchema,
  ledgerReviewSchemaReadinessMessage,
} from "./ledger-review-schema-readiness";

const PREREQ = "20261014180000_add_staff_invitations";

describe("ledger review schema classification", () => {
  it("is pending when the column, table, and history are all absent", () => {
    expect(
      classifyLedgerReviewSchema({
        versionColumnExists: false,
        tableExists: false,
        migrationFinishedAt: null,
        migrationRolledBackAt: null,
      }),
    ).toEqual({ status: "pending" });
  });

  it("is ready when the column, table, and finished migration are present", () => {
    expect(
      classifyLedgerReviewSchema({
        versionColumnExists: true,
        tableExists: true,
        migrationFinishedAt: "2026-10-14T20:00:00.000Z",
        migrationRolledBackAt: null,
      }),
    ).toEqual({ status: "ready" });
  });

  it("records table-without-history drift instead of treating ALTER TABLE as success", () => {
    const state = classifyLedgerReviewSchema({
      versionColumnExists: true,
      tableExists: true,
      migrationFinishedAt: null,
      migrationRolledBackAt: null,
    });
    expect(state.status).toBe("drift_table_without_history");
    expect(ledgerReviewSchemaReadinessMessage(state)).toMatch(/ALTER TABLE/);
  });
});

describe("ledger review local migrate plan", () => {
  it("allows deploy only when the review migration is the sole pending checked-in migration", () => {
    expect(
      classifyLedgerReviewLocalMigratePlan({
        appliedNames: [PREREQ],
        checkedInNames: [PREREQ, LEDGER_REVIEW_MIGRATION],
        unresolvedCount: 0,
        prerequisiteMigration: PREREQ,
        targetMigration: LEDGER_REVIEW_MIGRATION,
      }),
    ).toEqual({ ok: true, pending: [LEDGER_REVIEW_MIGRATION] });
  });

  it("refuses extra pending checked-in migrations", () => {
    const plan = classifyLedgerReviewLocalMigratePlan({
      appliedNames: [PREREQ],
      checkedInNames: [PREREQ, LEDGER_REVIEW_MIGRATION, "20261015000000_other"],
      unresolvedCount: 0,
      prerequisiteMigration: PREREQ,
      targetMigration: LEDGER_REVIEW_MIGRATION,
    });
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.reason).toMatch(/pending migrations are not exactly/i);
  });
});
