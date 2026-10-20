import { describe, expect, it } from "vitest";

import {
  READY_GIVING_HOUSEHOLD_INDEX_SHAPE,
  classifyGivingHouseholdSchema,
  givingHouseholdSchemaReadinessMessage,
  normalizeGivingHouseholdIndexPredicate,
  type GivingHouseholdIndexShape,
} from "./giving-household-schema-readiness";

const applied = {
  migrationFinishedAt: new Date(),
  migrationRolledBackAt: null,
};

describe("giving household schema readiness", () => {
  it("is ready only when the catalog shape and migration history agree", () => {
    expect(
      classifyGivingHouseholdSchema({
        index: READY_GIVING_HOUSEHOLD_INDEX_SHAPE,
        ...applied,
      }),
    ).toEqual({ status: "ready" });
    expect(
      normalizeGivingHouseholdIndexPredicate(`("endDate" IS NULL)`),
    ).toBe("enddate is null");
  });

  it("stays pending when both the index and history are missing", () => {
    const state = classifyGivingHouseholdSchema({
      index: null,
      migrationFinishedAt: null,
      migrationRolledBackAt: null,
    });
    expect(state.status).toBe("pending");
    expect(givingHouseholdSchemaReadinessMessage(state)).toMatch(/isolated bits_e2e/i);
  });

  it("rejects a well-shaped index without migration history", () => {
    expect(
      classifyGivingHouseholdSchema({
        index: READY_GIVING_HOUSEHOLD_INDEX_SHAPE,
        migrationFinishedAt: null,
        migrationRolledBackAt: null,
      }).status,
    ).toBe("drift_index_without_history");
  });

  it("rejects rolled-back history even when the index looks ready", () => {
    expect(
      classifyGivingHouseholdSchema({
        index: READY_GIVING_HOUSEHOLD_INDEX_SHAPE,
        migrationFinishedAt: new Date(),
        migrationRolledBackAt: new Date(),
      }).status,
    ).toBe("drift_index_without_history");
  });

  it.each([
    [
      "non-unique",
      { ...READY_GIVING_HOUSEHOLD_INDEX_SHAPE, unique: false },
    ],
    [
      "wrong table",
      { ...READY_GIVING_HOUSEHOLD_INDEX_SHAPE, tableName: "households" },
    ],
    [
      "wrong column order",
      {
        ...READY_GIVING_HOUSEHOLD_INDEX_SHAPE,
        columns: ["donorId", "organizationId"] as string[],
      },
    ],
    [
      "missing predicate",
      { ...READY_GIVING_HOUSEHOLD_INDEX_SHAPE, predicate: null },
    ],
    [
      "invalid",
      { ...READY_GIVING_HOUSEHOLD_INDEX_SHAPE, valid: false },
    ],
  ])("rejects a malformed %s index", (_label, index) => {
    const state = classifyGivingHouseholdSchema({
      index: index as GivingHouseholdIndexShape,
      ...applied,
    });
    expect(state.status).toBe("incompatible");
    if (state.status === "incompatible") {
      expect(state.detail).toMatch(/malformed/i);
    }
  });
});
