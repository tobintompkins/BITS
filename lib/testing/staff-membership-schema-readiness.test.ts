import { describe, expect, it } from "vitest";

import {
  classifyStaffMembershipVersionSchema,
  staffMembershipSchemaReadinessMessage,
} from "@/lib/testing/staff-membership-schema-readiness";

const matchingColumn = {
  dataType: "integer",
  isNullable: "NO",
  columnDefault: "1",
};

describe("staff membership version schema classification", () => {
  it("is pending when the column and history are both absent", () => {
    expect(
      classifyStaffMembershipVersionSchema({ column: null, migration: null }),
    ).toEqual({ status: "pending" });
  });

  it("is ready when the matching column and finished migration are both present", () => {
    expect(
      classifyStaffMembershipVersionSchema({
        column: matchingColumn,
        migration: {
          finishedAt: "2026-10-14T17:00:00.000Z",
          rolledBackAt: null,
        },
      }),
    ).toEqual({ status: "ready", column: matchingColumn });
  });

  it("records column-without-history drift instead of treating ALTER TABLE as success", () => {
    const state = classifyStaffMembershipVersionSchema({
      column: matchingColumn,
      migration: null,
    });
    expect(state.status).toBe("drift_column_without_history");
    expect(staffMembershipSchemaReadinessMessage(state)).toMatch(
      /not in _prisma_migrations/i,
    );
    expect(staffMembershipSchemaReadinessMessage(state)).toMatch(
      /do not alter table/i,
    );
  });

  it("is incompatible when history exists without the column", () => {
    expect(
      classifyStaffMembershipVersionSchema({
        column: null,
        migration: {
          finishedAt: "2026-10-14T17:00:00.000Z",
          rolledBackAt: null,
        },
      }).status,
    ).toBe("incompatible");
  });
});
