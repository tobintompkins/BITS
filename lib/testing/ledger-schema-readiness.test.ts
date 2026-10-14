import { describe, expect, it } from "vitest";

import {
  classifyLedgerSchema,
  ledgerSchemaReadinessMessage,
} from "./ledger-schema-readiness";

describe("ledger schema readiness", () => {
  it("is ready only when all three ledger tables exist", () => {
    expect(
      classifyLedgerSchema([
        "offering_batches",
        "donations",
        "donation_allocations",
      ]),
    ).toEqual({ status: "ready" });
  });

  it("is missing when any ledger table is absent", () => {
    const state = classifyLedgerSchema(["offering_batches", "donations"]);
    expect(state.status).toBe("missing");
    expect(ledgerSchemaReadinessMessage(state)).toMatch(
      /donation_allocations/i,
    );
    expect(ledgerSchemaReadinessMessage(state)).toMatch(/ALTER TABLE/);
  });
});