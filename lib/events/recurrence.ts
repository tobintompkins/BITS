/**
 * Event recurrence helpers (RFC 5545 RRULE-compatible subset).
 *
 * Patch 7.1 supports: NONE, DAILY, WEEKLY, BIWEEKLY, MONTHLY, and CUSTOM RRULE strings.
 * Occurrence generation is bounded (default 12 months) and never creates unlimited rows.
 * Future patches may move generation to a background job.
 */

import { EVENT_OCCURRENCE_WINDOW_MONTHS } from "@/lib/constants/events";

export type RecurrencePreset =
  | "NONE"
  | "DAILY"
  | "WEEKLY"
  | "BIWEEKLY"
  | "MONTHLY"
  | "CUSTOM";

export type RecurrenceInput = {
  preset: RecurrencePreset;
  /** Comma-separated BYDAY values e.g. SU,WE */
  byDay?: string;
  interval?: number;
  count?: number;
  until?: Date | null;
  /** Custom RRULE body without the RRULE: prefix */
  customRule?: string;
};

const WEEKDAY_MAP = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

export function buildRRule(input: RecurrenceInput): string | null {
  if (input.preset === "NONE") return null;
  if (input.preset === "CUSTOM") {
    const rule = input.customRule?.trim();
    if (!rule) throw new Error("Custom recurrence rule is required.");
    return rule.replace(/^RRULE:/i, "");
  }

  const parts: string[] = [];
  const interval = Math.max(1, input.interval ?? (input.preset === "BIWEEKLY" ? 2 : 1));

  if (input.preset === "DAILY") {
    parts.push("FREQ=DAILY", `INTERVAL=${interval}`);
  } else if (input.preset === "WEEKLY" || input.preset === "BIWEEKLY") {
    parts.push("FREQ=WEEKLY", `INTERVAL=${interval}`);
    if (input.byDay?.trim()) {
      parts.push(`BYDAY=${input.byDay.trim().toUpperCase()}`);
    }
  } else if (input.preset === "MONTHLY") {
    parts.push("FREQ=MONTHLY", `INTERVAL=${interval}`);
  }

  if (input.count && input.count > 0) {
    parts.push(`COUNT=${input.count}`);
  } else if (input.until) {
    parts.push(`UNTIL=${formatRRuleDate(input.until)}`);
  }

  return parts.join(";");
}

export function validateRecurrenceRule(rule: string | null | undefined) {
  if (!rule?.trim()) return { ok: true as const };
  const normalized = rule.replace(/^RRULE:/i, "").trim();
  if (!/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/i.test(normalized)) {
    return { ok: false as const, message: "Recurrence rule must include a valid FREQ." };
  }
  if (/FREQ=SECONDLY|FREQ=MINUTELY|FREQ=HOURLY/i.test(normalized)) {
    return { ok: false as const, message: "High-frequency recurrence is not supported." };
  }
  return { ok: true as const, rule: normalized };
}

export function previewOccurrences(
  start: Date,
  end: Date,
  rule: string | null | undefined,
  options?: { windowMonths?: number; maxOccurrences?: number },
): Array<{ start: Date; end: Date }> {
  if (!rule?.trim()) {
    return [{ start, end }];
  }

  const validation = validateRecurrenceRule(rule);
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const durationMs = end.getTime() - start.getTime();
  if (durationMs < 0) {
    throw new Error("End must be after start.");
  }

  const windowMonths = options?.windowMonths ?? EVENT_OCCURRENCE_WINDOW_MONTHS;
  const maxOccurrences = options?.maxOccurrences ?? 60;
  const windowEnd = addMonths(start, windowMonths);

  const freq = /FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/i.exec(rule)?.[1]?.toUpperCase() ?? "WEEKLY";
  const interval = Number(/INTERVAL=(\d+)/i.exec(rule)?.[1] ?? "1") || 1;
  const countLimit = Number(/COUNT=(\d+)/i.exec(rule)?.[1] ?? "0") || maxOccurrences;
  const untilMatch = /UNTIL=(\d{8}(T\d{6}Z?)?)/i.exec(rule)?.[1];
  const until = untilMatch ? parseRRuleDate(untilMatch) : windowEnd;
  const byDays = (/BYDAY=([A-Z,]+)/i.exec(rule)?.[1] ?? "")
    .split(",")
    .map((d) => d.trim().toUpperCase())
    .filter(Boolean);

  const results: Array<{ start: Date; end: Date }> = [];
  let cursor = new Date(start);
  let safety = 0;

  while (results.length < Math.min(countLimit, maxOccurrences) && safety < 500) {
    safety += 1;
    if (cursor > until || cursor > windowEnd) break;

    const weekday = WEEKDAY_MAP[cursor.getUTCDay()];
    const matchesDay = byDays.length === 0 || byDays.includes(weekday);

    if (matchesDay && cursor >= start) {
      results.push({
        start: new Date(cursor),
        end: new Date(cursor.getTime() + durationMs),
      });
    }

    if (freq === "DAILY") {
      cursor = addDays(cursor, interval);
    } else if (freq === "WEEKLY") {
      if (byDays.length > 0) {
        cursor = addDays(cursor, 1);
        // Advance week when wrapping past Saturday for multi-day weekly rules
        if (cursor.getUTCDay() === 0 && results.length > 0) {
          // keep daily step within week; interval weeks applied when leaving week
        }
        // Simpler approach for weekly+interval: step one day, skip weeks via interval check
        const weeksFromStart = Math.floor(
          (cursor.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000),
        );
        if (weeksFromStart % interval !== 0 && byDays.includes(WEEKDAY_MAP[cursor.getUTCDay()])) {
          // skip non-interval weeks by jumping forward
          continue;
        }
      } else {
        cursor = addDays(cursor, 7 * interval);
      }
    } else if (freq === "MONTHLY") {
      cursor = addMonths(cursor, interval);
    } else {
      cursor = addMonths(cursor, 12 * interval);
    }
  }

  // Deduplicate by start ISO
  const seen = new Set<string>();
  return results.filter((item) => {
    const key = item.start.toISOString();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function generateOccurrences(
  start: Date,
  end: Date,
  rule: string | null | undefined,
  options?: { windowMonths?: number; maxOccurrences?: number },
) {
  return previewOccurrences(start, end, rule, options);
}

function formatRRuleDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function parseRRuleDate(value: string) {
  if (/^\d{8}$/.test(value)) {
    const y = Number(value.slice(0, 4));
    const m = Number(value.slice(4, 6)) - 1;
    const d = Number(value.slice(6, 8));
    return new Date(Date.UTC(y, m, d));
  }
  const compact = value.replace(/Z$/, "");
  const y = Number(compact.slice(0, 4));
  const m = Number(compact.slice(4, 6)) - 1;
  const d = Number(compact.slice(6, 8));
  const hh = Number(compact.slice(9, 11) || "0");
  const mm = Number(compact.slice(11, 13) || "0");
  const ss = Number(compact.slice(13, 15) || "0");
  return new Date(Date.UTC(y, m, d, hh, mm, ss));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

export function slugifyEventTitle(title: string) {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || "event";
}
