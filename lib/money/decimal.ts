import Decimal from "decimal.js";

const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;
const MAX_MONEY = new Decimal("9999999999.99");

export function parseMoneyInput(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (trimmed === "") return null;
  if (!MONEY_PATTERN.test(trimmed)) {
    throw new Error("Enter a valid dollar amount.");
  }
  const amount = new Decimal(trimmed);
  if (amount.isNegative() || amount.gt(MAX_MONEY)) {
    throw new Error("Enter a valid dollar amount.");
  }
  return amount.toFixed(2);
}

export function formatMoney(value: string | number | Decimal | null | undefined) {
  if (value == null || value === "") return "—";
  const [whole, fraction] = new Decimal(value.toString()).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${grouped}.${fraction}`;
}

export function moneyDifference(
  expected: string | null | undefined,
  recorded: string | number | Decimal,
) {
  if (expected == null || expected === "") return null;
  return new Decimal(expected).minus(recorded.toString()).toFixed(2);
}

export function parsePositiveMoneyInput(value: string | null | undefined) {
  const parsed = parseMoneyInput(value);
  if (parsed == null || new Decimal(parsed).isZero()) {
    throw new Error("Enter an amount greater than zero.");
  }
  return parsed;
}

export function isValidMoneyInput(value: string) {
  try {
    parseMoneyInput(value);
    return true;
  } catch {
    return false;
  }
}

export function isValidPositiveMoneyInput(value: string) {
  try {
    parsePositiveMoneyInput(value);
    return true;
  } catch {
    return false;
  }
}

export function sumMoneyAmounts(values: Array<string | number | Decimal>) {
  let total = new Decimal(0);
  for (const value of values) {
    total = total.plus(value.toString());
  }
  return total.toFixed(2);
}

export function moneyEquals(
  left: string | number | Decimal,
  right: string | number | Decimal,
) {
  return new Decimal(left.toString()).equals(new Decimal(right.toString()));
}

export function moneyIsPositive(value: string | number | Decimal) {
  return new Decimal(value.toString()).gt(0);
}

export function moneyLessThanOrEqual(
  left: string | number | Decimal,
  right: string | number | Decimal,
) {
  return new Decimal(left.toString()).lte(new Decimal(right.toString()));
}
