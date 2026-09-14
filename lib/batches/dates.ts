export function toDateOnlyString(value: Date | string) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

export function utcTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

export function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}
