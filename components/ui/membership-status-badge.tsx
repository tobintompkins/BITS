import type { MembershipStatusValue } from "@/lib/constants/membership-status";
import { formatMembershipStatus } from "@/lib/constants/membership-status";

const statusStyles: Record<MembershipStatusValue, string> = {
  VISITOR:
    "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  REGULAR_ATTENDER:
    "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  MEMBER:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  INACTIVE:
    "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  TRANSFERRED:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  DECEASED:
    "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200",
};

export function MembershipStatusBadge({
  status,
}: {
  status: MembershipStatusValue;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[status]}`}
    >
      {formatMembershipStatus(status)}
    </span>
  );
}
