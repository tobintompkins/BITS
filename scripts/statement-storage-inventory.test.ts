import { describe, expect, it } from "vitest";

import { refuseApplyMigration } from "./statement-storage-inventory";

describe("statement storage inventory CLI", () => {
  it("refuses --apply and stays a dry run by default", () => {
    expect(refuseApplyMigration(["--apply"])).toBe(true);
    expect(refuseApplyMigration([])).toBe(false);
  });
});
