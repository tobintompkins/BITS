function localParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function timeZoneOffsetMs(instant: Date, timeZone: string) {
  const local = localParts(instant, timeZone);
  const asUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  );
  return asUtc - instant.getTime();
}

export function resolveChurchTimeZone(timeZone: string | null | undefined) {
  const candidate = timeZone?.trim() || "America/New_York";
  try {
    Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return "America/New_York";
  }
}

export function zonedDayStartUtc(ymd: string, timeZone: string) {
  const [year, month, day] = ymd.split("-").map(Number);
  if (!year || !month || !day) {
    throw new Error("Enter a valid calendar date.");
  }
  const zone = resolveChurchTimeZone(timeZone);
  let utc = Date.UTC(year, month - 1, day, 0, 0, 0);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const offset = timeZoneOffsetMs(new Date(utc), zone);
    const next = Date.UTC(year, month - 1, day, 0, 0, 0) - offset;
    if (next === utc) {
      return new Date(utc);
    }
    utc = next;
  }
  return new Date(utc);
}

export function exclusiveZonedDayEndUtc(ymdInclusiveEnd: string, timeZone: string) {
  const start = zonedDayStartUtc(ymdInclusiveEnd, timeZone);
  const nextLocal = new Date(start.getTime() + 36 * 60 * 60 * 1000);
  const nextYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: resolveChurchTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(nextLocal);
  return zonedDayStartUtc(nextYmd, timeZone);
}

export function formatInTimeZone(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: resolveChurchTimeZone(timeZone),
  }).format(value);
}
