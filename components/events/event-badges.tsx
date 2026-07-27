import {
  eventStatusOptions,
  eventVisibilityOptions,
  formatEventEnumLabel,
} from "@/lib/constants/events";

const badgeBase =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium";

const statusStyles: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  PUBLISHED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  CANCELLED: "bg-red-100 text-red-800 line-through dark:bg-red-950 dark:text-red-200",
  COMPLETED: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  ARCHIVED: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

const visibilityStyles: Record<string, string> = {
  PUBLIC: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  MEMBERS_ONLY: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  STAFF_ONLY: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  PRIVATE: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

export function EventStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`${badgeBase} ${statusStyles[status] ?? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}
    >
      {formatEventEnumLabel(eventStatusOptions, status)}
    </span>
  );
}

export function EventVisibilityBadge({ visibility }: { visibility: string }) {
  return (
    <span
      className={`${badgeBase} ${visibilityStyles[visibility] ?? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}
    >
      {formatEventEnumLabel(eventVisibilityOptions, visibility)}
    </span>
  );
}

export function RegistrationBadge({
  required,
  capacity,
}: {
  required: boolean;
  capacity?: number | null;
}) {
  if (!required) {
    return (
      <span className={`${badgeBase} bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400`}>
        Open
      </span>
    );
  }
  return (
    <span className={`${badgeBase} bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200`}>
      Registration{capacity ? ` · ${capacity}` : ""}
    </span>
  );
}
