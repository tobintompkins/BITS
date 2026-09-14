import Decimal from "decimal.js";

import { sumMoneyAmounts } from "@/lib/money/decimal";

/**
 * Preview lines are grouped by offering date and fund. Each gift’s
 * deductibleAmount is spread across its fund allocations in proportion to
 * allocation amount / gift total. The last line receives any rounding
 * remainder so the gift’s lines sum to that gift’s deductibleAmount.
 *
 * The statement total is always the sum of gift-level deductibleAmount
 * values, never the sum of raw allocation amounts. Stored financial values
 * are not changed.
 */
export function previewLinesForGift(gift: {
  offeringDate: Date;
  totalAmount: { toString(): string } | string;
  deductibleAmount: { toString(): string } | string;
  allocations: Array<{
    amount: { toString(): string } | string;
    fundName: string;
  }>;
}) {
  const allocations = gift.allocations.length
    ? gift.allocations
    : [{ amount: gift.totalAmount, fundName: "Unallocated" }];
  const deductible = new Decimal(gift.deductibleAmount.toString());
  const total = new Decimal(gift.totalAmount.toString());
  let remaining = deductible;

  return allocations.map((allocation, index) => {
    const isLast = index === allocations.length - 1;
    let lineAmount: Decimal;
    if (isLast) {
      lineAmount = remaining;
    } else if (total.isZero()) {
      lineAmount = new Decimal(0);
    } else {
      lineAmount = deductible
        .times(allocation.amount.toString())
        .div(total)
        .toDecimalPlaces(2);
      remaining = remaining.minus(lineAmount);
    }
    return {
      offeringDate: gift.offeringDate,
      fundName: allocation.fundName,
      deductibleAmount: lineAmount.toFixed(2),
    };
  });
}

export function groupPreviewLines(
  lines: Array<{
    offeringDate: Date;
    fundName: string;
    deductibleAmount: string;
  }>,
) {
  const grouped = new Map<
    string,
    { offeringDate: Date; fundName: string; amounts: string[] }
  >();
  for (const line of lines) {
    const dateKey = line.offeringDate.toISOString().slice(0, 10);
    const key = `${dateKey}|${line.fundName}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.amounts.push(line.deductibleAmount);
    } else {
      grouped.set(key, {
        offeringDate: line.offeringDate,
        fundName: line.fundName,
        amounts: [line.deductibleAmount],
      });
    }
  }
  return [...grouped.values()]
    .map((row) => ({
      offeringDate: row.offeringDate,
      fundName: row.fundName,
      deductibleAmount: sumMoneyAmounts(row.amounts),
    }))
    .sort((left, right) => {
      const dateDelta =
        left.offeringDate.getTime() - right.offeringDate.getTime();
      if (dateDelta !== 0) return dateDelta;
      return left.fundName.localeCompare(right.fundName);
    });
}
