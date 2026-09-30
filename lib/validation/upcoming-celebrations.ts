import { utcToday } from "@/lib/validation/volunteer-time-off-request";

export const UPCOMING_CELEBRATIONS_HREF = "/celebrations";
export const UPCOMING_CELEBRATIONS_MEMBERS_HREF = "/members";
export const UPCOMING_CELEBRATIONS_WINDOW_DAYS = 60;

export const UPCOMING_CELEBRATIONS_SUBTITLE =
  "Plan birthday and anniversary encouragement during the next 60 days.";

export const UPCOMING_CELEBRATIONS_NOTICE =
  "This private planning list does not send messages or publish names.";

export const UPCOMING_CELEBRATIONS_EMPTY_COPY =
  "No birthdays or recorded marriage anniversaries are scheduled in the next 60 days.";

export const UPCOMING_CELEBRATION_KINDS = ["Birthday", "Anniversary"] as const;
export type UpcomingCelebrationKind = (typeof UPCOMING_CELEBRATION_KINDS)[number];

export type UpcomingCelebrationRow = {
  kind: UpcomingCelebrationKind;
  displayName: string;
  occurrenceLabel: string;
  monthDayLabel: string;
  daysAway: number;
};

export type UpcomingCelebrationCounts = {
  birthdays: number;
  anniversaries: number;
};

export type UpcomingCelebrationNavItem = {
  href: string;
  label: string;
};

export type UpcomingCelebrationMemberInput = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  dateOfBirth: Date | null;
};

export type UpcomingCelebrationMarriageInput = {
  milestoneDate: Date;
  member: UpcomingCelebrationMemberInput;
};

type DatedCelebration = UpcomingCelebrationRow & {
  occurrence: Date;
};

const MS_PER_DAY = 86_400_000;

export function upcomingCelebrationsNavItems(
  canViewMembers: boolean,
): UpcomingCelebrationNavItem[] {
  return canViewMembers
    ? [{ href: UPCOMING_CELEBRATIONS_HREF, label: "Upcoming Celebrations" }]
    : [];
}

export function celebrationDisplayName(member: {
  firstName: string;
  lastName: string;
  preferredName?: string | null;
}) {
  const first = member.preferredName?.trim() || member.firstName.trim();
  return `${first} ${member.lastName}`.replace(/\s+/g, " ").trim();
}

export function formatCelebrationMonthDay(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(value);
}

export function formatCelebrationOccurrence(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(value);
}

export function formatCelebrationDaysAway(daysAway: number) {
  if (daysAway <= 0) return "Today";
  if (daysAway === 1) return "Tomorrow";
  return `in ${daysAway} days`;
}

export function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function utcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Leap-day rule: February 29 birthdays and marriage anniversaries are
 * observed on February 28 in non-leap years, and on February 29 in leap years.
 */
export function celebrationDateInYear(
  year: number,
  month: number,
  day: number,
) {
  if (month === 2 && day === 29 && !isLeapYear(year)) {
    return utcDate(year, 2, 28);
  }
  return utcDate(year, month, day);
}

export function nextCelebrationOccurrence(
  month: number,
  day: number,
  from: Date,
) {
  const start = utcDate(
    from.getUTCFullYear(),
    from.getUTCMonth() + 1,
    from.getUTCDate(),
  );
  const thisYear = celebrationDateInYear(start.getUTCFullYear(), month, day);
  if (thisYear.getTime() >= start.getTime()) return thisYear;
  return celebrationDateInYear(start.getUTCFullYear() + 1, month, day);
}

export function celebrationDaysAway(from: Date, occurrence: Date) {
  const start = utcDate(
    from.getUTCFullYear(),
    from.getUTCMonth() + 1,
    from.getUTCDate(),
  );
  const end = utcDate(
    occurrence.getUTCFullYear(),
    occurrence.getUTCMonth() + 1,
    occurrence.getUTCDate(),
  );
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
}

function monthAndDay(value: Date) {
  return {
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  };
}

function toRow(
  kind: UpcomingCelebrationKind,
  displayName: string,
  occurrence: Date,
  daysAway: number,
): DatedCelebration {
  return {
    kind,
    displayName,
    occurrence,
    occurrenceLabel: formatCelebrationOccurrence(occurrence),
    monthDayLabel: formatCelebrationMonthDay(occurrence),
    daysAway,
  };
}

function withinWindow(daysAway: number, windowDays: number) {
  return daysAway >= 0 && daysAway <= windowDays;
}

export function collectUpcomingCelebrations(
  members: UpcomingCelebrationMemberInput[],
  marriages: UpcomingCelebrationMarriageInput[],
  now = utcToday(),
  windowDays = UPCOMING_CELEBRATIONS_WINDOW_DAYS,
) {
  const rows: DatedCelebration[] = [];

  for (const member of members) {
    if (!member.dateOfBirth) continue;
    const { month, day } = monthAndDay(member.dateOfBirth);
    const occurrence = nextCelebrationOccurrence(month, day, now);
    const daysAway = celebrationDaysAway(now, occurrence);
    if (!withinWindow(daysAway, windowDays)) continue;
    rows.push(
      toRow("Birthday", celebrationDisplayName(member), occurrence, daysAway),
    );
  }

  const seenAnniversaries = new Set<string>();
  for (const marriage of marriages) {
    const { month, day } = monthAndDay(marriage.milestoneDate);
    const key = `${marriage.member.id}:${month}-${day}`;
    if (seenAnniversaries.has(key)) continue;
    seenAnniversaries.add(key);
    const occurrence = nextCelebrationOccurrence(month, day, now);
    const daysAway = celebrationDaysAway(now, occurrence);
    if (!withinWindow(daysAway, windowDays)) continue;
    rows.push(
      toRow(
        "Anniversary",
        celebrationDisplayName(marriage.member),
        occurrence,
        daysAway,
      ),
    );
  }

  rows.sort((left, right) => {
    const byDate = left.occurrence.getTime() - right.occurrence.getTime();
    if (byDate !== 0) return byDate;
    const byName = left.displayName.localeCompare(right.displayName);
    if (byName !== 0) return byName;
    return left.kind.localeCompare(right.kind);
  });

  return {
    rows: rows.map(
      ({ kind, displayName, occurrenceLabel, monthDayLabel, daysAway }) => ({
        kind,
        displayName,
        occurrenceLabel,
        monthDayLabel,
        daysAway,
      }),
    ),
    counts: {
      birthdays: rows.filter((row) => row.kind === "Birthday").length,
      anniversaries: rows.filter((row) => row.kind === "Anniversary").length,
    } satisfies UpcomingCelebrationCounts,
  };
}
