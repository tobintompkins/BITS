export function currentStatementYear(now = new Date()) {
  return now.getUTCFullYear();
}

export function statementYearBounds(now = new Date()) {
  const current = currentStatementYear(now);
  return { min: current - 10, max: current + 1, current };
}

export function parseStatementReadinessYear(
  value: string | string[] | undefined,
  now = new Date(),
) {
  const { min, max, current } = statementYearBounds(now);
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw?.trim() ?? "", 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return current;
  }
  return parsed;
}

export function statementYearDateRange(year: number) {
  return {
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year + 1, 0, 1)),
  };
}
