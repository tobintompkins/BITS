import { describe, expect, it } from "vitest";

import {
  LEDGER_REVIEW_SCHEMA_COPY,
  isLedgerReviewSchemaMissingError,
  ledgerReviewSchemaFailureMessage,
} from "./ledger-review-schema-error";

describe("ledger review schema missing-error mapping", () => {
  it("maps Prisma missing reviewVersion column errors to operator copy", () => {
    const error = {
      code: "P2022",
      meta: { modelName: "OfferingBatch", column: "reviewVersion" },
      message: "The column `reviewVersion` does not exist in the current database.",
    };
    expect(isLedgerReviewSchemaMissingError(error)).toBe(true);
    expect(ledgerReviewSchemaFailureMessage(error)).toBe(LEDGER_REVIEW_SCHEMA_COPY);
    expect(LEDGER_REVIEW_SCHEMA_COPY).toMatch(/ledger:review-local-migrate/);
    expect(LEDGER_REVIEW_SCHEMA_COPY).not.toMatch(/ALTER TABLE/i);
  });

  it("maps missing ledger_create_idempotency table errors, including adapter causes", () => {
    const error = {
      name: "DriverAdapterError",
      cause: {
        originalCode: "42P01",
        originalMessage: 'relation "ledger_create_idempotency" does not exist',
      },
    };
    expect(isLedgerReviewSchemaMissingError(error)).toBe(true);
  });

  it("does not treat unrelated missing tables or generic write failures as schema-not-ready", () => {
    expect(
      isLedgerReviewSchemaMissingError({
        code: "P2021",
        meta: { table: "staff_invitations" },
        message: "The table `staff_invitations` does not exist in the current database.",
      }),
    ).toBe(false);
    expect(isLedgerReviewSchemaMissingError(new Error("audit write failed"))).toBe(
      false,
    );
    expect(ledgerReviewSchemaFailureMessage(new Error("audit write failed"))).toBeNull();
  });
});
