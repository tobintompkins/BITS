import {
  attendanceTypeOptions,
  followUpPriorityOptions,
  followUpStatusOptions,
  formatEnumLabel,
  prayerPrivacyLevelOptions,
  prayerRequestStatusOptions,
} from "@/lib/constants/care-engagement";

const badgeBase =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium";

const followUpStatusStyles: Record<string, string> = {
  OPEN: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  IN_PROGRESS: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  CANCELLED: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  OVERDUE: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

const followUpPriorityStyles: Record<string, string> = {
  LOW: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  NORMAL: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  HIGH: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
  URGENT: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

const attendanceTypeStyles: Record<string, string> = {
  PRESENT: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  ABSENT: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  EXCUSED: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  ONLINE: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  VOLUNTEER: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  GUEST: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
};

const prayerStatusStyles: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  IN_PRAYER: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  ANSWERED: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  ARCHIVED: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

const prayerPrivacyStyles: Record<string, string> = {
  PUBLIC: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  PRAYER_TEAM: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  PASTORAL_STAFF: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  PRIVATE: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

export function FollowUpStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`${badgeBase} ${followUpStatusStyles[status] ?? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}
    >
      {formatEnumLabel(followUpStatusOptions, status)}
    </span>
  );
}

export function FollowUpPriorityBadge({ priority }: { priority: string }) {
  return (
    <span
      className={`${badgeBase} ${followUpPriorityStyles[priority] ?? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}
    >
      {formatEnumLabel(followUpPriorityOptions, priority)}
    </span>
  );
}

export function AttendanceTypeBadge({ type }: { type: string }) {
  return (
    <span
      className={`${badgeBase} ${attendanceTypeStyles[type] ?? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}
    >
      {formatEnumLabel(attendanceTypeOptions, type)}
    </span>
  );
}

export function PrayerStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`${badgeBase} ${prayerStatusStyles[status] ?? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}
    >
      {formatEnumLabel(prayerRequestStatusOptions, status)}
    </span>
  );
}

export function PrayerPrivacyBadge({ privacyLevel }: { privacyLevel: string }) {
  return (
    <span
      className={`${badgeBase} ${prayerPrivacyStyles[privacyLevel] ?? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}
    >
      {formatEnumLabel(prayerPrivacyLevelOptions, privacyLevel)}
    </span>
  );
}
