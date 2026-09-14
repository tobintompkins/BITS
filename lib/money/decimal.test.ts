import { describe, expect, it } from "vitest";

import {
  moneyDifference,
  moneyEquals,
  moneyIsPositive,
  parseMoneyInput,
  parsePositiveMoneyInput,
  sumMoneyAmounts,
} from "./decimal";

describe("decimal money helpers", () => {
  it("normalizes valid amounts without floating-point leftovers", () => {
    expect(parseMoneyInput("10")).toBe("10.00");
    expect(parseMoneyInput("10.1")).toBe("10.10");
    expect(parseMoneyInput("0")).toBe("0.00");
    expect(moneyDifference("10.00", "9.90")).toBe("0.10");
    expect(moneyDifference("0.30", "0.10")).toBe("0.20");
    expect(sumMoneyAmounts(["10.10", "0.20", "0.01"])).toBe("10.31");
    expect(moneyEquals(sumMoneyAmounts(["0.10", "0.20"]), "0.30")).toBe(true);
    expect(parsePositiveMoneyInput("1.00")).toBe("1.00");
    expect(moneyIsPositive("0.01")).toBe(true);
    expect(moneyIsPositive("0.00")).toBe(false);
  });

  it("rejects invalid or negative money", () => {
    expect(() => parseMoneyInput("-1.00")).toThrow();
    expect(() => parseMoneyInput("12.345")).toThrow();
    expect(() => parseMoneyInput("abc")).toThrow();
    expect(() => parseMoneyInput("10.1.2")).toThrow();
    expect(parseMoneyInput("")).toBeNull();
    expect(parseMoneyInput("   ")).toBeNull();
    expect(() => parsePositiveMoneyInput("0")).toThrow();
    expect(() => parsePositiveMoneyInput("0.00")).toThrow();
  });
});
