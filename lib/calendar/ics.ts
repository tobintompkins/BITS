const CRLF = "\r\n";
const ICS_LINE_LIMIT = 75;

export function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

export function foldIcsLine(line: string) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= ICS_LINE_LIMIT) return line;

  const parts: string[] = [];
  let offset = 0;
  let limit = ICS_LINE_LIMIT;
  while (offset < bytes.length) {
    let end = Math.min(offset + limit, bytes.length);
    while (end > offset && (bytes[end] & 0xc0) === 0x80) {
      end -= 1;
    }
    if (end === offset) {
      end = Math.min(offset + limit, bytes.length);
    }
    parts.push(bytes.subarray(offset, end).toString("utf8"));
    offset = end;
    limit = ICS_LINE_LIMIT - 1;
  }
  return parts.map((part, index) => (index === 0 ? part : ` ${part}`)).join(CRLF);
}

export function formatIcsUtc(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function isValidIcsTimeZone(timeZone: string) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

export function formatIcsLocalDateTime(date: Date, timeZone: string) {
  const part = zonedParts(date, timeZone);
  return `${part.year}${part.month}${part.day}T${part.hour}${part.minute}${part.second}`;
}

export function formatIcsLocalDate(date: Date, timeZone: string) {
  const part = zonedParts(date, timeZone);
  return `${part.year}${part.month}${part.day}`;
}

export function addIcsDateDays(yyyymmdd: string, days: number) {
  const year = Number(yyyymmdd.slice(0, 4));
  const month = Number(yyyymmdd.slice(4, 6));
  const day = Number(yyyymmdd.slice(6, 8));
  const next = new Date(Date.UTC(year, month - 1, day + days));
  const y = String(next.getUTCFullYear()).padStart(4, "0");
  const m = String(next.getUTCMonth() + 1).padStart(2, "0");
  const d = String(next.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function icsLine(name: string, value: string, params = "") {
  return foldIcsLine(`${name}${params}:${value}`);
}

export function buildEventIcs(input: {
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  start: Date;
  end: Date | null;
  timeZone?: string | null;
  isAllDay: boolean;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const timeZone =
    input.timeZone && isValidIcsTimeZone(input.timeZone)
      ? input.timeZone
      : null;
  const start = input.start;
  const end =
    input.end && input.end.getTime() > start.getTime()
      ? input.end
      : new Date(start.getTime() + 60 * 60 * 1000);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BITS//Member Event Registration//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  if (timeZone) {
    lines.push(icsLine("X-WR-TIMEZONE", escapeIcsText(timeZone)));
  }
  lines.push("BEGIN:VEVENT");
  lines.push(icsLine("UID", input.uid));
  lines.push(icsLine("DTSTAMP", formatIcsUtc(now)));

  if (input.isAllDay) {
    const startDate = formatIcsLocalDate(start, timeZone ?? "UTC");
    const endDate = formatIcsLocalDate(end, timeZone ?? "UTC");
    const exclusiveEnd =
      endDate > startDate ? addIcsDateDays(endDate, 1) : addIcsDateDays(startDate, 1);
    lines.push(icsLine("DTSTART", startDate, ";VALUE=DATE"));
    lines.push(icsLine("DTEND", exclusiveEnd, ";VALUE=DATE"));
  } else if (timeZone) {
    const tzParam = `;TZID=${timeZone}`;
    lines.push(icsLine("DTSTART", formatIcsLocalDateTime(start, timeZone), tzParam));
    lines.push(icsLine("DTEND", formatIcsLocalDateTime(end, timeZone), tzParam));
  } else {
    lines.push(icsLine("DTSTART", formatIcsUtc(start)));
    lines.push(icsLine("DTEND", formatIcsUtc(end)));
  }

  lines.push(icsLine("SUMMARY", escapeIcsText(input.title)));
  if (input.description?.trim()) {
    lines.push(icsLine("DESCRIPTION", escapeIcsText(input.description.trim())));
  }
  if (input.location?.trim()) {
    lines.push(icsLine("LOCATION", escapeIcsText(input.location.trim())));
  }
  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");
  return `${lines.join(CRLF)}${CRLF}`;
}
