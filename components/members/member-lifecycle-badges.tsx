import {
  formatLifecycleEnumLabel,
  memberRecordStatusOptions,
} from "@/lib/constants/member-lifecycle";

const recordStatusStyles: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  INACTIVE: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  ARCHIVED: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  DECEASED: "bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-200",
  MERGED: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
};

export function MemberRecordStatusBadge({
  status,
}: {
  status: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        recordStatusStyles[status] ?? recordStatusStyles.INACTIVE
      }`}
    >
      {formatLifecycleEnumLabel(memberRecordStatusOptions, status)}
    </span>
  );
}

export function DoNotContactBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-200">
      Do Not Contact
    </span>
  );
}

export function MemberLifecycleBanner({
  recordStatus,
  archiveReason,
  deceasedDate,
  mergedIntoMemberId,
  mergedIntoName,
}: {
  recordStatus: string;
  archiveReason?: string | null;
  deceasedDate?: Date | null;
  mergedIntoMemberId?: string | null;
  mergedIntoName?: string | null;
}) {
  if (recordStatus === "ARCHIVED") {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
        This member record is archived
        {archiveReason ? ` (${archiveReason})` : ""}. It is hidden from the
        default directory.
      </div>
    );
  }
  if (recordStatus === "DECEASED") {
    return (
      <div className="rounded-md border border-stone-300 bg-stone-100 px-4 py-3 text-sm text-stone-800 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">
        This member is marked deceased
        {deceasedDate
          ? ` as of ${deceasedDate.toLocaleDateString()}`
          : ""}
        . Communications and directory listing are disabled.
      </div>
    );
  }
  if (recordStatus === "MERGED") {
    return (
      <div className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100">
        This record was merged into another member
        {mergedIntoName ? ` (${mergedIntoName})` : ""}.
        {mergedIntoMemberId ? (
          <>
            {" "}
            <a
              href={`/member/${mergedIntoMemberId}`}
              className="font-medium underline underline-offset-2"
            >
              View primary record
            </a>
          </>
        ) : null}
      </div>
    );
  }
  return null;
}
